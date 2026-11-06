-- ERP Piscicultura de Engorda — schema inicial (Postgres 15+ / Supabase)
-- Gerado pelo replica-architect a partir de replica/recon.md
-- Convenções: uuid em tudo, timestamptz em UTC, dinheiro em centavos (bigint),
-- quantidades físicas em numeric, empresa_id em toda tabela de dados (multiempresa + RLS).

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- 0. Setor: empresas, usuários, permissões
-- ---------------------------------------------------------------------------

create table empresas (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique check (cnpj ~ '^\d{14}$'),
  razao_social text not null,
  nome_fantasia text,
  regime_tributario text not null default 'simples'
    check (regime_tributario in ('simples','presumido','real','produtor_rural')),
  inscricao_estadual text,
  endereco jsonb not null default '{}',
  usar_competencia boolean not null default true,
  usar_rateio boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- user_id aponta para auth.users no Supabase
create table usuarios_empresa (
  empresa_id uuid not null references empresas(id) on delete cascade,
  user_id uuid not null,
  perfil text not null default 'visualizacao'
    check (perfil in ('sem_restricao','cadastros','visualizacao','personalizado','apontador','vendedor')),
  is_admin boolean not null default false,
  permissoes text[] not null default '{}',   -- ex.: {'financeiro.editar','orcamento.editar','conciliacao.regras'}
  centros_custo_permitidos uuid[],           -- null = todos (ex.: apontador só vê o próprio setor)
  created_at timestamptz not null default now(),
  primary key (empresa_id, user_id)
);
create index on usuarios_empresa (user_id);

-- Empresas que o usuário logado pode ver. No Supabase, auth.uid() vem do JWT.
create or replace function app.minhas_empresas() returns setof uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from usuarios_empresa where user_id = auth.uid()
$$;

create or replace function app.tem_permissao(p_empresa uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuarios_empresa
    where empresa_id = p_empresa and user_id = auth.uid()
      and (is_admin or perfil = 'sem_restricao' or p_perm = any(permissoes))
  )
$$;

create table audit_log (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references empresas(id) on delete cascade,
  user_id uuid,
  tabela text not null,
  registro_id uuid not null,
  acao text not null check (acao in ('insert','update','delete')),
  antes jsonb,
  depois jsonb,
  created_at timestamptz not null default now()
);
create index on audit_log (empresa_id, tabela, registro_id);
create index on audit_log (empresa_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 1. Cadastros financeiros
-- ---------------------------------------------------------------------------

create table contatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipos text[] not null check (tipos <@ array['cliente','fornecedor','funcionario','socio']::text[] and cardinality(tipos) > 0),
  nome text not null,
  cpf_cnpj text check (cpf_cnpj is null or cpf_cnpj ~ '^(\d{11}|\d{14})$'),
  inscricao_estadual text,
  email text,
  telefone text,
  endereco jsonb not null default '{}',
  cidade text,
  uf char(2),
  arquivado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index on contatos (empresa_id, cpf_cnpj) where cpf_cnpj is not null;
create index on contatos (empresa_id, nome);
create index on contatos (empresa_id, uf, cidade);

create table categorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  grupo text not null check (grupo in ('receita_operacional','custo_operacional','despesa_operacional','investimento','financiamento')),
  sentido text not null check (sentido in ('entrada','saida')),
  parent_id uuid references categorias(id) on delete restrict,
  nome text not null,
  codigo text,                 -- para exportar ao contador
  sistema boolean not null default false,   -- criada pelo sistema, não editável
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, parent_id, nome)
);
create index on categorias (empresa_id, grupo);
create index on categorias (parent_id);

create table centros_custo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  parent_id uuid references centros_custo(id) on delete restrict,
  nome text not null,
  tipo text not null default 'geral' check (tipo in ('geral','setor','viveiro','lote','fabrica_racao','comercial','administrativo')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome)
);
create index on centros_custo (parent_id);

create table contas_financeiras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('corrente','poupanca','caixinha','aplicacao','cartao_credito')),
  nome text not null,
  banco_codigo text,
  agencia text,
  conta text,
  conta_dv text,
  saldo_inicial_cents bigint not null default 0,
  saldo_inicial_data date not null default current_date,
  -- cartão de crédito
  dia_fechamento smallint check (dia_fechamento between 1 and 31),
  dia_vencimento smallint check (dia_vencimento between 1 and 31),
  limite_cents bigint,
  conta_pagadora_id uuid references contas_financeiras(id) on delete set null,
  -- integrações
  cnab_habilitado boolean not null default false,
  open_finance_item_id text,
  bloqueada_ate date,            -- nada antes desta data pode mudar
  arquivada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cartao_tem_datas check (tipo <> 'cartao_credito' or (dia_fechamento is not null and dia_vencimento is not null))
);
create index on contas_financeiras (empresa_id);

