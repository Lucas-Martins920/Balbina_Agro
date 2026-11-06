-- Sondas IoT de qualidade da água: leituras contínuas de oxigênio, temperatura, pH e amônia
-- por sondas instaladas nos viveiros (estilo TatilFish/Trevisan). Cada sonda envia leituras
-- pela API; alertas usam as mesmas faixas de agua.ts e da view alertas.

-- ---------------------------------------------------------------------------
-- 1. Sondas
-- ---------------------------------------------------------------------------
create table sondas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id),
  viveiro_id  uuid references viveiros(id),
  nome        text not null,
  modelo      text,
  numero_serie text,
  token       text not null default encode(gen_random_bytes(32), 'hex'),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table sondas enable row level security;
create policy membros on sondas using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));

create index sondas_empresa_idx on sondas (empresa_id);
create index sondas_viveiro_idx on sondas (viveiro_id);
create unique index sondas_token_idx on sondas (token);

-- ---------------------------------------------------------------------------
-- 2. Leituras das sondas
-- ---------------------------------------------------------------------------
create table leituras_sonda (
  id              uuid primary key default gen_random_uuid(),
  sonda_id        uuid not null references sondas(id) on delete cascade,
  empresa_id      uuid not null references empresas(id),
  lido_em         timestamptz not null default now(),
  oxigenio_mg_l   numeric(5,2),
  temperatura_c   numeric(5,2),
  ph              numeric(4,2),
  amonia_mg_l     numeric(6,3),
  bateria_pct     smallint,
  sinal_dbm       smallint,
  created_at      timestamptz not null default now()
);

alter table leituras_sonda enable row level security;
create policy membros on leituras_sonda using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));

create index leituras_sonda_empresa_idx on leituras_sonda (empresa_id);
create index leituras_sonda_sonda_idx on leituras_sonda (sonda_id, lido_em desc);

-- ---------------------------------------------------------------------------
-- 3. View: última leitura de cada sonda (para o painel)
-- ---------------------------------------------------------------------------
create or replace view ultimas_leituras as
select distinct on (s.id)
  s.id as sonda_id,
  s.empresa_id,
  s.nome as sonda_nome,
  s.modelo,
  s.ativo,
  v.id as viveiro_id,
  v.nome as viveiro_nome,
  l.id as leitura_id,
  l.lido_em,
  l.oxigenio_mg_l,
  l.temperatura_c,
  l.ph,
  l.amonia_mg_l,
  l.bateria_pct,
  l.sinal_dbm,
  case
    when l.oxigenio_mg_l is not null and l.oxigenio_mg_l < 3 then 'critico'
    when l.oxigenio_mg_l is not null and l.oxigenio_mg_l < 4 then 'atencao'
    when l.ph is not null and (l.ph < 4.5 or l.ph > 8.5) then 'atencao'
    when l.temperatura_c is not null and (l.temperatura_c < 24 or l.temperatura_c > 33) then 'atencao'
    else 'normal'
  end as nivel
from sondas s
left join viveiros v on v.id = s.viveiro_id
left join leituras_sonda l on l.sonda_id = s.id
order by s.id, l.lido_em desc;

-- ---------------------------------------------------------------------------
-- 4. Conferência de referências cruzadas
-- ---------------------------------------------------------------------------
select app.travar_referencias();
