-- Importação de dados de outro sistema (NIBO pela API, planilhas do NIBO e do LC Sistemas).
-- O app transforma a origem num "pacote" JSON e chama importar_pacote. A função roda com os
-- direitos do usuário (RLS e permissões valem), é idempotente e grava o vínculo id externo → id
-- local em importacao_vinculos: rodar de novo atualiza cadastros e não duplica lançamentos.

create table importacao_vinculos (
  empresa_id uuid not null references empresas(id) on delete cascade,
  origem text not null check (origem ~ '^[a-z0-9_]{2,30}$'),
  entidade text not null check (entidade in ('categoria','centro_custo','conta','contato','titulo','transferencia')),
  chave text not null check (length(chave) between 1 and 200),
  registro_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (empresa_id, origem, entidade, chave)
);

alter table importacao_vinculos enable row level security;
create policy membros on importacao_vinculos
  using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on importacao_vinculos as restrictive for insert with check (app.e_master(empresa_id));
create policy escrita_alterar on importacao_vinculos as restrictive for update
  using (app.e_master(empresa_id)) with check (app.e_master(empresa_id));
create policy escrita_apagar on importacao_vinculos as restrictive for delete using (app.e_master(empresa_id));

create or replace function app.vinculo(p_empresa uuid, p_origem text, p_entidade text, p_chave text) returns uuid
language sql stable as $$
  select registro_id from importacao_vinculos
  where empresa_id = p_empresa and origem = p_origem and entidade = p_entidade and chave = p_chave
$$;

create or replace function app.vincular(p_empresa uuid, p_origem text, p_entidade text, p_chave text, p_id uuid) returns void
language sql as $$
  insert into importacao_vinculos (empresa_id, origem, entidade, chave, registro_id)
  values (p_empresa, p_origem, p_entidade, p_chave, p_id)
  on conflict (empresa_id, origem, entidade, chave) do update set registro_id = excluded.registro_id
$$;