-- ---------------------------------------------------------------------------
-- 2. Contas a pagar / receber
-- ---------------------------------------------------------------------------

create table recorrencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('pagar','receber')),
  contato_id uuid references contatos(id) on delete restrict,
  descricao text not null,
  valor_cents bigint not null check (valor_cents > 0),
  frequencia text not null check (frequencia in ('semanal','quinzenal','mensal','bimestral','trimestral','semestral','anual')),
  dia_vencimento smallint check (dia_vencimento between 1 and 31),
  inicio date not null,
  termino date,
  meses_provisionados smallint not null default 12,
  reajuste_tipo text check (reajuste_tipo in ('percentual','ipca','igpm','inpc')),
  reajuste_percentual numeric(7,4),
  reajuste_periodicidade_meses smallint,
  proximo_reajuste date,
  status text not null default 'ativa' check (status in ('ativa','pausada','finalizada')),
  template jsonb not null default '{}',   -- categoria, cc, rateio, cobrança automática
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint termino_depois_inicio check (termino is null or termino >= inicio)
);
create index on recorrencias (empresa_id, status);

create table recorrencia_reajustes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  recorrencia_id uuid not null references recorrencias(id) on delete cascade,
  aplicado_em date not null,
  valor_anterior_cents bigint not null,
  valor_novo_cents bigint not null,
  indice text,
  percentual numeric(7,4),
  created_at timestamptz not null default now()
);
create index on recorrencia_reajustes (recorrencia_id);

create table agendamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('pagar','receber')),
  contato_id uuid references contatos(id) on delete restrict,
  descricao text not null,
  referencia text,
  vencimento date not null,
  competencia date not null,          -- primeiro dia do mês de competência
  previsao date,                      -- data prevista de caixa (default = vencimento)
  valor_cents bigint not null check (valor_cents > 0),
  desconto_cents bigint not null default 0 check (desconto_cents >= 0),
  juros_cents bigint not null default 0 check (juros_cents >= 0),
  multa_cents bigint not null default 0 check (multa_cents >= 0),
  retencoes jsonb not null default '[]',   -- [{imposto:'IRRF', valor_cents:...}]
  pago_cents bigint not null default 0,    -- mantido por trigger a partir de baixas
  status text not null default 'aberto'
    check (status in ('aberto','parcial','quitado','perda','cancelado')),
  forma_pagamento text check (forma_pagamento in ('boleto','pix','ted','dinheiro','cartao','debito_automatico','cheque')),
  dados_pagamento jsonb not null default '{}',  -- linha digitável, chave pix, etc.
  recorrencia_id uuid references recorrencias(id) on delete set null,
  parcela_numero smallint,
  parcela_total smallint,
  grupo_parcelamento_id uuid,
  origem text not null default 'manual' check (origem in ('manual','recorrencia','pedido_venda','compra','importacao','caixa_entrada','conciliacao')),
  origem_id uuid,
  favorito boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competencia_dia_1 check (extract(day from competencia) = 1),
  constraint parcela_valida check (parcela_numero is null or (parcela_total is not null and parcela_numero between 1 and parcela_total))
);
create index on agendamentos (empresa_id, tipo, status, vencimento);
create index on agendamentos (empresa_id, competencia);
create index on agendamentos (empresa_id, previsao);
create index on agendamentos (contato_id);
create index on agendamentos (recorrencia_id);
create index on agendamentos (grupo_parcelamento_id);
create index on agendamentos (empresa_id, origem, origem_id);

-- Rateio: cada linha é uma fatia (categoria + centro de custo opcional) do valor do título.
-- Sem rateio, há exatamente uma linha com o valor total.
create table agendamento_rateios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  agendamento_id uuid not null references agendamentos(id) on delete cascade,
  categoria_id uuid not null references categorias(id) on delete restrict,
  centro_custo_id uuid references centros_custo(id) on delete restrict,
  valor_cents bigint not null check (valor_cents > 0),
  descricao text
);
create index on agendamento_rateios (agendamento_id);
create index on agendamento_rateios (empresa_id, categoria_id);
create index on agendamento_rateios (empresa_id, centro_custo_id);

