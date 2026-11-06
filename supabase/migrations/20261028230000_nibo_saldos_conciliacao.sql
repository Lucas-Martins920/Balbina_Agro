-- Saldos e conciliação vindos do NIBO (só para empresas com a integração liberada).
--
-- Os saldos ficavam errados porque a conta recebia o saldo de abertura do NIBO (do dia em que a conta
-- foi criada lá) e só os lançamentos a partir da data escolhida na importação. O app agora lê o extrato
-- e o saldo de cada conta no NIBO e manda o saldo de abertura na data inicial. Esta migration:
--  1. cria integracoes_empresa: que empresa pode usar qual integração (só a conta teste usa o NIBO);
--  2. não duplica transferência que já entrou com outro par de lançamentos;
--  3. cria importar_conciliacao: o que está conciliado no NIBO entra conciliado, e o que o banco mandou
--     e ainda não foi conciliado entra como pendente na conciliação;
--  4. guarda a última auditoria de saldos (NIBO x Balbina) para a tela de importação.

create table integracoes_empresa (
  empresa_id uuid not null references empresas(id) on delete cascade,
  sistema text not null check (sistema in ('nibo')),
  created_at timestamptz not null default now(),
  primary key (empresa_id, sistema)
);
alter table integracoes_empresa enable row level security;
-- só leitura para os membros: quem libera a integração é o Balbina (migration ou service role)
create policy membros on integracoes_empresa for select using (empresa_id in (select app.minhas_empresas()));
grant select on integracoes_empresa to authenticated;

-- a conta teste da Piscicultura Amazônia Viva
insert into integracoes_empresa (empresa_id, sistema)
select id, 'nibo' from empresas
 where app.nome_chave(coalesce(nome_fantasia, '') || ' ' || razao_social) like '%amazonia viva%'
on conflict do nothing;

alter table importacoes_extrato drop constraint importacoes_extrato_origem_check;
alter table importacoes_extrato add constraint importacoes_extrato_origem_check
  check (origem in ('ofx','planilha','pdf_ia','open_finance','cnab_retorno','nibo'));

create table auditorias_importacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  origem text not null check (origem ~ '^[a-z0-9_]{2,30}$'),
  desde date,
  contas jsonb not null default '[]',
  avisos jsonb not null default '[]',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on auditorias_importacao (empresa_id, origem, created_at desc);
alter table auditorias_importacao enable row level security;
create policy membros on auditorias_importacao
  using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on auditorias_importacao as restrictive for insert with check (app.e_master(empresa_id));
create policy escrita_alterar on auditorias_importacao as restrictive for update using (false);
create policy escrita_apagar on auditorias_importacao as restrictive for delete using (app.e_master(empresa_id));
grant select, insert, delete on auditorias_importacao to authenticated;

