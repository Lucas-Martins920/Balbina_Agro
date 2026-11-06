-- Histórico de alterações: toda inclusão, edição e exclusão grava quem fez, quando e o que mudou.
--
-- A tabela audit_log existe desde o schema inicial, mas nada gravava nela. Agora um trigger
-- (app.registrar_alteracao) fica em todas as tabelas da empresa e grava uma linha por registro:
--   inclusão: a linha nova inteira em `depois`;
--   edição: só os campos que mudaram, em `antes` e `depois` (mudança só de updated_at não conta);
--   exclusão: a linha apagada inteira em `antes`.
-- Quem fez = auth.uid() (sem usuário, como webhook e rotina agendada, aparece como "Sistema").
-- O e-mail fica guardado na linha para o nome continuar aparecendo depois que a pessoa sair da empresa.
--
-- Tabela nova ganha o trigger sozinha: app.travar_referencias(), que toda migration de tabela com
-- empresa_id já chama no fim, passa a chamar app.ligar_historico() também.
-- Quem vê: permissão "historico.ver" (master e acesso total sempre). Ninguém altera nem apaga o histórico.

alter table audit_log
  alter column registro_id type text using registro_id::text,
  alter column registro_id drop not null,
  add column usuario text,
  add column resumo text,
  add column campos text[];

create index on audit_log (empresa_id, user_id, created_at desc);
create index on audit_log (empresa_id, tabela, created_at desc);

-- Só leitura, e só com a permissão do módulo. Gravar é coisa do trigger (security definer).
drop policy membros on audit_log;
create policy membros on audit_log for select using (app.pode(empresa_id, 'historico.ver'));
revoke insert, update, delete, truncate on audit_log from authenticated, anon;

-- Todos os planos incluem o histórico
update niveis_plano set modulos = modulos || 'historico'::text
where not ('*' = any(modulos) or 'historico' = any(modulos));