-- A soma do rateio precisa fechar com o valor do título (checado no fim da transação).
create or replace function app.checa_rateio() returns trigger language plpgsql as $$
declare
  v_ag uuid := coalesce(new.agendamento_id, old.agendamento_id);
  v_total bigint; v_soma bigint;
begin
  select valor_cents into v_total from agendamentos where id = v_ag;
  if v_total is null then return null; end if;  -- título foi excluído
  select coalesce(sum(valor_cents),0) into v_soma from agendamento_rateios where agendamento_id = v_ag;
  if v_soma <> v_total then
    raise exception 'Rateio do agendamento % soma % mas o título vale %', v_ag, v_soma, v_total
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger rateio_fecha
  after insert or update or delete on agendamento_rateios
  deferrable initially deferred
  for each row execute function app.checa_rateio();

create or replace function app.checa_rateio_do_titulo() returns trigger language plpgsql as $$
declare v_soma bigint;
begin
  select coalesce(sum(valor_cents),0) into v_soma from agendamento_rateios where agendamento_id = new.id;
  if v_soma <> new.valor_cents then
    raise exception 'Rateio do agendamento % soma % mas o título vale %', new.id, v_soma, new.valor_cents
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger titulo_tem_rateio
  after insert or update of valor_cents on agendamentos
  deferrable initially deferred
  for each row execute function app.checa_rateio_do_titulo();

-- Meses fechados: nada com data de caixa ou competência nesses meses pode mudar.
create table periodos_fechados (
  empresa_id uuid not null references empresas(id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  fechado_por uuid,
  fechado_em timestamptz not null default now(),
  primary key (empresa_id, mes)
);

create or replace function app.mes_fechado(p_empresa uuid, p_data date) returns boolean
language sql stable as $$
  select exists (select 1 from periodos_fechados
                 where empresa_id = p_empresa and mes = date_trunc('month', p_data)::date)
$$;

create table baixas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  agendamento_id uuid not null references agendamentos(id) on delete restrict,
  conta_id uuid not null references contas_financeiras(id) on delete restrict,
  data date not null,
  valor_cents bigint not null check (valor_cents > 0),   -- valor principal abatido
  juros_cents bigint not null default 0,
  multa_cents bigint not null default 0,
  desconto_cents bigint not null default 0,
  observacao text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on baixas (agendamento_id);
create index on baixas (empresa_id, conta_id, data);

-- Mantém pago_cents e status do agendamento.
create or replace function app.atualiza_saldo_agendamento() returns trigger language plpgsql as $$
declare v_ag uuid := coalesce(new.agendamento_id, old.agendamento_id);
begin
  update agendamentos a set
    pago_cents = s.pago,
    status = case
      when a.status in ('perda','cancelado') then a.status
      when s.pago = 0 then 'aberto'
      when s.pago < a.valor_cents - a.desconto_cents then 'parcial'
      else 'quitado' end,
    updated_at = now()
  from (select coalesce(sum(valor_cents),0) pago from baixas where agendamento_id = v_ag) s
  where a.id = v_ag;
  return null;
end $$;

create trigger baixa_saldo after insert or update or delete on baixas
  for each row execute function app.atualiza_saldo_agendamento();

create or replace function app.bloqueia_periodo_fechado() returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') and app.mes_fechado(old.empresa_id, old.data) then
    raise exception 'Mês % está fechado', to_char(old.data, 'MM/YYYY') using errcode = 'check_violation';
  end if;
  if tg_op in ('INSERT','UPDATE') and app.mes_fechado(new.empresa_id, new.data) then
    raise exception 'Mês % está fechado', to_char(new.data, 'MM/YYYY') using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

create trigger baixa_periodo before insert or update or delete on baixas
  for each row execute function app.bloqueia_periodo_fechado();

create table transferencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  conta_origem_id uuid not null references contas_financeiras(id) on delete restrict,
  conta_destino_id uuid not null references contas_financeiras(id) on delete restrict,
  data date not null,
  valor_cents bigint not null check (valor_cents > 0),
  descricao text,
  tipo text not null default 'transferencia' check (tipo in ('transferencia','pagamento_fatura','aplicacao','resgate')),
  created_at timestamptz not null default now(),
  constraint contas_diferentes check (conta_origem_id <> conta_destino_id)
);
create index on transferencias (empresa_id, data);
create index on transferencias (conta_origem_id);
create index on transferencias (conta_destino_id);

create trigger transferencia_periodo before insert or update or delete on transferencias
  for each row execute function app.bloqueia_periodo_fechado();