create or replace function public.importar_pacote(p_empresa uuid, p_pacote jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_origem text := coalesce(nullif(p_pacote->>'origem', ''), 'planilha');
  r jsonb;
  x jsonb;
  v_id uuid;
  v_doc text;
  v_tipos text[];
  v_sentido text;
  v_conta uuid;
  v_conta2 uuid;
  v_contato uuid;
  v_total bigint;
  v_soma bigint;
  v_resto bigint;
  v_valor bigint;
  v_cat uuid;
  v_novo boolean;
  b record;
  v_avisos text[] := '{}';
  n_cat int := 0; n_cc int := 0; n_conta int := 0; n_contato_novo int := 0; n_contato_atual int := 0;
  n_tit int := 0; n_tit_existente int := 0; n_baixa int := 0; n_transf int := 0; n_transf_existente int := 0;
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o usuário master da empresa pode importar dados' using errcode = 'insufficient_privilege';
  end if;
  if v_origem !~ '^[a-z0-9_]{2,30}$' then
    raise exception 'Origem inválida: %', v_origem using errcode = 'check_violation';
  end if;

  -- Categorias: pais antes dos filhos, para o pai existir com o grupo certo.
  for r in select e from jsonb_array_elements(coalesce(p_pacote->'categorias', '[]')) e
           order by (nullif(trim(e->>'pai'), '') is not null)
  loop
    continue when nullif(trim(r->>'nome'), '') is null;
    v_sentido := case when r->>'sentido' = 'entrada' then 'entrada' else 'saida' end;
    perform app.importar_categoria(p_empresa, r->>'nome', v_sentido, r->>'pai',
      case when r->>'grupo' in ('receita_operacional','custo_operacional','despesa_operacional','investimento','financiamento')
           then r->>'grupo' end,
      r->>'codigo');
    n_cat := n_cat + 1;
  end loop;

  for r in select e from jsonb_array_elements(coalesce(p_pacote->'centros_custo', '[]')) e loop
    continue when nullif(trim(r->>'nome'), '') is null;
    perform app.importar_centro(p_empresa, r->>'nome');
    n_cc := n_cc + 1;
  end loop;

  for r in select e from jsonb_array_elements(coalesce(p_pacote->'contas', '[]')) e loop
    continue when nullif(trim(r->>'nome'), '') is null;
    v_id := app.vinculo(p_empresa, v_origem, 'conta', coalesce(r->>'chave', app.nome_chave(r->>'nome')));
    if v_id is null then
      select id into v_id from contas_financeiras
       where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'nome') limit 1;
    end if;
    if v_id is null then
      insert into contas_financeiras (empresa_id, tipo, nome, banco_codigo, agencia, conta, conta_dv,
                                      saldo_inicial_cents, saldo_inicial_data, arquivada,
                                      dia_fechamento, dia_vencimento)
      values (p_empresa,
              case when r->>'tipo' in ('corrente','poupanca','caixinha','aplicacao','cartao_credito') then r->>'tipo' else 'corrente' end,
              trim(r->>'nome'), nullif(r->>'banco_codigo', ''), nullif(r->>'agencia', ''), nullif(r->>'conta', ''),
              nullif(r->>'conta_dv', ''), coalesce((r->>'saldo_inicial_cents')::bigint, 0),
              coalesce((r->>'saldo_inicial_data')::date, current_date), coalesce((r->>'arquivada')::boolean, false),
              case when r->>'tipo' = 'cartao_credito' then coalesce((r->>'dia_fechamento')::smallint, 1) end,
              case when r->>'tipo' = 'cartao_credito' then coalesce((r->>'dia_vencimento')::smallint, 10) end)
      returning id into v_id;
    else
      update contas_financeiras set
        saldo_inicial_cents = coalesce((r->>'saldo_inicial_cents')::bigint, saldo_inicial_cents),
        saldo_inicial_data = coalesce((r->>'saldo_inicial_data')::date, saldo_inicial_data),
        banco_codigo = coalesce(banco_codigo, nullif(r->>'banco_codigo', '')),
        agencia = coalesce(agencia, nullif(r->>'agencia', '')),
        conta = coalesce(conta, nullif(r->>'conta', '')),
        updated_at = now()
      where id = v_id;
    end if;
    perform app.vincular(p_empresa, v_origem, 'conta', coalesce(r->>'chave', app.nome_chave(r->>'nome')), v_id);
    n_conta := n_conta + 1;
  end loop;

  -- Contatos: casa pela chave externa, depois pelo CPF/CNPJ, depois pelo nome. Une os tipos.
  for r in select e from jsonb_array_elements(coalesce(p_pacote->'contatos', '[]')) e loop
    continue when nullif(trim(r->>'nome'), '') is null;
    v_doc := app.so_digitos(r->>'cpf_cnpj');
    if v_doc is not null and v_doc !~ '^(\d{11}|\d{14})$' then
      v_avisos := v_avisos || format('Documento inválido ignorado em "%s": %s', r->>'nome', r->>'cpf_cnpj');
      v_doc := null;
    end if;
    select coalesce(array_agg(distinct t) filter (where t in ('cliente','fornecedor','funcionario','socio')), '{}')
      into v_tipos from jsonb_array_elements_text(coalesce(r->'tipos', '[]')) t;
    if cardinality(v_tipos) = 0 then v_tipos := array['cliente']; end if;

    v_id := null;
    if r ? 'chave' then v_id := app.vinculo(p_empresa, v_origem, 'contato', r->>'chave'); end if;
    if v_id is null and v_doc is not null then
      select id into v_id from contatos where empresa_id = p_empresa and cpf_cnpj = v_doc order by arquivado, created_at limit 1;
    end if;
    if v_id is null then
      -- pelo nome, mas sem juntar dois cadastros diferentes da mesma origem (dois "ANTONIO" no LC continuam dois)
      select id into v_id from contatos c where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'nome')
        and (v_doc is null or cpf_cnpj is null)
        and not (r ? 'chave' and exists (select 1 from importacao_vinculos v where v.empresa_id = p_empresa and v.origem = v_origem
                                          and v.entidade = 'contato' and v.registro_id = c.id))
      order by arquivado, created_at limit 1;
    end if;

    if v_id is null then
      insert into contatos (empresa_id, tipos, nome, cpf_cnpj, inscricao_estadual, email, telefone, endereco, cidade, uf, produtor_rural)
      values (p_empresa, v_tipos, trim(r->>'nome'), v_doc, nullif(trim(r->>'inscricao_estadual'), ''),
              nullif(trim(r->>'email'), ''), nullif(trim(r->>'telefone'), ''), coalesce(r->'endereco', '{}'),
              nullif(trim(r->>'cidade'), ''), nullif(upper(left(trim(r->>'uf'), 2)), ''),
              coalesce((r->>'produtor_rural')::boolean, false))
      returning id into v_id;
      n_contato_novo := n_contato_novo + 1;
    else
      update contatos c set
        tipos = (select array_agg(distinct t) from unnest(c.tipos || v_tipos) t),
        cpf_cnpj = coalesce(c.cpf_cnpj, v_doc),
        inscricao_estadual = coalesce(c.inscricao_estadual, nullif(trim(r->>'inscricao_estadual'), '')),
        email = coalesce(c.email, nullif(trim(r->>'email'), '')),
        telefone = coalesce(c.telefone, nullif(trim(r->>'telefone'), '')),
        endereco = case when c.endereco = '{}'::jsonb then coalesce(r->'endereco', '{}') else c.endereco end,
        cidade = coalesce(c.cidade, nullif(trim(r->>'cidade'), '')),
        uf = coalesce(c.uf, nullif(upper(left(trim(r->>'uf'), 2)), '')),
        produtor_rural = c.produtor_rural or coalesce((r->>'produtor_rural')::boolean, false),
        updated_at = now()
      where id = v_id;
      n_contato_atual := n_contato_atual + 1;
    end if;
    if r ? 'chave' then perform app.vincular(p_empresa, v_origem, 'contato', r->>'chave', v_id); end if;
  end loop;

  -- Títulos (contas a pagar e a receber) com rateio e baixas.
  for r in select e from jsonb_array_elements(coalesce(p_pacote->'titulos', '[]')) e loop
    v_total := (r->>'valor_cents')::bigint;
    if nullif(r->>'chave', '') is null or r->>'tipo' not in ('pagar','receber') or coalesce(v_total, 0) <= 0
       or nullif(r->>'vencimento', '') is null then
      v_avisos := v_avisos || format('Lançamento ignorado (falta chave, tipo, valor ou vencimento): %s', left(r::text, 160));
      continue;
    end if;
    -- a mesma conta pode ter vindo antes com outra chave (lançamento avulso x agendamento)
    v_id := coalesce(app.vinculo(p_empresa, v_origem, 'titulo', r->>'chave'),
      (select app.vinculo(p_empresa, v_origem, 'titulo', k) from jsonb_array_elements_text(coalesce(r->'chaves_extras', '[]')) k
        where app.vinculo(p_empresa, v_origem, 'titulo', k) is not null limit 1));
    if v_id is not null then
      -- título já importado: só traz as baixas feitas depois da última importação
      n_tit_existente := n_tit_existente + 1;
      continue when (select status from agendamentos where id = v_id) = 'cancelado';
      for x in select e from jsonb_array_elements(coalesce(r->'baixas', '[]')) e
               where coalesce((e->>'valor_cents')::bigint, 0) > 0 order by e->>'data'
      loop
        select * into b from app.importar_baixa(p_empresa, v_origem, v_id, x);
        if b.inserida then n_baixa := n_baixa + 1; end if;
        if b.aviso is not null then v_avisos := v_avisos || b.aviso; end if;
      end loop;
      continue;
    end if;
    v_sentido := case r->>'tipo' when 'receber' then 'entrada' else 'saida' end;

    v_contato := null;
    if nullif(r->>'contato_chave', '') is not null then
      v_contato := app.vinculo(p_empresa, v_origem, 'contato', r->>'contato_chave');
    end if;
    if v_contato is null and nullif(trim(r->>'contato'), '') is not null then
      select id into v_contato from contatos where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'contato')
       order by (case when r->>'tipo' = 'receber' then 'cliente' else 'fornecedor' end) = any(tipos) desc, arquivado, created_at limit 1;
      if v_contato is null then
        insert into contatos (empresa_id, tipos, nome)
        values (p_empresa, array[case when r->>'tipo' = 'receber' then 'cliente' else 'fornecedor' end], trim(r->>'contato'))
        returning id into v_contato;
        n_contato_novo := n_contato_novo + 1;
      end if;
    end if;

    insert into agendamentos (empresa_id, tipo, contato_id, descricao, referencia, vencimento, competencia, previsao,
                              valor_cents, origem, status, created_by)
    values (p_empresa, r->>'tipo', v_contato,
            coalesce(nullif(trim(r->>'descricao'), ''), case r->>'tipo' when 'receber' then 'Recebimento importado' else 'Pagamento importado' end),
            nullif(trim(r->>'referencia'), ''), (r->>'vencimento')::date,
            date_trunc('month', coalesce(nullif(r->>'competencia', '')::date, (r->>'vencimento')::date))::date,
            (r->>'vencimento')::date, v_total, 'importacao',
            case when coalesce((r->>'cancelado')::boolean, false) then 'cancelado' else 'aberto' end, auth.uid())
    returning id into v_id;

    -- Rateio: o que vier, ajustado para fechar com o valor; sem categoria vai para "Importado sem categoria".
    v_soma := 0;
    for x in select e from jsonb_array_elements(coalesce(r->'rateio', '[]')) e
             where coalesce((e->>'valor_cents')::bigint, 0) > 0
    loop
      v_valor := least((x->>'valor_cents')::bigint, v_total - v_soma);
      exit when v_valor <= 0;
      v_cat := app.importar_categoria(p_empresa, coalesce(nullif(trim(x->>'categoria'), ''), 'Importado sem categoria'),
                                      v_sentido, x->>'categoria_pai');
      insert into agendamento_rateios (empresa_id, agendamento_id, categoria_id, centro_custo_id, valor_cents)
      values (p_empresa, v_id, v_cat,
              case when nullif(trim(x->>'centro_custo'), '') is not null then app.importar_centro(p_empresa, x->>'centro_custo') end,
              v_valor);
      v_soma := v_soma + v_valor;
    end loop;
    if v_soma < v_total then
      v_cat := case when v_soma = 0 then app.importar_categoria(p_empresa, 'Importado sem categoria', v_sentido) end;
      if v_cat is not null then
        insert into agendamento_rateios (empresa_id, agendamento_id, categoria_id, valor_cents)
        values (p_empresa, v_id, v_cat, v_total);
      else
        -- diferença de arredondamento vai para a maior linha
        update agendamento_rateios set valor_cents = valor_cents + (v_total - v_soma)
         where id = (select id from agendamento_rateios where agendamento_id = v_id order by valor_cents desc limit 1);
      end if;
    end if;

    -- Baixas: o que passar do valor do título vira juros.
    for x in select e from jsonb_array_elements(coalesce(r->'baixas', '[]')) e
             where coalesce((e->>'valor_cents')::bigint, 0) > 0 order by e->>'data'
    loop
      select * into b from app.importar_baixa(p_empresa, v_origem, v_id, x);
      if b.inserida then n_baixa := n_baixa + 1; end if;
      if b.aviso is not null then v_avisos := v_avisos || b.aviso; end if;
    end loop;

    perform app.vincular(p_empresa, v_origem, 'titulo', r->>'chave', v_id);
    n_tit := n_tit + 1;
  end loop;

  for r in select e from jsonb_array_elements(coalesce(p_pacote->'transferencias', '[]')) e loop
    continue when nullif(r->>'chave', '') is null or coalesce((r->>'valor_cents')::bigint, 0) <= 0;
    -- já importada por esta chave ou, com outro par, por um dos dois lançamentos
    if app.vinculo(p_empresa, v_origem, 'transferencia', r->>'chave') is not null
       or exists (select 1 from importacao_vinculos v, jsonb_array_elements_text(coalesce(r->'lancamentos', '[]')) l
                   where v.empresa_id = p_empresa and v.origem = v_origem and v.entidade = 'transferencia'
                     and l in (split_part(v.chave, ':', 2), split_part(v.chave, ':', 3))) then
      n_transf_existente := n_transf_existente + 1;
      continue;
    end if;
    v_conta := coalesce(app.vinculo(p_empresa, v_origem, 'conta', coalesce(r->>'origem_chave', app.nome_chave(r->>'origem'))),
      (select id from contas_financeiras where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'origem') limit 1));
    v_conta2 := coalesce(app.vinculo(p_empresa, v_origem, 'conta', coalesce(r->>'destino_chave', app.nome_chave(r->>'destino'))),
      (select id from contas_financeiras where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'destino') limit 1));
    if v_conta is null or v_conta2 is null or v_conta = v_conta2 then
      v_avisos := v_avisos || format('Transferência de %s ignorada: contas não encontradas (%s → %s)', r->>'data', r->>'origem', r->>'destino');
      continue;
    end if;
    insert into transferencias (empresa_id, conta_origem_id, conta_destino_id, data, valor_cents, descricao)
    values (p_empresa, v_conta, v_conta2, (r->>'data')::date, (r->>'valor_cents')::bigint, nullif(trim(r->>'descricao'), ''))
    returning id into v_id;
    perform app.vincular(p_empresa, v_origem, 'transferencia', r->>'chave', v_id);
    n_transf := n_transf + 1;
  end loop;

  return jsonb_build_object(
    'categorias', n_cat, 'centros_custo', n_cc, 'contas', n_conta,
    'contatos_novos', n_contato_novo, 'contatos_atualizados', n_contato_atual,
    'titulos', n_tit, 'titulos_ja_importados', n_tit_existente, 'baixas', n_baixa,
    'transferencias', n_transf, 'transferencias_ja_importadas', n_transf_existente,
    'avisos', to_jsonb(v_avisos[1:50]), 'total_avisos', cardinality(v_avisos));
