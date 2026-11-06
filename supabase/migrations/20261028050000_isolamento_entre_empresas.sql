-- Isolamento entre empresas nas referências (auditoria de segurança de 2026-10-28, skill security-audit).
-- app.e_master com segundo fator e assinatura veio em 20261028040000_auditoria_correcoes.sql.

-- ---------------------------------------------------------------------------
-- Referências sempre dentro da mesma empresa
-- ---------------------------------------------------------------------------
-- O RLS confere só o empresa_id da própria linha. Uma linha da empresa A podia apontar para o id de
-- um registro da empresa B (apontamento, centro de custo, setor...), e os triggers security definer
-- seguiam a referência: lançavam estoque em B, renomeavam ou apagavam o centro de custo de B.
-- Agora toda chave estrangeira entre tabelas com empresa_id confere que as duas linhas são da
-- mesma empresa. Cadastros globais (empresa_id nulo, como espécies padrão) continuam aceitos.
-- Tabela nova com empresa_id ganha a trava rodando app.travar_referencias() na migration dela;
-- o teste supabase/tests/99_isolamento_empresas.sql falha se alguma referência ficar sem trava.

create or replace function app.checa_mesma_empresa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ref text := to_jsonb(new)->>tg_argv[0];
  v_empresa uuid;
begin
  if v_ref is null then return new; end if;
  execute format('select empresa_id from %s where id = $1', tg_argv[1]::regclass) into v_empresa using v_ref::uuid;
  if v_empresa is not null and v_empresa is distinct from new.empresa_id then
    raise exception 'O registro em % não é desta empresa', tg_argv[0] using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

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
end $$;

select app.travar_referencias();

-- Vínculos da importação: registro_id não é chave estrangeira (aponta para tabelas diferentes
-- conforme a entidade), e importar_pacote (security definer) atualiza o registro pelo id do vínculo.
-- Sem esta trava, o master da empresa A gravava um vínculo para a conta ou o contato de B e a
-- importação alterava o registro de B.
create or replace function app.checa_vinculo_importacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tabela text := case new.entidade
    when 'categoria' then 'categorias' when 'centro_custo' then 'centros_custo'
    when 'conta' then 'contas_financeiras' when 'contato' then 'contatos'
    when 'titulo' then 'agendamentos' when 'baixa' then 'baixas' when 'transferencia' then 'transferencias' end;
  v_empresa uuid;
begin
  if v_tabela is null then raise exception 'Entidade de importação desconhecida: %', new.entidade; end if;
  execute format('select empresa_id from %I where id = $1', v_tabela) into v_empresa using new.registro_id;
  if v_empresa is distinct from new.empresa_id then
    raise exception 'O registro do vínculo da importação não é desta empresa' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger checa_vinculo before insert or update on importacao_vinculos
for each row execute function app.checa_vinculo_importacao();