-- ---------------------------------------------------------------------------
-- 3. Extrato e conciliação
-- ---------------------------------------------------------------------------

create table importacoes_extrato (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  conta_id uuid not null references contas_financeiras(id) on delete cascade,
  origem text not null check (origem in ('ofx','planilha','pdf_ia','open_finance','cnab_retorno')),
  arquivo_path text,
  periodo_inicio date,
  periodo_fim date,
  total_linhas int not null default 0,
  linhas_novas int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on importacoes_extrato (conta_id, created_at desc);

create table movimentos_bancarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  conta_id uuid not null references contas_financeiras(id) on delete cascade,
  importacao_id uuid references importacoes_extrato(id) on delete cascade,
  data date not null,
  descricao text not null,
  valor_cents bigint not null check (valor_cents <> 0),   -- positivo entra, negativo sai
  cpf_cnpj_contraparte text,
  nome_contraparte text,
  id_externo text not null,       -- FITID do OFX ou id do Open Finance; garante idempotência
  status text not null default 'pendente' check (status in ('pendente','conciliado','ignorado')),
  sugestao jsonb,                 -- cache da melhor sugestão calculada
  regra_aplicada_id uuid,
  created_at timestamptz not null default now(),
  unique (conta_id, id_externo)
);
create index on movimentos_bancarios (empresa_id, conta_id, status, data);

-- Um movimento pode casar com várias baixas/transferências e vice-versa.
create table conciliacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  movimento_id uuid not null references movimentos_bancarios(id) on delete cascade,
  baixa_id uuid references baixas(id) on delete cascade,
  transferencia_id uuid references transferencias(id) on delete cascade,
  valor_cents bigint not null,
  modo text not null default 'manual' check (modo in ('sugestao','manual','regra','lote','multipla')),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint um_alvo check (num_nonnulls(baixa_id, transferencia_id) = 1)
);
create index on conciliacoes (movimento_id);
create index on conciliacoes (baixa_id);
create index on conciliacoes (transferencia_id);

create table regras_conciliacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('recebimento','pagamento','transferencia')),
  nome text not null,
  ordem int not null,
  contas uuid[],                    -- null = todas
  operador_logico text not null default 'todas' check (operador_logico in ('todas','qualquer')),
  condicoes jsonb not null check (jsonb_typeof(condicoes) = 'array' and jsonb_array_length(condicoes) between 1 and 20),
  -- [{campo:'cpf_cnpj'|'descricao'|'valor', operador:'igual'|'comeca_com'|'contem'|'vazio'|'maior'|'menor', valor:'...'}]
  acao_contato_id uuid references contatos(id) on delete set null,
  acao_categoria_id uuid references categorias(id) on delete set null,
  acao_centro_custo_id uuid references centros_custo(id) on delete set null,
  acao_descricao text,
  acao_contrapartida_conta_id uuid references contas_financeiras(id) on delete set null,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome),
  unique (empresa_id, tipo, ordem) deferrable initially deferred,
  constraint acao_presente check (
    (tipo = 'transferencia' and acao_contrapartida_conta_id is not null)
    or (tipo <> 'transferencia' and num_nonnulls(acao_contato_id, acao_categoria_id, acao_descricao) >= 1))
);

-- ---------------------------------------------------------------------------
-- 4. Cobrança, notas fiscais, CNAB, orçamento, documentos
-- ---------------------------------------------------------------------------

create table perfis_cobranca (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  provedor text not null check (provedor in ('asaas','inter','sicredi','sicoob','itau','bb','manual')),
  conta_repasse_id uuid references contas_financeiras(id) on delete restrict,
  meios text[] not null default '{boleto,pix}',
  juros_mes_percentual numeric(5,2) not null default 1.00,
  multa_percentual numeric(5,2) not null default 2.00,
  desconto_ate_vencimento_percentual numeric(5,2) not null default 0,
  lembretes_dias int[] not null default '{-3,0,3}',  -- antes(-)/depois(+) do vencimento
  canais text[] not null default '{email,whatsapp}',
  credenciais_ref text,   -- nome do segredo no cofre; nunca a credencial em si
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table cobrancas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  agendamento_id uuid not null references agendamentos(id) on delete cascade,
  perfil_cobranca_id uuid not null references perfis_cobranca(id) on delete restrict,
  meio text not null check (meio in ('boleto','pix','boleto_pix')),
  vencimento date not null,
  valor_cents bigint not null check (valor_cents > 0),
  status text not null default 'processando'
    check (status in ('processando','emitida','visualizada','paga','expirada','cancelada','erro')),
  id_externo text,
  linha_digitavel text,
  pix_copia_cola text,
  url_pdf text,
  enviada_em timestamptz,
  visualizada_em timestamptz,
  paga_em timestamptz,
  erro text,
  substitui_cobranca_id uuid references cobrancas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on cobrancas (agendamento_id);
create index on cobrancas (empresa_id, status, vencimento);
create unique index on cobrancas (perfil_cobranca_id, id_externo) where id_externo is not null;

create table webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  provedor text not null,
  id_evento text not null,
  payload jsonb not null,
  processado_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  unique (provedor, id_evento)     -- webhooks chegam duas vezes
);

