-- B1 do estudo de automação: NF-e de compra chegando sozinhas pela SEFAZ (Manifestação do Destinatário
-- pela Focus NFe). A rotina /api/cron/automacoes busca as notas emitidas contra o CNPJ da piscicultura e grava
-- aqui como "nova"; uma pessoa lança como conta a pagar (fornecedor, valor e emissão já preenchidos,
-- categoria sugerida pelo histórico do fornecedor) ou ignora. A manifestação (ciência, confirmação,
-- desconhecimento, operação não realizada) é sempre um botão de quem tem permissão, nunca automática.

alter table automacoes_empresa
  add column mde_ligado boolean not null default false,
  add column mde_versao bigint not null default 0,
  add column mde_consultado_em timestamptz;

create table nfes_recebidas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  chave text not null check (chave ~ '^\d{44}$'),
  emitente_nome text not null,
  emitente_documento text,
  valor_cents bigint not null default 0,
  emissao timestamptz,
  situacao text not null default 'autorizada' check (situacao in ('autorizada', 'cancelada', 'denegada')),
  manifestacao text not null default 'nulo' check (manifestacao in ('nulo', 'ciencia', 'confirmacao', 'desconhecimento', 'nao_realizada')),
  completa boolean not null default false,
  versao bigint not null default 0,
  status text not null default 'nova' check (status in ('nova', 'lancada', 'ignorada')),
  contato_id uuid references contatos(id) on delete set null,
  agendamento_id uuid references agendamentos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, chave)
);
create index on nfes_recebidas (empresa_id, status, emissao desc);
create index on nfes_recebidas (contato_id);
create index on nfes_recebidas (agendamento_id);
alter table nfes_recebidas enable row level security;
create policy membros on nfes_recebidas using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
-- só a rotina do servidor grava notas novas; quem lança contas muda a situação
create policy sem_inserir on nfes_recebidas as restrictive for insert with check (false);
create policy sem_apagar on nfes_recebidas as restrictive for delete using (false);
create policy escrita_alterar on nfes_recebidas as restrictive for update
  using (app.pode(empresa_id, 'contas-a-pagar.editar')) with check (app.pode(empresa_id, 'contas-a-pagar.editar'));

-- Empresas com a busca ligada e sem consulta na última hora (só o servidor chama): CNPJ e a última
-- versão já lida na Focus.
create or replace function public.mde_empresas_ligadas()
returns table (empresa_id uuid, cnpj text, versao bigint)
language sql stable security definer set search_path = public as $$
  select a.empresa_id, e.cnpj, a.mde_versao
  from automacoes_empresa a join empresas e on e.id = a.empresa_id
  where a.mde_ligado and e.cnpj ~ '^\d{14}$'
    and app.empresa_liberada(a.empresa_id) and app.plano_inclui(a.empresa_id, 'notas')
    and (a.mde_consultado_em is null or a.mde_consultado_em < now() - interval '55 minutes')
$$;

-- Grava o lote devolvido pela Focus (formato de /v2/nfes_recebidas) e a nova versão. Devolve quantas
-- notas eram novas. Nota que já existia só atualiza situação, manifestação e se o XML está completo.
create or replace function public.registrar_nfes_recebidas(p_empresa uuid, p_notas jsonb, p_versao bigint)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_novas int;
begin
  with dados as (
    select n->>'chave_nfe' as chave, coalesce(nullif(n->>'nome_emitente', ''), 'Emitente sem nome') as nome,
           nullif(regexp_replace(coalesce(n->>'documento_emitente', ''), '\D', '', 'g'), '') as documento,
           round(coalesce(nullif(n->>'valor_total', '')::numeric, 0) * 100)::bigint as valor,
           nullif(n->>'data_emissao', '')::timestamptz as emissao,
           coalesce(nullif(n->>'situacao', ''), 'autorizada') as situacao,
           coalesce(nullif(n->>'manifestacao_destinatario', ''), 'nulo') as manifestacao,
           coalesce((n->>'nfe_completa')::boolean, false) as completa,
           coalesce((n->>'versao')::bigint, 0) as versao
    from jsonb_array_elements(p_notas) n
    where n->>'chave_nfe' ~ '^\d{44}$' and coalesce(n->>'tipo_nfe', '1') = '1'
  ), gravadas as (
    insert into nfes_recebidas as r (empresa_id, chave, emitente_nome, emitente_documento, valor_cents, emissao,
                                     situacao, manifestacao, completa, versao, contato_id)
    select p_empresa, d.chave, d.nome, d.documento, d.valor, d.emissao, d.situacao, d.manifestacao, d.completa, d.versao,
           (select c.id from contatos c where c.empresa_id = p_empresa and c.cpf_cnpj = d.documento and not c.arquivado
            order by c.created_at limit 1)
    from dados d
    on conflict (empresa_id, chave) do update
      set situacao = excluded.situacao, manifestacao = excluded.manifestacao, completa = excluded.completa,
          versao = excluded.versao, updated_at = now()
    returning (xmax = 0) as nova
  )
  select count(*) filter (where nova) into v_novas from gravadas;
  update automacoes_empresa set mde_versao = greatest(mde_versao, p_versao), mde_consultado_em = now()
  where empresa_id = p_empresa;
  return v_novas;