end $$;


-- p_contas: [{conta_chave, conciliados: [{id_externo, data, descricao, valor_cents, baixa_chave | lancamento}],
--             pendentes: [{id_externo, data, descricao, valor_cents}]}]
create or replace function public.importar_conciliacao(p_empresa uuid, p_origem text, p_contas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c jsonb;
  x jsonb;
  v_conta uuid;
  v_imp uuid;
  v_mov uuid;
  v_baixa uuid;
  v_transf uuid;
  v_ids text[];
  v_n int;
  n_conc int := 0; n_pend int := 0; n_sem int := 0; n_removidos int := 0;
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o usuário master da empresa pode importar dados' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from integracoes_empresa where empresa_id = p_empresa and sistema = p_origem) then
    raise exception 'A integração com % não está liberada para esta empresa', p_origem using errcode = 'insufficient_privilege';
  end if;

  for c in select e from jsonb_array_elements(coalesce(p_contas, '[]')) e loop
    v_conta := app.vinculo(p_empresa, p_origem, 'conta', c->>'conta_chave');
    continue when v_conta is null;
    insert into importacoes_extrato (empresa_id, conta_id, origem, total_linhas, created_by)
    values (p_empresa, v_conta, p_origem,
            jsonb_array_length(coalesce(c->'conciliados', '[]')) + jsonb_array_length(coalesce(c->'pendentes', '[]')), auth.uid())
    returning id into v_imp;

    -- conciliado no NIBO: entra conciliado, ligado à baixa ou à transferência importada
    for x in select e from jsonb_array_elements(coalesce(c->'conciliados', '[]')) e loop
      continue when coalesce((x->>'valor_cents')::bigint, 0) = 0;
      v_baixa := case when nullif(x->>'baixa_chave', '') is not null then app.vinculo(p_empresa, p_origem, 'baixa', x->>'baixa_chave') end;
      v_transf := case when nullif(x->>'lancamento', '') is not null then
        (select registro_id from importacao_vinculos v
          where v.empresa_id = p_empresa and v.origem = p_origem and v.entidade = 'transferencia'
            and x->>'lancamento' in (split_part(v.chave, ':', 2), split_part(v.chave, ':', 3)) limit 1) end;
      if v_baixa is null and v_transf is null then n_sem := n_sem + 1; continue; end if;
      v_mov := null;
      insert into movimentos_bancarios (empresa_id, conta_id, importacao_id, data, descricao, valor_cents, id_externo, status)
      values (p_empresa, v_conta, v_imp, (x->>'data')::date, coalesce(nullif(trim(x->>'descricao'), ''), 'Sem descrição'),
              (x->>'valor_cents')::bigint, x->>'id_externo', 'conciliado')
      on conflict (conta_id, id_externo) do nothing
      returning id into v_mov;
      continue when v_mov is null;
      insert into conciliacoes (empresa_id, movimento_id, baixa_id, transferencia_id, valor_cents, modo, created_by)
      values (p_empresa, v_mov, v_baixa, case when v_baixa is null then v_transf end, (x->>'valor_cents')::bigint, 'lote', auth.uid());
      n_conc := n_conc + 1;
    end loop;

    -- ainda a conciliar no NIBO: entra pendente; o que deixou de estar pendente lá sai daqui
    -- (só quando a lista de pendentes da conta vem nesta chamada)
    continue when not c ? 'pendentes';
    select coalesce(array_agg(e->>'id_externo'), '{}') into v_ids from jsonb_array_elements(coalesce(c->'pendentes', '[]')) e;
    delete from movimentos_bancarios
     where conta_id = v_conta and status = 'pendente' and id_externo like 'nibo-banco:%' and id_externo <> all (v_ids);
    get diagnostics v_n = row_count;
    n_removidos := n_removidos + v_n;
    with novas as (
      insert into movimentos_bancarios (empresa_id, conta_id, importacao_id, data, descricao, valor_cents, id_externo)
      select p_empresa, v_conta, v_imp, (e->>'data')::date, coalesce(nullif(trim(e->>'descricao'), ''), 'Sem descrição'),
             (e->>'valor_cents')::bigint, e->>'id_externo'
        from jsonb_array_elements(coalesce(c->'pendentes', '[]')) e
       where coalesce((e->>'valor_cents')::bigint, 0) <> 0
      on conflict (conta_id, id_externo) do nothing
      returning 1)
    select count(*) into v_n from novas;
    n_pend := n_pend + v_n;
  end loop;

  update importacoes_extrato i set linhas_novas = (select count(*) from movimentos_bancarios m where m.importacao_id = i.id)
   where i.empresa_id = p_empresa and i.origem = p_origem and i.created_at = now();
  return jsonb_build_object('conciliados', n_conc, 'pendentes', n_pend, 'sem_lancamento', n_sem, 'pendentes_removidos', n_removidos);
end $$;

revoke all on function public.importar_conciliacao(uuid, text, jsonb) from public;
grant execute on function public.importar_conciliacao(uuid, text, jsonb) to authenticated;

-- tabelas novas entram no histórico de alterações e na trava entre empresas
select app.travar_referencias();
select app.ligar_historico();