create table notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  modelo text not null default 'nfe' check (modelo in ('nfe','nfce','nfse')),
  serie int not null default 1,
  numero int,
  destinatario_id uuid not null references contatos(id) on delete restrict,
  pedido_venda_id uuid,           -- FK adicionada depois de pedidos_venda
  natureza_operacao text not null default 'Venda de produção do estabelecimento',
  valor_total_cents bigint not null,
  status text not null default 'rascunho'
    check (status in ('rascunho','processando','autorizada','rejeitada','cancelando','cancelada','denegada')),
  chave_acesso text unique,
  protocolo text,
  motivo_rejeicao text,
  xml_path text,
  danfe_path text,
  provedor_ref text,
  emitida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, modelo, serie, numero)
);
create index on notas_fiscais (empresa_id, status, emitida_em);

create table remessas_cnab (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  conta_id uuid not null references contas_financeiras(id) on delete restrict,
  tipo text not null check (tipo in ('pagamento','pix')),
  arquivo_path text not null,
  agendamento_ids uuid[] not null,
  retorno_path text,
  retorno_resumo jsonb,
  created_at timestamptz not null default now()
);

create table orcamentos (
  empresa_id uuid not null references empresas(id) on delete cascade,
  ano smallint not null,
  centro_custo_id uuid references centros_custo(id) on delete cascade,
  categoria_id uuid not null references categorias(id) on delete cascade,
  mes smallint not null check (mes between 1 and 12),
  valor_cents bigint not null,
  updated_at timestamptz not null default now()
);
create unique index orcamentos_un on orcamentos (empresa_id, ano, coalesce(centro_custo_id, '00000000-0000-0000-0000-000000000000'::uuid), categoria_id, mes);

create table documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  origem text not null check (origem in ('caixa_entrada','anexo','fechamento')),
  arquivo_path text not null,
  nome_arquivo text not null,
  mime text,
  dados_extraidos jsonb,
  status text not null default 'novo' check (status in ('novo','processado','arquivado')),
  vinculo_tabela text,
  vinculo_id uuid,
  mes_referencia date,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on documentos (empresa_id, status);
create index on documentos (vinculo_tabela, vinculo_id);

-- ---------------------------------------------------------------------------
-- 5. Piscicultura: estrutura, lotes, apontamentos
-- ---------------------------------------------------------------------------

create table setores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  endereco jsonb not null default '{}',
  registro_sanitario text,       -- cadastro no órgão estadual / SIF/SIE/SIM do entreposto
  centro_custo_id uuid references centros_custo(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table viveiros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  setor_id uuid not null references setores(id) on delete restrict,
  nome text not null,
  finalidade text not null check (finalidade in ('cria','recria','producao','cria_recria')),
  sistema text not null default 'gaiola' check (sistema in ('gaiola','cage_free','free_range','caipira','organico')),
  capacidade_peixes int not null check (capacidade_peixes > 0),
  aeracao boolean not null default false,
  centro_custo_id uuid references centros_custo(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (setor_id, nome)
);
create index on viveiros (empresa_id);

create table especies (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,  -- null = catálogo global
  nome text not null,                 -- ex.: 'Hy-Line W-36', 'Lohmann LSL-Lite', 'Dekalb White'
  cor_ovo text not null check (cor_ovo in ('branco','vermelho')),
  created_at timestamptz not null default now()
);

create table curvas_crescimento (
  especie_id uuid not null references especies(id) on delete cascade,
  semana smallint not null check (semana between 1 and 120),
  pct_engorda numeric(5,2),          -- % peixe-dia
  peso_ovo_g numeric(5,2),
  consumo_g_peixe_dia numeric(6,2),
  peso_g numeric(7,1),
  sobrevivencia_pct numeric(5,2),
  ovos_peixe_povoada_acum numeric(6,1),
  primary key (especie_id, semana)
);

create table lotes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  codigo text not null,
  especie_id uuid not null references especies(id) on delete restrict,
  data_nascimento date not null,
  data_povoamento date not null,
  qtd_povoada int not null check (qtd_povoada > 0),
  fornecedor_id uuid references contatos(id) on delete set null,
  custo_aquisicao_cents bigint not null default 0,   -- alevinos ou juvenis
  custo_recria_cents bigint not null default 0,      -- acumulado até a transferência para produção (job mensal)
  inicio_producao date,
  previsao_despesca date,
  ciclos_previstos_semanas smallint,                  -- base para amortizar o peixe
  fase text not null default 'cria' check (fase in ('cria','recria','producao','muda','descartado')),
  centro_custo_id uuid references centros_custo(id) on delete set null,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, codigo),
  constraint povoamento_apos_nascimento check (data_povoamento >= data_nascimento)
);
create index on lotes (empresa_id, fase);

