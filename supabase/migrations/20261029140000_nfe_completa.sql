-- NF-e completa pela Focus NFe: emitente de cada piscicultura cadastrado na Focus (certificado A1 enviado
-- pelo app), NFC-e da venda de balcão, carta de correção e inutilização de numeração.

-- Emitente da piscicultura na Focus (API de empresas). Os membros veem a situação; só o servidor grava,
-- depois de a Focus aceitar o certificado. Os tokens da Focus dessa piscicultura ficam cifrados à parte.
create table focus_emitentes (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  focus_id text not null,
  habilita_nfce boolean not null default false,
  certificado_valido_ate timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table focus_emitentes enable row level security;
create policy membros on focus_emitentes for select using (empresa_id in (select app.minhas_empresas()));
revoke insert, update, delete on focus_emitentes from anon, authenticated;

create table focus_emitentes_segredos (
  emitente_id uuid primary key references focus_emitentes(empresa_id) on delete cascade,
  token_homologacao_cifrado text,
  token_producao_cifrado text
);
alter table focus_emitentes_segredos enable row level security;
revoke all on focus_emitentes_segredos from anon, authenticated;

-- O que a Focus devolve depois da autorização: cancelamento, carta de correção e QR Code da NFC-e.
alter table notas_fiscais
  add column ambiente text check (ambiente in ('homologacao', 'producao')),
  add column xml_cancelamento_path text,
  add column cce_numero int,
  add column cce_texto text,
  add column cce_xml_path text,
  add column cce_pdf_path text,
  add column qrcode_url text;

-- Série da NFC-e: separada da NF-e (cada modelo tem a sua numeração)
create or replace function app.config_fiscal(e empresas) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'cfop_interna', '5101', 'cfop_interestadual', '6101',
    'icms_situacao', case when e.regime_tributario = 'simples' then '400' else '40' end,
    'pis_situacao', case when e.regime_tributario = 'simples' then '49' else '06' end,
    'cofins_situacao', case when e.regime_tributario = 'simples' then '49' else '06' end,
    'serie', 1, 'serie_nfce', 1, 'informacoes_adicionais', '',
    -- Funrural + Senar sobre a receita bruta do produtor pessoa física (1,2% + 0,1% + 0,2%)
    'funrural_percentual', case when e.regime_tributario = 'produtor_rural' then 1.5 else 0 end
  ) || case when e.regime_tributario = 'produtor_rural'
            -- produtor pessoa física não é contribuinte de PIS/COFINS: operação sem incidência
            then jsonb_build_object('icms_situacao', '40', 'pis_situacao', '08', 'cofins_situacao', '08') else '{}' end
    || e.config_fiscal
$$;

-- NFC-e (modelo 65) de uma venda já recebida. Só CNPJ: o produtor rural pessoa física emite NF-e.
create or replace function public.preparar_nfce(p_pedido uuid) returns uuid
language plpgsql set search_path = public as $$
declare
  p pedidos_venda%rowtype;
  v_id uuid;
  v_doc text;
begin
  select * into p from pedidos_venda where id = p_pedido;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'no_data_found'; end if;
  if p.status not in ('faturado', 'entregue') then
    raise exception 'Fature o pedido antes de emitir a nota' using errcode = 'check_violation';
  end if;
  select cnpj into v_doc from empresas where id = p.empresa_id;
  if length(v_doc) <> 14 then
    raise exception 'NFC-e só pode ser emitida por CNPJ. Produtor rural pessoa física emite NF-e' using errcode = 'check_violation';
  end if;

  v_id := gen_random_uuid();
  insert into notas_fiscais (id, empresa_id, destinatario_id, pedido_venda_id, valor_total_cents, status, provedor_ref,
                             modelo, serie, natureza_operacao)
  select v_id, p.empresa_id, p.cliente_id, p.id, p.total_cents, 'processando', 'balbina-' || replace(v_id::text, '-', ''),
         'nfce', (app.config_fiscal(e)->>'serie_nfce')::int, 'Venda ao consumidor'
  from empresas e where e.id = p.empresa_id;
  return v_id;
exception when unique_violation then
  raise exception 'Este pedido já tem uma nota emitida ou em processamento' using errcode = 'check_violation';
end $$;