-- Texto para comparar nomes: minúsculo, sem acento, espaços simples.
create or replace function app.nome_chave(p text) returns text language sql immutable as $$
  select lower(regexp_replace(trim(translate(coalesce(p, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '\s+', ' ', 'g'))
$$;

create or replace function app.so_digitos(p text) returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '')
$$;

-- Categoria pelo nome (e pai, quando informado) no sentido pedido; cria se não existir.
create or replace function app.importar_categoria(p_empresa uuid, p_nome text, p_sentido text, p_pai text default null,
                                                  p_grupo text default null, p_codigo text default null) returns uuid
language plpgsql as $$
declare
  v_pai uuid;
  v_id uuid;
  v_grupo text := coalesce(p_grupo, case p_sentido when 'entrada' then 'receita_operacional' else 'despesa_operacional' end);
begin
  if nullif(trim(p_pai), '') is not null then
    select id into v_pai from categorias
     where empresa_id = p_empresa and sentido = p_sentido and parent_id is null and app.nome_chave(nome) = app.nome_chave(p_pai)
     order by ativa desc, created_at limit 1;
    if v_pai is null then
      insert into categorias (empresa_id, grupo, sentido, nome) values (p_empresa, v_grupo, p_sentido, trim(p_pai))
      returning id into v_pai;
    end if;
  end if;

  select id into v_id from categorias
   where empresa_id = p_empresa and sentido = p_sentido and app.nome_chave(nome) = app.nome_chave(p_nome)
     and (parent_id is not distinct from v_pai or v_pai is null)
   order by (parent_id is not distinct from v_pai) desc, ativa desc, created_at limit 1;
  if v_id is null then
    -- subcategoria herda grupo e sentido do pai (trigger de categorias)
    insert into categorias (empresa_id, grupo, sentido, parent_id, nome, codigo)
    values (p_empresa, coalesce((select grupo from categorias where id = v_pai), v_grupo), p_sentido, v_pai, trim(p_nome),
            nullif(trim(p_codigo), ''))
    returning id into v_id;
  else
    update categorias set ativa = true, codigo = coalesce(codigo, nullif(trim(p_codigo), ''))
     where id = v_id and (not ativa or (codigo is null and nullif(trim(p_codigo), '') is not null));
  end if;
  return v_id;
end $$;

create or replace function app.importar_centro(p_empresa uuid, p_nome text) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from centros_custo where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(p_nome) limit 1;
  if v_id is null then
    insert into centros_custo (empresa_id, nome) values (p_empresa, trim(p_nome)) returning id into v_id;
  end if;
  return v_id;
end $$;

-- Pacote:
-- { origem: 'nibo',
--   categorias:     [{nome, sentido: entrada|saida, grupo?, pai?, codigo?}],
--   centros_custo:  [{nome}],
--   contas:         [{chave?, nome, tipo?, banco_codigo?, agencia?, conta?, conta_dv?, saldo_inicial_cents?, saldo_inicial_data?, arquivada?}],
--   contatos:       [{chave?, nome, tipos: [cliente|fornecedor|funcionario|socio], cpf_cnpj?, inscricao_estadual?, email?,
--                     telefone?, cidade?, uf?, endereco?, produtor_rural?}],
--   titulos:        [{chave, tipo: pagar|receber, descricao, contato?, contato_chave?, vencimento, competencia?, valor_cents,
--                     referencia?, cancelado?, rateio: [{categoria, categoria_pai?, centro_custo?, valor_cents}],
--                     baixas: [{conta, data, valor_cents}]}],
--   transferencias: [{chave, origem, destino, data, valor_cents, descricao?}] }
-- Contas e contatos nos títulos são referenciados pela chave (quando houver) ou pelo nome.
create or replace function public.importar_pacote(p_empresa uuid, p_pacote jsonb) returns jsonb
language plpgsql set search_path = public as $$
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
    if app.vinculo(p_empresa, v_origem, 'titulo', r->>'chave') is not null then
      n_tit_existente := n_tit_existente + 1;
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
    v_soma := 0;
    for x in select e from jsonb_array_elements(coalesce(r->'baixas', '[]')) e
             where coalesce((e->>'valor_cents')::bigint, 0) > 0 order by e->>'data'
    loop
      v_conta := app.vinculo(p_empresa, v_origem, 'conta', coalesce(x->>'conta_chave', app.nome_chave(x->>'conta')));
      if v_conta is null then
        select id into v_conta from contas_financeiras
         where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(x->>'conta') limit 1;
      end if;
      if v_conta is null then
        v_avisos := v_avisos || format('Baixa de "%s" sem conta conhecida (%s): ficou em aberto', r->>'descricao', x->>'conta');
        continue;
      end if;
      v_valor := (x->>'valor_cents')::bigint;
      v_resto := greatest(v_total - v_soma, 0);
      if v_resto = 0 then
        v_avisos := v_avisos || format('Baixa extra de "%s" ignorada: o título já estava quitado', r->>'descricao');
        continue;
      end if;
      insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, juros_cents, observacao, created_by)
      values (p_empresa, v_id, v_conta, (x->>'data')::date, least(v_valor, v_resto), greatest(v_valor - v_resto, 0),
              'Importado de ' || v_origem, auth.uid());
      v_soma := v_soma + least(v_valor, v_resto);
      n_baixa := n_baixa + 1;
    end loop;

    perform app.vincular(p_empresa, v_origem, 'titulo', r->>'chave', v_id);
    n_tit := n_tit + 1;
  end loop;

  for r in select e from jsonb_array_elements(coalesce(p_pacote->'transferencias', '[]')) e loop
    continue when nullif(r->>'chave', '') is null or coalesce((r->>'valor_cents')::bigint, 0) <= 0;
    if app.vinculo(p_empresa, v_origem, 'transferencia', r->>'chave') is not null then
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

-- Automação a partir do histórico: para cada contato com CPF/CNPJ que sempre cai na mesma
-- categoria (mínimo 2 lançamentos), cria uma regra de conciliação "documento igual → contato + categoria".
create or replace function public.criar_regras_do_historico(p_empresa uuid) returns int
language plpgsql set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o usuário master da empresa pode criar regras automáticas' using errcode = 'insufficient_privilege';
  end if;
  for r in
    with principal as (  -- a maior linha do rateio de cada título
      select distinct on (a.id) a.tipo, a.contato_id, ra.categoria_id, ra.centro_custo_id
      from agendamentos a join agendamento_rateios ra on ra.agendamento_id = a.id
      where a.empresa_id = p_empresa and a.contato_id is not null and a.status <> 'cancelado'
      order by a.id, ra.valor_cents desc
    ), uso as (
      select tipo, contato_id, categoria_id, count(*) qtd,
             mode() within group (order by centro_custo_id) centro_custo_id
      from principal group by 1, 2, 3
    ), unico as (
      select tipo, contato_id, (array_agg(categoria_id order by qtd desc))[1] categoria_id,
             (array_agg(centro_custo_id order by qtd desc))[1] centro_custo_id,
             sum(qtd) total, max(qtd) principal
      from uso group by 1, 2
    )
    select u.*, c.nome, c.cpf_cnpj from unico u join contatos c on c.id = u.contato_id
    where c.cpf_cnpj is not null and u.total >= 2 and u.principal::numeric / u.total >= 0.8
    order by u.total desc
  loop
    continue when exists (select 1 from regras_conciliacao where empresa_id = p_empresa
                          and nome = left(format('%s: %s', case r.tipo when 'pagar' then 'Pagamento' else 'Recebimento' end, r.nome), 120));
    perform public.criar_regra(
      p_empresa => p_empresa,
      p_tipo => case r.tipo when 'pagar' then 'pagamento' else 'recebimento' end,
      p_nome => left(format('%s: %s', case r.tipo when 'pagar' then 'Pagamento' else 'Recebimento' end, r.nome), 120),
      p_condicoes => jsonb_build_array(jsonb_build_object('campo', 'cpf_cnpj', 'operador', 'igual', 'valor', r.cpf_cnpj)),
      p_categoria => r.categoria_id, p_centro_custo => r.centro_custo_id, p_contato => r.contato_id);
    n := n + 1;
  end loop;
  return n;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on importacao_vinculos to authenticated;
    grant execute on function public.importar_pacote(uuid, jsonb) to authenticated;
    grant execute on function public.criar_regras_do_historico(uuid) to authenticated;
    grant execute on all functions in schema app to authenticated;
    revoke execute on function public.importar_pacote(uuid, jsonb) from anon;
    revoke execute on function public.criar_regras_do_historico(uuid) from anon;
  end if;
end $$;