-- Campos que nunca vão para o histórico: segredos e conteúdo grande (XML, retorno de API).
create or replace function app.sem_campos_ocultos(p_linha jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(p_linha)
  where key not in ('payload', 'dados_extrato', 'conteudo')
    and key !~ '(senha|token|segredo|secret|cifrad|hash)'
$$;

-- tg_argv: [0] colunas da chave separadas por vírgula; [1] de onde vem a empresa: 'empresa_id', 'id'
-- (a própria tabela empresas) ou a coluna que aponta para a tabela pai em [2] (itens sem empresa_id).
create or replace function app.registrar_alteracao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb := case when tg_op <> 'INSERT' then app.sem_campos_ocultos(to_jsonb(old)) end;
  v_depois jsonb := case when tg_op <> 'DELETE' then app.sem_campos_ocultos(to_jsonb(new)) end;
  v_linha jsonb := coalesce(v_depois, v_antes);
  v_user uuid := auth.uid();
  v_empresa uuid;
  v_campos text[];
begin
  if tg_argv[1] = 'empresa_id' then
    v_empresa := (v_linha->>'empresa_id')::uuid;
  elsif tg_argv[1] = 'id' then
    v_empresa := (v_linha->>'id')::uuid;
  elsif v_linha->>tg_argv[1] is not null then
    execute format('select empresa_id from %s where id = $1', tg_argv[2]::regclass) into v_empresa using (v_linha->>tg_argv[1])::uuid;
  end if;
  -- Empresa apagada (ou item apagado junto com o pai): a exclusão do pai já ficou registrada.
  if v_empresa is null or not exists (select 1 from empresas where id = v_empresa) then return null; end if;

  if tg_op = 'UPDATE' then
    select array_agg(d.key order by d.key) into v_campos
    from jsonb_each(v_depois) d
    where d.key <> 'updated_at' and d.value is distinct from v_antes->d.key;
    if v_campos is null then return null; end if;
    select jsonb_object_agg(c, v_antes->c), jsonb_object_agg(c, v_depois->c) into v_antes, v_depois from unnest(v_campos) c;
  end if;

  insert into audit_log (empresa_id, user_id, usuario, tabela, registro_id, acao, resumo, campos, antes, depois)
  values (
    v_empresa, v_user,
    coalesce((select email from usuarios_empresa where empresa_id = v_empresa and user_id = v_user),
             (select lower(email) from auth.users where id = v_user)),
    tg_table_name,
    (select string_agg(v_linha->>c, '/') from unnest(string_to_array(tg_argv[0], ',')) c),
    lower(tg_op),
    left(coalesce(v_linha->>'descricao', v_linha->>'nome', v_linha->>'codigo', v_linha->>'razao_social',
                  v_linha->>'email', 'nº ' || (v_linha->>'numero'), v_linha->>'cpf_cnpj'), 200),
    v_campos, v_antes, v_depois);
  return null;
end $$;

-- Tabelas que ficam de fora: o próprio histórico, dado derivado recalculado por trigger,
-- controle técnico (sessões, dispositivos, webhooks, vínculos da importação) e segredos.
create or replace function app.tabelas_sem_historico() returns text[]
language sql immutable as $$
  select array['audit_log', 'custos_lote_mensal', 'importacao_vinculos', 'contas_asaas_segredos',
               'sessoes_2fa', 'dispositivos_confiaveis', 'webhook_eventos', 'aceites_termos']
$$;

-- Liga o trigger em toda tabela da empresa que ainda não tem. Tabela sem empresa_id entra pela
-- referência ao pai (a de "on delete cascade" primeiro: pedido_itens vai por pedido_id, não por produto_id).
create or replace function app.ligar_historico() returns void
language plpgsql as $$
declare
  r record;
  v_chave text;
  v_modo text;
  v_pai text;
begin
  for r in
    select c.oid, c.relname,
           exists (select 1 from pg_attribute x where x.attrelid = c.oid and x.attname = 'empresa_id' and not x.attisdropped) as tem_empresa
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname <> all (app.tabelas_sem_historico())
      and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'historico')
  loop
    v_modo := null; v_pai := null;
    if r.tem_empresa then
      v_modo := 'empresa_id';
    elsif r.relname = 'empresas' then
      v_modo := 'id';
    else
      select a.attname, f.confrelid::regclass::text into v_modo, v_pai
      from pg_constraint f
      join pg_attribute a on a.attrelid = f.conrelid and a.attnum = f.conkey[1]
      join pg_attribute fa on fa.attrelid = f.confrelid and fa.attnum = f.confkey[1] and fa.attname = 'id'
      where f.conrelid = r.oid and f.contype = 'f' and array_length(f.conkey, 1) = 1
        and exists (select 1 from pg_attribute x where x.attrelid = f.confrelid and x.attname = 'empresa_id' and not x.attisdropped)
      order by f.confdeltype = 'c' desc, a.attnum
      limit 1;
    end if;
    continue when v_modo is null;

    -- Chave primária; sem ela, o primeiro índice único (orcamentos)
    select string_agg(a.attname, ',' order by k.ord) into v_chave
    from (select i.indkey from pg_index i where i.indrelid = r.oid and i.indisunique
          order by i.indisprimary desc, i.indexrelid limit 1) i
    cross join lateral unnest(i.indkey::int2[]) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = r.oid and a.attnum = k.attnum;

    execute format('create trigger historico after insert or update or delete on public.%I for each row execute function app.registrar_alteracao(%L, %L, %L)',
      r.relname, coalesce(v_chave, ''), v_modo, coalesce(v_pai, ''));
  end loop;
end $$;

-- Mesmo corpo de 20261028050000_isolamento_entre_empresas.sql, mais o histórico no fim.
create or replace function app.travar_referencias() returns void
language plpgsql as $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tabela, c.confrelid::regclass as pai, a.attname as coluna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1] and fa.attname = 'id'
    where c.contype = 'f' and array_length(c.conkey, 1) = 1
      and c.conrelid <> c.confrelid
      and exists (select 1 from pg_attribute x where x.attrelid = c.conrelid and x.attname = 'empresa_id' and not x.attisdropped)
      and exists (select 1 from pg_attribute x where x.attrelid = c.confrelid and x.attname = 'empresa_id' and not x.attisdropped)
      and not exists (select 1 from pg_trigger t where t.tgrelid = c.conrelid and t.tgname = left('mesma_empresa_' || c.conname, 63))
  loop
    execute format('create trigger %I before insert or update of %I, empresa_id on %s for each row execute function app.checa_mesma_empresa(%L, %L)',
      left('mesma_empresa_' || r.conname, 63), r.coluna, r.tabela, r.coluna, r.pai::text);
  end loop;
  perform app.ligar_historico();
end $$;

select app.travar_referencias();