-- Como o cliente pagou a venda (para os meios de pagamento da NFC-e). Quem opera o PDV não lê as
-- baixas do financeiro, então a função lê por ele, só de pedido da própria empresa.
create or replace function public.pagamentos_do_pedido(p_pedido uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('forma', forma, 'valor_cents', valor_cents) order by valor_cents desc), '[]')
  from (
    select coalesce(b.forma_pagamento, p.forma_pagamento, 'dinheiro') as forma, sum(b.valor_cents)::bigint as valor_cents
    from pedidos_venda p
    join agendamentos a on a.origem = 'pedido_venda' and a.origem_id = p.id
    join baixas b on b.agendamento_id = a.id
    where p.id = p_pedido and p.empresa_id in (select app.minhas_empresas())
    group by 1
  ) x
$$;
revoke all on function public.pagamentos_do_pedido(uuid) from public, anon;

-- Inutilização de numeração: número de nota que pulou (rejeição, falha) e nunca vai ser usado.
create table inutilizacoes_nfe (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  modelo text not null check (modelo in ('nfe', 'nfce')),
  serie int not null check (serie between 0 and 999),
  numero_inicial int not null check (numero_inicial > 0),
  numero_final int not null,
  justificativa text not null check (length(btrim(justificativa)) between 15 and 255),
  status text not null default 'processando' check (status in ('processando', 'autorizada', 'rejeitada')),
  ambiente text check (ambiente in ('homologacao', 'producao')),
  protocolo text,
  motivo text,
  xml_path text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (numero_final >= numero_inicial and numero_final - numero_inicial < 1000)
);
create index on inutilizacoes_nfe (empresa_id, created_at desc);
alter table inutilizacoes_nfe enable row level security;
create policy membros on inutilizacoes_nfe using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
-- Inutilizar é como cancelar: exige a mesma permissão e o módulo de notas no plano
do $$
declare
  v_cond text := 'app.pode_algum(empresa_id, array[''vendas.cancelar'']) and app.plano_inclui(empresa_id, ''notas'')';
begin
  execute format('create policy escrita_inserir on inutilizacoes_nfe as restrictive for insert with check (%s)', v_cond);
  execute format('create policy escrita_alterar on inutilizacoes_nfe as restrictive for update using (%s) with check (%s)', v_cond, v_cond);
  execute format('create policy escrita_apagar on inutilizacoes_nfe as restrictive for delete using (false)');
end $$;

-- Não deixa inutilizar número que já virou nota nem faixa já inutilizada
create or replace function app.confere_inutilizacao() returns trigger
language plpgsql set search_path = public as $$
declare v_numeros text;
begin
  if tg_op = 'UPDATE' and (new.empresa_id, new.modelo, new.serie, new.numero_inicial, new.numero_final)
       is distinct from (old.empresa_id, old.modelo, old.serie, old.numero_inicial, old.numero_final) then
    raise exception 'A faixa inutilizada não pode ser alterada' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then return new; end if;
  select string_agg(numero::text, ', ' order by numero) into v_numeros
  from notas_fiscais
  where empresa_id = new.empresa_id and modelo = new.modelo and serie = new.serie
    and numero between new.numero_inicial and new.numero_final and status <> 'rejeitada';
  if v_numeros is not null then
    raise exception 'Os números % já foram usados por notas desta série', v_numeros using errcode = 'check_violation';
  end if;
  if exists (select 1 from inutilizacoes_nfe i
             where i.empresa_id = new.empresa_id and i.modelo = new.modelo and i.serie = new.serie and i.status <> 'rejeitada'
               and i.id <> new.id and int4range(i.numero_inicial, i.numero_final, '[]') && int4range(new.numero_inicial, new.numero_final, '[]')) then
    raise exception 'Parte desta faixa já foi inutilizada ou está em processamento' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger confere before insert or update on inutilizacoes_nfe for each row execute function app.confere_inutilizacao();

-- Tokens da Focus são credencial: fora do histórico
create or replace function app.tabelas_sem_historico() returns text[]
language sql immutable as $$
  select array['audit_log', 'custos_lote_mensal', 'importacao_vinculos', 'contas_asaas_segredos',
               'sessoes_2fa', 'dispositivos_confiaveis', 'webhook_eventos', 'aceites_termos',
               'api_chaves_uso', 'api_webhook_entregas', 'focus_emitentes_segredos']
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.preparar_nfce(uuid) to authenticated;
    grant execute on function public.pagamentos_do_pedido(uuid) to authenticated;
    grant select, insert, update on inutilizacoes_nfe to authenticated;
    grant select on focus_emitentes to authenticated;
  end if;
end $$;

select app.travar_referencias();
