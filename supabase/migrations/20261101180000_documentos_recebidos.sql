-- C3, C4 e A8 do estudo de automação (docs/estudo-automacao.html).
--
-- C3 documentos_recebidos: boleto, nota ou recibo em foto/PDF lido por IA vira conta a pagar PROPOSTA;
--    a pessoa confere e lança (fornecedor reconhecido pelo CNPJ, criado se não existir).
-- C4 caixa de entrada: cada empresa ganha um endereço de e-mail próprio (token em automacoes_empresa).
--    XML de NF-e vai para nfes_recebidas; PDF e foto passam pela IA e caem aqui.
-- A8 contagem de peixes mortos por foto: só usa a IA, sem tabela própria.
-- ia_uso conta as leituras por IA da empresa no mês, com limite (padrão 200) para o custo não fugir.

alter table automacoes_empresa
  add column entrada_token text unique default substr(md5(gen_random_uuid()::text), 1, 20),
  add column ia_limite_mes int not null default 200 check (ia_limite_mes between 0 and 5000);

create table ia_uso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('documento', 'mortalidade')),
  user_id uuid,
  created_at timestamptz not null default now()
);
create index on ia_uso (empresa_id, created_at);
alter table ia_uso enable row level security;
create policy membros on ia_uso for select using (empresa_id in (select app.minhas_empresas()));

-- Anota uma leitura por IA, ou recusa se a empresa passou do limite do mês. Quem chama a IA chama isto
-- antes. Pelo app (membro da empresa) ou pelo servidor (caixa de e-mail).
create or replace function public.registrar_uso_ia(p_empresa uuid, p_tipo text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_limite int;
  v_usadas int;
begin
  if auth.uid() is not null and p_empresa not in (select app.minhas_empresas()) then
    raise exception 'Empresa não encontrada' using errcode = 'insufficient_privilege';
  end if;
  if not app.empresa_liberada(p_empresa) then
    raise exception 'Assinatura da empresa suspensa' using errcode = 'insufficient_privilege';
  end if;
  select coalesce((select ia_limite_mes from automacoes_empresa where empresa_id = p_empresa), 200) into v_limite;
  select count(*) into v_usadas from ia_uso
  where empresa_id = p_empresa and created_at >= date_trunc('month', now() at time zone (select fuso from empresas where id = p_empresa))
                                                at time zone (select fuso from empresas where id = p_empresa);
  if v_usadas >= v_limite then
    raise exception 'A empresa já usou as % leituras por IA deste mês', v_limite using errcode = 'check_violation';
  end if;
  insert into ia_uso (empresa_id, tipo, user_id) values (p_empresa, p_tipo, auth.uid());
  return v_limite - v_usadas - 1;
end $$;

create table documentos_recebidos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  origem text not null check (origem in ('upload', 'email')),
  nome_arquivo text,
  remetente text,
  dados jsonb not null default '{}',
  linha_digitavel text check (linha_digitavel is null or linha_digitavel ~ '^\d{47,48}$'),
  status text not null default 'nova' check (status in ('nova', 'lancada', 'ignorada')),
  erro text,
  contato_id uuid references contatos(id) on delete set null,
  agendamento_id uuid references agendamentos(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on documentos_recebidos (empresa_id, status, created_at desc);
create index on documentos_recebidos (contato_id);
create index on documentos_recebidos (agendamento_id);
alter table documentos_recebidos enable row level security;
create policy membros on documentos_recebidos using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on documentos_recebidos as restrictive for insert with check (app.pode(empresa_id, 'contas-a-pagar.editar'));
create policy escrita_alterar on documentos_recebidos as restrictive for update
  using (app.pode(empresa_id, 'contas-a-pagar.editar')) with check (app.pode(empresa_id, 'contas-a-pagar.editar'));
create policy sem_apagar on documentos_recebidos as restrictive for delete using (false);

-- Lança o documento como conta a pagar com o que a pessoa conferiu na tela. Fornecedor: o do CNPJ/CPF
-- informado; sem cadastro, é criado com o nome.
create or replace function public.lancar_documento_recebido(
  p_doc uuid, p_descricao text, p_valor_cents bigint, p_vencimento date, p_competencia date,
  p_categoria uuid, p_centro uuid default null, p_fornecedor_nome text default null, p_fornecedor_doc text default null)
returns uuid
language plpgsql set search_path = public as $$
declare
  d documentos_recebidos;
  v_doc text := nullif(regexp_replace(coalesce(p_fornecedor_doc, ''), '\D', '', 'g'), '');
  v_contato uuid;
  v_titulo uuid;
begin
  select * into d from documentos_recebidos where id = p_doc for update;
  if d.id is null then raise exception 'Documento não encontrado'; end if;
  if d.status <> 'nova' then raise exception 'Este documento já foi lançado ou ignorado' using errcode = 'check_violation'; end if;
  if not app.pode(d.empresa_id, 'contas-a-pagar.editar') then
    raise exception 'Seu usuário não pode lançar contas a pagar' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_valor_cents, 0) <= 0 then raise exception 'Informe o valor' using errcode = 'check_violation'; end if;
  if nullif(trim(p_descricao), '') is null then raise exception 'Informe a descrição' using errcode = 'check_violation'; end if;
  if v_doc is not null and v_doc !~ '^(\d{11}|\d{14})$' then raise exception 'CPF/CNPJ do fornecedor inválido' using errcode = 'check_violation'; end if;

  if v_doc is not null then
    select id into v_contato from contatos where empresa_id = d.empresa_id and cpf_cnpj = v_doc and not arquivado
    order by created_at limit 1;
  end if;
  if v_contato is null and nullif(trim(p_fornecedor_nome), '') is not null then
    insert into contatos (empresa_id, tipos, nome, cpf_cnpj) values (d.empresa_id, '{fornecedor}', trim(p_fornecedor_nome), v_doc)
    returning id into v_contato;
  end if;

  v_titulo := public.agendar_titulo(d.empresa_id, 'pagar', trim(p_descricao), p_vencimento, coalesce(p_competencia, p_vencimento),
    p_valor_cents, jsonb_build_array(jsonb_build_object('categoria_id', p_categoria, 'centro_custo_id', p_centro, 'valor_cents', p_valor_cents)),
    v_contato, d.linha_digitavel, 1, case when d.linha_digitavel is not null then 'boleto' end);

  update documentos_recebidos set status = 'lancada', contato_id = v_contato, agendamento_id = v_titulo where id = p_doc;
  return v_titulo;
end $$;

-- Caixa de e-mail: a empresa do endereço (token depois do +). Só o servidor chama.
create or replace function public.empresa_da_entrada(p_token text)
returns uuid
language sql stable security definer set search_path = public as $$
  select a.empresa_id from automacoes_empresa a
  where a.entrada_token = p_token and length(p_token) >= 16 and app.empresa_liberada(a.empresa_id)
$$;

revoke all on function public.empresa_da_entrada(text), public.registrar_uso_ia(uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.empresa_da_entrada(text), public.registrar_uso_ia(uuid, text),
      public.lancar_documento_recebido(uuid, text, bigint, date, date, uuid, uuid, text, text) from anon;
    revoke all on function public.empresa_da_entrada(text) from authenticated;
    grant execute on function public.empresa_da_entrada(text) to service_role;
    grant execute on function public.registrar_uso_ia(uuid, text) to authenticated, service_role;
    grant execute on function public.lancar_documento_recebido(uuid, text, bigint, date, date, uuid, uuid, text, text) to authenticated;
  end if;
end $$;

select app.travar_referencias();