end $$;

-- Categoria e centro de custo de costume do fornecedor: os do último título a pagar dele.
create or replace function public.custeio_habitual(p_contato uuid)
returns table (categoria_id uuid, centro_custo_id uuid)
language sql stable set search_path = public as $$
  select r.categoria_id, r.centro_custo_id
  from agendamentos a
  cross join lateral (select x.categoria_id, x.centro_custo_id from agendamento_rateios x
                      where x.agendamento_id = a.id order by x.valor_cents desc limit 1) r
  where a.contato_id = p_contato and a.tipo = 'pagar' and a.status <> 'cancelado'
  order by a.created_at desc
  limit 1
$$;

-- Lança a nota como conta a pagar. Sem fornecedor cadastrado, cadastra com o nome e o CNPJ/CPF da nota.
create or replace function public.lancar_nfe_recebida(p_nfe uuid, p_vencimento date, p_categoria uuid,
                                                      p_centro uuid default null)
returns uuid
language plpgsql set search_path = public as $$
declare
  n nfes_recebidas;
  v_contato uuid;
  v_titulo uuid;
begin
  select * into n from nfes_recebidas where id = p_nfe for update;
  if n.id is null then raise exception 'Nota não encontrada'; end if;
  if n.status <> 'nova' then raise exception 'Esta nota já foi lançada ou ignorada' using errcode = 'check_violation'; end if;
  if n.situacao <> 'autorizada' then raise exception 'Nota cancelada ou denegada não vira conta' using errcode = 'check_violation'; end if;
  if n.valor_cents <= 0 then raise exception 'Nota sem valor' using errcode = 'check_violation'; end if;
  if not app.pode(n.empresa_id, 'contas-a-pagar.editar') then
    raise exception 'Seu usuário não pode lançar contas a pagar' using errcode = 'insufficient_privilege';
  end if;

  v_contato := n.contato_id;
  if v_contato is null and n.emitente_documento ~ '^(\d{11}|\d{14})$' then
    select id into v_contato from contatos where empresa_id = n.empresa_id and cpf_cnpj = n.emitente_documento and not arquivado
    order by created_at limit 1;
  end if;
  if v_contato is null then
    insert into contatos (empresa_id, tipos, nome, cpf_cnpj)
    values (n.empresa_id, '{fornecedor}', n.emitente_nome,
            case when n.emitente_documento ~ '^(\d{11}|\d{14})$' then n.emitente_documento end)
    returning id into v_contato;
  end if;

  v_titulo := public.agendar_titulo(n.empresa_id, 'pagar',
    format('NF-e %s · %s', ltrim(substr(n.chave, 26, 9), '0'), n.emitente_nome),
    p_vencimento, coalesce((n.emissao at time zone (select fuso from empresas where id = n.empresa_id))::date, p_vencimento), n.valor_cents,
    jsonb_build_array(jsonb_build_object('categoria_id', p_categoria, 'centro_custo_id', p_centro, 'valor_cents', n.valor_cents)),
    v_contato, n.chave);

  update nfes_recebidas set status = 'lancada', contato_id = v_contato, agendamento_id = v_titulo, updated_at = now()
  where id = p_nfe;
  return v_titulo;
end $$;

revoke all on function public.mde_empresas_ligadas(), public.registrar_nfes_recebidas(uuid, jsonb, bigint) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.mde_empresas_ligadas(), public.registrar_nfes_recebidas(uuid, jsonb, bigint) from anon, authenticated;
    grant execute on function public.mde_empresas_ligadas(), public.registrar_nfes_recebidas(uuid, jsonb, bigint) to service_role;
    revoke all on function public.custeio_habitual(uuid), public.lancar_nfe_recebida(uuid, date, uuid, uuid) from anon;
    grant execute on function public.custeio_habitual(uuid), public.lancar_nfe_recebida(uuid, date, uuid, uuid) to authenticated;
  end if;
end $$;

select app.travar_referencias();