-- Um lote pode ocupar vários viveiros e mudar de viveiro (recria -> produção).
-- Um viveiro não pode ter dois lotes ao mesmo tempo (regra configurável no futuro).
create table lote_alocacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  lote_id uuid not null references lotes(id) on delete cascade,
  viveiro_id uuid not null references viveiros(id) on delete restrict,
  qtd_peixes int not null check (qtd_peixes > 0),
  periodo daterange not null,
  motivo text not null default 'povoamento' check (motivo in ('povoamento','transferencia','divisao')),
  exclude using gist (viveiro_id with =, periodo with &&)
);
create index on lote_alocacoes (lote_id);

create table classes_peixe (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,                 -- Jumbo, Extra, Grande, Médio, Pequeno, Industrial, Trincado, Descarte
  peso_min_g numeric(5,2),
  peso_max_g numeric(5,2),
  comercializavel boolean not null default true,
  ordem smallint not null default 0,
  unique (empresa_id, nome)
);

-- Uma linha por lote + viveiro + dia. client_id torna o envio offline idempotente.
create table apontamentos_diarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  lote_id uuid not null references lotes(id) on delete cascade,
  viveiro_id uuid not null references viveiros(id) on delete restrict,
  data date not null,
  peixes_inicio_dia int not null check (peixes_inicio_dia >= 0),   -- calculado no servidor
  mortes int not null default 0 check (mortes >= 0),
  descartes int not null default 0 check (descartes >= 0),
  causas_morte jsonb not null default '{}',     -- {"prolapso":2,"canibalismo":1}
  ovos_total int not null default 0 check (ovos_total >= 0),
  peso_medio_ovo_g numeric(5,2),
  racao_kg numeric(10,3) not null default 0 check (racao_kg >= 0),
  racao_produto_id uuid,                        -- FK adicionada depois de produtos
  agua_l numeric(10,1),
  temp_min_c numeric(4,1),
  temp_max_c numeric(4,1),
  horas_luz numeric(4,1),
  observacoes text,
  origem text not null default 'web' check (origem in ('web','app','importacao','sensor')),
  client_id uuid unique,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lote_id, viveiro_id, data),
  constraint baixas_cabem check (mortes + descartes <= peixes_inicio_dia)
);
create index on apontamentos_diarios (empresa_id, data);
create index on apontamentos_diarios (viveiro_id, data);

create table apontamento_ovos (
  apontamento_id uuid not null references apontamentos_diarios(id) on delete cascade,
  classe_id uuid not null references classes_peixe(id) on delete restrict,
  quantidade int not null check (quantidade >= 0),
  primary key (apontamento_id, classe_id)
);
create index on apontamento_ovos (classe_id);

create table eventos_sanitarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  lote_id uuid not null references lotes(id) on delete cascade,
  viveiro_id uuid references viveiros(id) on delete set null,
  data date not null,
  tipo text not null check (tipo in ('vacina','medicacao','pesagem','debicagem','muda','exame','limpeza','outro')),
  produto_id uuid,                 -- FK adicionada depois de produtos
  via text,
  dose text,
  carencia_dias smallint not null default 0,   -- ovos não podem ser vendidos até data + carência
  peso_medio_g numeric(7,1),
  uniformidade_pct numeric(5,2),
  responsavel text,
  observacoes text,
  status text not null default 'realizado' check (status in ('planejado','realizado','cancelado')),
  created_at timestamptz not null default now()
);
create index on eventos_sanitarios (lote_id, data);
create index on eventos_sanitarios (empresa_id, status, data);

-- ---------------------------------------------------------------------------
-- 6. Estoque, ração, vendas
-- ---------------------------------------------------------------------------

create table depositos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('ovos','insumos','racao','almoxarifado','expedicao')),
  setor_id uuid references setores(id) on delete set null,
  unique (empresa_id, nome)
);

create table produtos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('ovo','racao','insumo_racao','embalagem','medicamento','vacina','peixe','outro')),
  nome text not null,
  sku text,
  unidade text not null,              -- un, dz, cx30dz, kg, t, l
  fator_kg numeric(10,2),           -- quantos ovos há em 1 unidade (cx 30 dz = 360)
  classe_peixe_id uuid references classes_peixe(id) on delete restrict,
  ncm text,                           -- 0407.21.00 para ovos de peixe frescos
  cfop_padrao text,
  categoria_financeira_id uuid references categorias(id) on delete set null,
  custo_medio_cents numeric(14,4) not null default 0,   -- por unidade, atualizado nas entradas
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (empresa_id, nome)
);
create index on produtos (empresa_id, tipo);

alter table apontamentos_diarios add foreign key (racao_produto_id) references produtos(id) on delete set null;
alter table eventos_sanitarios add foreign key (produto_id) references produtos(id) on delete set null;

create table movimentos_estoque (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete restrict,
  deposito_id uuid not null references depositos(id) on delete restrict,
  data date not null,
  tipo text not null check (tipo in ('entrada_compra','producao_ovos','producao_racao','consumo_lote','consumo_producao','venda','ajuste','transferencia','perda')),
  quantidade numeric(14,3) not null check (quantidade <> 0),   -- + entra, - sai
  custo_unit_cents numeric(14,4),
  lote_id uuid references lotes(id) on delete set null,
  viveiro_id uuid references viveiros(id) on delete set null,
  lote_embalagem text,               -- rastreabilidade do ovo embalado
  validade date,
  origem_tabela text,
  origem_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on movimentos_estoque (empresa_id, produto_id, deposito_id, data);
create index on movimentos_estoque (lote_id, data);
create index on movimentos_estoque (origem_tabela, origem_id);

create view saldos_estoque with (security_invoker = true) as
  select empresa_id, produto_id, deposito_id, sum(quantidade) as saldo
  from movimentos_estoque group by empresa_id, produto_id, deposito_id;

create table formulas_racao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  produto_racao_id uuid not null references produtos(id) on delete restrict,
  fase text not null,                -- inicial, crescimento, pré-engorda, engorda 1, engorda 2...
  versao int not null default 1,
  vigente boolean not null default true,
  created_at timestamptz not null default now(),
  unique (produto_racao_id, versao)
);
create unique index on formulas_racao (produto_racao_id) where vigente;

create table formula_itens (
  formula_id uuid not null references formulas_racao(id) on delete cascade,
  insumo_id uuid not null references produtos(id) on delete restrict,
  kg_por_tonelada numeric(8,3) not null check (kg_por_tonelada > 0),
  primary key (formula_id, insumo_id)
);

create table ordens_producao_racao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  formula_id uuid not null references formulas_racao(id) on delete restrict,
  data date not null,
  toneladas numeric(10,3) not null check (toneladas > 0),
  deposito_destino_id uuid not null references depositos(id) on delete restrict,
  custo_total_cents bigint,
  status text not null default 'aberta' check (status in ('aberta','produzida','cancelada')),
  created_at timestamptz not null default now()
);
create index on ordens_producao_racao (empresa_id, data);

create table pedidos_venda (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  numero int not null,
  cliente_id uuid not null references contatos(id) on delete restrict,
  vendedor_user_id uuid,
  data date not null default current_date,
  entrega_prevista date,
  rota text,
  condicao_pagamento jsonb not null default '{"parcelas":[{"dias":0,"pct":100}]}',
  forma_pagamento text,
  status text not null default 'aberto' check (status in ('rascunho','aberto','separado','faturado','entregue','cancelado')),
  total_cents bigint not null default 0,
  origem text not null default 'web' check (origem in ('web','app')),
  client_id uuid unique,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index on pedidos_venda (empresa_id, status, data);
create index on pedidos_venda (cliente_id, data);

create table pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos_venda(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete restrict,
  quantidade numeric(12,3) not null check (quantidade > 0),
  preco_unit_cents bigint not null check (preco_unit_cents >= 0),
  desconto_cents bigint not null default 0,
  total_cents bigint generated always as ((round(quantidade * preco_unit_cents))::bigint - desconto_cents) stored
);
create index on pedido_itens (pedido_id);
create index on pedido_itens (produto_id);

alter table notas_fiscais add foreign key (pedido_venda_id) references pedidos_venda(id) on delete set null;
create index on notas_fiscais (pedido_venda_id);

create table tabelas_preco (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  cliente_id uuid references contatos(id) on delete cascade,   -- null = preço geral
  preco_cents bigint not null check (preco_cents >= 0),
  vigencia daterange not null,
  exclude using gist (produto_id with =, (coalesce(cliente_id,'00000000-0000-0000-0000-000000000000'::uuid)) with =, vigencia with &&)
);

-- ---------------------------------------------------------------------------
-- 7. Custo do kg (preenchido por job de fechamento mensal)
-- ---------------------------------------------------------------------------

create table custos_lote_mensal (
  empresa_id uuid not null references empresas(id) on delete cascade,
  lote_id uuid not null references lotes(id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  peixes_medios numeric(12,1) not null,
  kg_despescados int not null,
  duzias numeric(12,2) generated always as (kg_despescados / 12.0) stored,
  racao_kg numeric(14,3) not null,
  racao_cents bigint not null default 0,
  alevinos_cents bigint not null default 0,
  sanidade_cents bigint not null default 0,
  mao_obra_cents bigint not null default 0,
  energia_cents bigint not null default 0,
  embalagem_cents bigint not null default 0,
  outros_diretos_cents bigint not null default 0,
  indiretos_rateados_cents bigint not null default 0,
  custo_total_cents bigint generated always as (racao_cents + alevinos_cents + sanidade_cents + mao_obra_cents
    + energia_cents + embalagem_cents + outros_diretos_cents + indiretos_rateados_cents) stored,
  calculado_em timestamptz not null default now(),
  primary key (lote_id, mes)
);
create index on custos_lote_mensal (empresa_id, mes);

-- Indicadores diários do lote. Fórmulas a validar com a piscicultura.
create view indicadores_lote_dia with (security_invoker = true) as
select
  a.empresa_id, a.lote_id, a.data,
  ((a.data - l.data_nascimento) / 7 + 1)::int                       as semana,
  sum(a.peixes_inicio_dia)                                            as peixes,
  sum(a.mortes + a.descartes)                                      as baixas_peixes,
  sum(a.ovos_total)                                                 as ovos,
  round(100.0 * sum(a.ovos_total) / nullif(sum(a.peixes_inicio_dia),0), 2)          as pct_engorda,
  round(1000.0 * sum(a.racao_kg) / nullif(sum(a.peixes_inicio_dia),0), 1)           as consumo_g_peixe_dia,
  round(sum(a.racao_kg) / nullif(sum(a.ovos_total) / 12.0, 0), 3)                 as kg_racao_por_duzia,
  round(100.0 * sum(a.mortes + a.descartes) / nullif(sum(a.peixes_inicio_dia),0), 3) as mortalidade_dia_pct
from apontamentos_diarios a
join lotes l on l.id = a.lote_id
group by a.empresa_id, a.lote_id, a.data, l.data_nascimento;

-- ---------------------------------------------------------------------------
-- 8. RLS: toda tabela com empresa_id só é visível para membros da empresa
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_name = c.table_name and tb.table_schema = c.table_schema
    where c.table_schema = 'public' and c.column_name = 'empresa_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy membros on %I using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()))', t);
  end loop;
end $$;

alter table empresas enable row level security;
create policy membros on empresas using (id in (select app.minhas_empresas()));

-- Tabelas filhas sem empresa_id herdam o acesso pelo pai
alter table apontamento_ovos enable row level security;
create policy membros on apontamento_ovos using (
  exists (select 1 from apontamentos_diarios a where a.id = apontamento_id and a.empresa_id in (select app.minhas_empresas())));
alter table pedido_itens enable row level security;
create policy membros on pedido_itens using (
  exists (select 1 from pedidos_venda p where p.id = pedido_id and p.empresa_id in (select app.minhas_empresas())));
alter table formula_itens enable row level security;
create policy membros on formula_itens using (
  exists (select 1 from formulas_racao f where f.id = formula_id and f.empresa_id in (select app.minhas_empresas())));
alter table curvas_crescimento enable row level security;
create policy leitura on curvas_crescimento for select using (
  exists (select 1 from especies g where g.id = especie_id and (g.empresa_id is null or g.empresa_id in (select app.minhas_empresas()))));
-- espécies globais (empresa_id null) são legíveis por todos
create policy globais on especies for select using (empresa_id is null);
-- webhook_eventos: só o service role (sem policy = sem acesso via API pública)
alter table webhook_eventos enable row level security;
