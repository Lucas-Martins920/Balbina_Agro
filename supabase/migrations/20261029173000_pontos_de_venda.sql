-- Pontos de venda: lugares onde a piscicultura vende (a própria piscicultura, uma loja em Manaus, uma feira).
-- Decisões e o que depende do contador: docs/pontos-de-venda.md.
--
-- 1. pontos_venda: cada ponto é um estabelecimento da MESMA empresa, com depósito de ovos próprio,
--    caixa (conta caixinha) e centro de custo. A sede (a piscicultura) existe sempre e usa o depósito de
--    ovos de sempre; app.ponto_sede cria a sede na primeira vez que precisa.
-- 2. estoque_peixe passa a ser o estoque da SEDE (piscicultura): produção, classificação, carência e
--    inventário continuam acontecendo lá. estoque_peixe_ponto mostra o saldo de cada ponto.
--    Enquanto a empresa só tem a sede, nada muda.
-- 3. Transferência de ovos entre pontos (transferencias_peixe): sai da origem na hora, entra no
--    destino no recebimento (com quebras), o frete vira conta a pagar e custo por ovo no destino.
-- 4. Venda: pedidos_venda.ponto_venda_id diz de onde saem os ovos; o PDV vende no ponto escolhido,
--    o dinheiro cai no caixa do ponto e o centro de custo da receita é o do ponto.

-- ---------------------------------------------------------------------------
-- 1. Cadastro
-- ---------------------------------------------------------------------------

create table pontos_venda (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  tipo text not null default 'loja' check (tipo in ('piscicultura', 'loja', 'feira', 'entreposto', 'outro')),
  sede boolean not null default false,
  deposito_id uuid not null unique references depositos(id) on delete restrict,
  conta_caixa_id uuid references contas_financeiras(id) on delete set null,
  centro_custo_id uuid references centros_custo(id) on delete set null,
  endereco text,
  municipio text,
  uf text check (uf ~ '^[A-Z]{2}$'),
  -- dados fiscais do estabelecimento (CNPJ da filial ou CPF + IE); a nota ainda sai pelo emitente da empresa
  documento text check (documento ~ '^(\d{11}|\d{14})$'),
  inscricao_estadual text,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome),
  constraint sede_sempre_ativa check (not sede or ativo)
);
create unique index pontos_venda_uma_sede on pontos_venda (empresa_id) where sede;

alter table pontos_venda enable row level security;
create policy membros on pontos_venda using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on pontos_venda as restrictive for insert
  with check (app.pode_algum(empresa_id, array['estoque.editar', 'configuracoes.editar']));
create policy escrita_alterar on pontos_venda as restrictive for update
  using (app.pode_algum(empresa_id, array['estoque.editar', 'configuracoes.editar']))
  with check (app.pode_algum(empresa_id, array['estoque.editar', 'configuracoes.editar']));
create policy escrita_apagar on pontos_venda as restrictive for delete
  using (app.pode_algum(empresa_id, array['estoque.editar', 'configuracoes.editar']));

-- Sede da empresa (a piscicultura). Cria na primeira vez, com o depósito de ovos que a empresa já usa.
-- security definer: quem só opera o PDV também precisa que a sede exista.
create or replace function app.ponto_sede(p_empresa uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_dep uuid;
  v_nome text := 'Piscicultura';
begin
  select id into v_id from pontos_venda where empresa_id = p_empresa and sede;
  if found then return v_id; end if;
  perform pg_advisory_xact_lock(hashtext('ponto_sede:' || p_empresa::text));
  select id into v_id from pontos_venda where empresa_id = p_empresa and sede;
  if found then return v_id; end if;

  select d.id into v_dep from depositos d
  where d.empresa_id = p_empresa and d.tipo = 'ovos'
    and not exists (select 1 from pontos_venda pv where pv.deposito_id = d.id)
  order by d.nome limit 1;
  if v_dep is null then
    insert into depositos (empresa_id, nome, tipo) values (p_empresa, 'Ovos', 'ovos')
    on conflict (empresa_id, nome) do update set tipo = 'ovos'
    returning id into v_dep;
    -- o gatilho do depósito novo já pode ter criado a sede
    select id into v_id from pontos_venda where empresa_id = p_empresa and sede;
    if found then return v_id; end if;
  end if;
  if exists (select 1 from pontos_venda where empresa_id = p_empresa and nome = v_nome) then
    v_nome := 'Piscicultura (sede)';
  end if;
  insert into pontos_venda (empresa_id, nome, tipo, sede, deposito_id)
  values (p_empresa, v_nome, 'piscicultura', true, v_dep)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function app.ponto_sede(uuid) from public;

-- O depósito de ovos "de sempre" passa a ser o da sede: nunca o de outro ponto.
create or replace function app.deposito_ovos(p_empresa uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select deposito_id into v_id from pontos_venda where empresa_id = p_empresa and sede;
  if found then return v_id; end if;
  v_id := app.ponto_sede(p_empresa);   -- em outra instrução: a linha criada agora precisa estar visível
  select deposito_id into v_id from pontos_venda where id = v_id;
  return v_id;
end $$;

-- Empresa nova: o primeiro depósito de ovos (o onboarding cria "Ovos") já vira a sede.
create or replace function app.sede_no_deposito_de_ovos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'ovos' and not exists (select 1 from pontos_venda where empresa_id = new.empresa_id and sede) then
    perform app.ponto_sede(new.empresa_id);
  end if;
  return null;
end $$;
create trigger sede_ponto_venda after insert on depositos for each row execute function app.sede_no_deposito_de_ovos();

-- Toda empresa que já existe ganha a sede agora (o depósito de ovos dela vira o da piscicultura).
select app.ponto_sede(id) from empresas;

-- Saldo de ovos > 0 ou transferência a caminho: o ponto não pode ser desativado nem a sede trocada.
create or replace function app.conferir_ponto_venda() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.deposito_id <> old.deposito_id or new.sede <> old.sede then
    raise exception 'O depósito e a sede de um ponto de venda não mudam' using errcode = 'check_violation';
  end if;
  if new.sede and not new.ativo then
    raise exception 'A piscicultura (sede) não pode ser desativada' using errcode = 'check_violation';
  end if;
  if old.ativo and not new.ativo then
    if exists (select 1 from movimentos_estoque where deposito_id = new.deposito_id
               group by produto_id having sum(quantidade) <> 0) then
      raise exception 'O ponto % ainda tem ovos em estoque: transfira ou ajuste antes de desativar', new.nome
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from transferencias_peixe where status = 'em_transito' and (origem_id = new.id or destino_id = new.id)) then
      raise exception 'O ponto % tem transferência a caminho: receba ou cancele antes de desativar', new.nome
        using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Cria o ponto com o depósito de ovos, o caixa e o centro de custo dele.
-- security definer porque mexe em depósitos, contas e centros de custo; a permissão é conferida aqui.
create or replace function public.criar_ponto_venda(
  p_empresa uuid,
  p_nome text,
  p_tipo text default 'loja',
  p_municipio text default null,
  p_uf text default null,
  p_endereco text default null,
  p_documento text default null,
  p_inscricao_estadual text default null,
  p_criar_caixa boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_nome text := trim(coalesce(p_nome, ''));
  v_dep uuid;
  v_caixa uuid;
  v_cc uuid;
  v_id uuid;
begin
  if not app.pode_algum(p_empresa, array['estoque.editar', 'configuracoes.editar']) then
    raise exception 'Seu usuário não tem permissão para cadastrar pontos de venda' using errcode = 'insufficient_privilege';
  end if;
  if v_nome = '' then raise exception 'Informe o nome do ponto de venda' using errcode = 'check_violation'; end if;
  perform app.ponto_sede(p_empresa);
  if exists (select 1 from pontos_venda where empresa_id = p_empresa and lower(nome) = lower(v_nome)) then
    raise exception 'Já existe um ponto de venda chamado %', v_nome using errcode = 'check_violation';
  end if;

  insert into depositos (empresa_id, nome, tipo) values (p_empresa, left('Ovos · ' || v_nome, 120), 'ovos')
  returning id into v_dep;
  if p_criar_caixa then
    insert into contas_financeiras (empresa_id, tipo, nome) values (p_empresa, 'caixinha', left('Caixa · ' || v_nome, 120))
    returning id into v_caixa;
  end if;
  select id into v_cc from centros_custo where empresa_id = p_empresa and lower(nome) = lower('Ponto · ' || v_nome);
  if v_cc is null then
    insert into centros_custo (empresa_id, nome, tipo, parent_id)
    values (p_empresa, 'Ponto · ' || v_nome, 'comercial',
            (select id from centros_custo where empresa_id = p_empresa and tipo = 'comercial' and parent_id is null order by nome limit 1))
    returning id into v_cc;
  end if;

  insert into pontos_venda (empresa_id, nome, tipo, deposito_id, conta_caixa_id, centro_custo_id, municipio, uf, endereco,
                            documento, inscricao_estadual)
  values (p_empresa, v_nome, coalesce(nullif(p_tipo, ''), 'loja'), v_dep, v_caixa, v_cc, nullif(trim(p_municipio), ''),
          nullif(upper(trim(p_uf)), ''), nullif(trim(p_endereco), ''), nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), ''),
          nullif(trim(p_inscricao_estadual), ''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.criar_ponto_venda(uuid, text, text, text, text, text, text, text, boolean) from public;

-- ---------------------------------------------------------------------------
-- 2. Estoque por ponto
-- ---------------------------------------------------------------------------

-- Movimento de ovo é "da sede" quando não está no depósito de outro ponto (inclui empresas antigas
-- com depósitos de ovos avulsos, que sempre foram somados juntos).
create or replace function app.deposito_de_ponto(p_deposito uuid) returns uuid
language sql stable set search_path = public as $$
  select id from pontos_venda where deposito_id = p_deposito and not sede
$$;

-- Estoque de ovos da PISCICULTURA (sede). Mesmas colunas de antes; quem produz, classifica, descarta
-- carência e faz inventário continua usando esta view.
create or replace view estoque_peixe with (security_invoker = true) as
select c.empresa_id, c.id as classe_id, app.rotulo_classe(c.nome, c.cor) as classe, c.ordem, c.comercializavel, p.id as produto_id,
       coalesce(s.saldo, 0)::bigint as saldo,
       least(coalesce(s.saldo, 0), coalesce(k.ovos, 0))::bigint as em_carencia,
       greatest(coalesce(s.saldo, 0) - coalesce(k.ovos, 0), 0)::bigint as disponivel,
       c.sem_classificacao,
       c.cor,
       c.nome as classe_nome
from classes_peixe c
join produtos p on p.classe_peixe_id = c.id and p.base_estoque
left join (select m.produto_id, sum(m.quantidade) as saldo from movimentos_estoque m
           where not exists (select 1 from pontos_venda pv where pv.deposito_id = m.deposito_id and not pv.sede)
           group by m.produto_id) s on s.produto_id = p.id
left join (select classe_peixe_id, sum(ovos) as ovos from ovos_em_carencia group by classe_peixe_id) k on k.classe_peixe_id = c.id;

-- Saldo de ovos de cada ponto por classe. Carência só existe na sede: ovo em carência não sai de lá.
create or replace view estoque_peixe_ponto with (security_invoker = true) as
select pv.empresa_id, pv.id as ponto_venda_id, pv.nome as ponto_nome, pv.sede, pv.ativo as ponto_ativo,
       eo.classe_id, eo.classe, eo.classe_nome, eo.cor, eo.ordem, eo.comercializavel, eo.sem_classificacao, eo.produto_id,
       eo.saldo, eo.em_carencia, eo.disponivel
from pontos_venda pv
join estoque_peixe eo on eo.empresa_id = pv.empresa_id
where pv.sede
union all
select pv.empresa_id, pv.id, pv.nome, pv.sede, pv.ativo,
       c.id, app.rotulo_classe(c.nome, c.cor), c.nome, c.cor, c.ordem, c.comercializavel, c.sem_classificacao, p.id,
       coalesce(s.saldo, 0)::bigint, 0::bigint, greatest(coalesce(s.saldo, 0), 0)::bigint
from pontos_venda pv
join classes_peixe c on c.empresa_id = pv.empresa_id
join produtos p on p.classe_peixe_id = c.id and p.base_estoque
left join (select deposito_id, produto_id, sum(quantidade) as saldo from movimentos_estoque group by deposito_id, produto_id) s
  on s.deposito_id = pv.deposito_id and s.produto_id = p.id
where not pv.sede;

-- Desfazer só passa se nenhum local (sede ou ponto) ficar com saldo negativo.
create or replace function app.conferir_saldo_peixe(p_produtos uuid[]) returns void
language plpgsql stable set search_path = public as $$
declare v_classe text; v_saldo numeric; v_local text;
begin
  select c.nome, s.saldo, coalesce(pv.nome, 'piscicultura') into v_classe, v_saldo, v_local
  from (select m.produto_id, app.deposito_de_ponto(m.deposito_id) as ponto, sum(m.quantidade) as saldo
        from movimentos_estoque m where m.produto_id = any(p_produtos)
        group by m.produto_id, app.deposito_de_ponto(m.deposito_id)) s
  join produtos p on p.id = s.produto_id
  left join classes_peixe c on c.id = p.classe_peixe_id
  left join pontos_venda pv on pv.id = s.ponto
  where s.saldo < 0
  limit 1;
  if found then
    raise exception 'Esses ovos já saíram do estoque: % ficaria com % ovos em %. Estorne a venda ou faça um ajuste de estoque antes',
      coalesce(v_classe, 'a classe'), v_saldo::bigint, v_local using errcode = 'check_violation';
  end if;
end $$;
revoke all on function app.conferir_saldo_peixe(uuid[]) from public;

-- Contagem (inventário) de um ponto: acerta cada classe para o que foi contado.
-- p_contagem: {"<classe_id>": ovos_contados, ...}. A sede usa ajustar_estoque_peixe, como sempre.
create or replace function public.inventariar_ponto(p_ponto uuid, p_contagem jsonb, p_observacao text default null) returns bigint
language plpgsql set search_path = public as $$
declare
  pv pontos_venda%rowtype;
  r record;
  v_contado bigint;
  v_total bigint := 0;
begin
  select * into pv from pontos_venda where id = p_ponto;
  if not found then raise exception 'Ponto de venda não encontrado' using errcode = 'no_data_found'; end if;
  if pv.sede then raise exception 'Na piscicultura, use a contagem do estoque de ovos' using errcode = 'check_violation'; end if;
  if not app.pode(pv.empresa_id, 'estoque.editar') then
    raise exception 'Seu usuário não tem permissão para lançar estoque' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_contagem) <> 'object' then raise exception 'Contagem inválida' using errcode = 'check_violation'; end if;
  perform app.travar_estoque(pv.empresa_id);
  for r in select key::uuid as classe_id, value from jsonb_each(p_contagem) loop
    v_contado := nullif(r.value #>> '{}', '')::bigint;
    continue when v_contado is null;
    if v_contado < 0 then raise exception 'Quantidade contada não pode ser negativa' using errcode = 'check_violation'; end if;
    if not exists (select 1 from classes_peixe where id = r.classe_id and empresa_id = pv.empresa_id) then
      raise exception 'Classe de ovo inválida' using errcode = 'check_violation';
    end if;
    select v_contado - e.saldo into v_contado from estoque_peixe_ponto e where e.ponto_venda_id = pv.id and e.classe_id = r.classe_id;
    if v_contado <> 0 then
      insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, observacao, created_by)
      values (pv.empresa_id, app.produto_base_peixe(r.classe_id), pv.deposito_id, app.hoje(pv.empresa_id), 'ajuste', v_contado,
              'inventario_ponto', coalesce(nullif(trim(p_observacao), ''), 'contagem do ponto ' || pv.nome), auth.uid());
      v_total := v_total + v_contado;
    end if;
  end loop;
  return v_total;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Transferência de ovos entre pontos
-- ---------------------------------------------------------------------------

create table transferencias_peixe (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  numero int not null,
  data date not null,                                 -- saída da origem
  origem_id uuid not null references pontos_venda(id) on delete restrict,
  destino_id uuid not null references pontos_venda(id) on delete restrict,
  status text not null default 'em_transito' check (status in ('em_transito', 'recebida', 'cancelada')),
  recebida_em date,
  kg_enviados bigint not null default 0 check (kg_enviados >= 0),
  kg_recebidos bigint check (kg_recebidos >= 0),
  quebrados bigint not null default 0 check (quebrados >= 0),
  frete_cents bigint not null default 0 check (frete_cents >= 0),
  transportador_id uuid references contatos(id) on delete set null,
  frete_titulo_id uuid references agendamentos(id) on delete set null,
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, numero),
  constraint pontos_diferentes check (origem_id <> destino_id),
  constraint recebida_tem_data check (status <> 'recebida' or (recebida_em is not null and kg_recebidos is not null))
);
create index on transferencias_peixe (empresa_id, data);
create index on transferencias_peixe (destino_id, status);
create index on transferencias_peixe (origem_id, status);

create table transferencia_peixe_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  transferencia_id uuid not null references transferencias_peixe(id) on delete cascade,
  classe_peixe_id uuid not null references classes_peixe(id) on delete restrict,
  kg_enviados bigint not null check (kg_enviados > 0),
  quebrados bigint not null default 0 check (quebrados >= 0),
  constraint quebra_ate_o_enviado check (quebrados <= kg_enviados),
  unique (transferencia_id, classe_peixe_id)
);

do $$
declare t text;
begin
  foreach t in array array['transferencias_peixe', 'transferencia_peixe_itens'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy membros on %I using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy escrita_inserir on %I as restrictive for insert with check (app.pode(empresa_id, %L))', t, 'estoque.editar');
    execute format('create policy escrita_alterar on %I as restrictive for update using (app.pode(empresa_id, %L)) with check (app.pode(empresa_id, %L))', t, 'estoque.editar', 'estoque.editar');
    execute format('create policy escrita_apagar on %I as restrictive for delete using (app.pode(empresa_id, %L))', t, 'estoque.editar');
  end loop;
end $$;

alter table agendamentos drop constraint agendamentos_origem_check;
alter table agendamentos add constraint agendamentos_origem_check
  check (origem in ('manual','recorrencia','pedido_venda','compra','importacao','caixa_entrada','conciliacao','cartao','transferencia_peixe'));

-- Envia ovos de um ponto para outro. p_itens: [{produto_id, quantidade}] em qualquer embalagem de ovo
-- (caixa, cartela, dúzia, unidade). O frete (opcional) vira conta a pagar e entra como custo por ovo
-- no destino. p_receber = true quando os ovos chegam no mesmo dia, sem quebra.
create or replace function public.transferir_peixe(
  p_empresa uuid,
  p_origem uuid,
  p_destino uuid,
  p_data date,
  p_itens jsonb,
  p_frete_cents bigint default 0,
  p_frete_a_pagar boolean default true,
  p_transportador uuid default null,
  p_vencimento_frete date default null,
  p_receber boolean default true,
  p_observacoes text default null
) returns uuid
language plpgsql set search_path = public as $$
declare
  o pontos_venda%rowtype;
  d pontos_venda%rowtype;
  v_id uuid;
  v_numero int;
  v_total bigint := 0;
  v_cat uuid;
  v_cc uuid;
  v_ag uuid;
  r record;
begin
  p_data := coalesce(p_data, app.hoje(p_empresa));
  p_frete_cents := coalesce(p_frete_cents, 0);
  if not app.pode(p_empresa, 'estoque.editar') then
    raise exception 'Seu usuário não tem permissão para transferir estoque' using errcode = 'insufficient_privilege';
  end if;
  select * into o from pontos_venda where id = p_origem and empresa_id = p_empresa;
  select * into d from pontos_venda where id = p_destino and empresa_id = p_empresa;
  if o.id is null or d.id is null then raise exception 'Ponto de venda inválido' using errcode = 'check_violation'; end if;
  if o.id = d.id then raise exception 'Escolha um destino diferente da origem' using errcode = 'check_violation'; end if;
  if not o.ativo or not d.ativo then raise exception 'Ponto de venda inativo' using errcode = 'check_violation'; end if;
  if p_data > app.hoje(p_empresa) then
    raise exception 'A data da transferência não pode ser futura' using errcode = 'check_violation';
  end if;
  if p_frete_cents < 0 then raise exception 'Frete não pode ser negativo' using errcode = 'check_violation'; end if;
  if p_frete_cents > 0 and p_frete_a_pagar and not app.pode(p_empresa, 'contas-a-pagar.editar') then
    raise exception 'Para lançar o frete em contas a pagar seu usuário precisa dessa permissão; desmarque a opção ou peça a quem tem'
      using errcode = 'insufficient_privilege';
  end if;
  if p_transportador is not null and not exists (select 1 from contatos where id = p_transportador and empresa_id = p_empresa) then
    raise exception 'Transportador inválido' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe os ovos que vão na transferência' using errcode = 'check_violation';
  end if;

  -- Converte cada item para ovos da classe
  create temp table if not exists _transf_itens (classe_peixe_id uuid, ovos numeric) on commit drop;
  truncate _transf_itens;
  insert into _transf_itens
  select pr.classe_peixe_id, (x->>'quantidade')::numeric * coalesce(nullif(pr.fator_kg, 0), 1)
  from jsonb_array_elements(p_itens) x
  left join produtos pr on pr.id = (x->>'produto_id')::uuid and pr.empresa_id = p_empresa and pr.tipo = 'ovo';
  if exists (select 1 from _transf_itens where classe_peixe_id is null) then
    raise exception 'Só ovos podem ser transferidos entre pontos' using errcode = 'check_violation';
  end if;
  if exists (select 1 from _transf_itens where ovos is null or ovos <= 0 or ovos <> trunc(ovos)) then
    raise exception 'Quantidade inválida: precisa dar um número inteiro de ovos' using errcode = 'check_violation';
  end if;

  perform app.travar_estoque(p_empresa);
  for r in
    select t.classe_peixe_id, sum(t.ovos)::bigint as ovos, e.classe, e.disponivel, e.em_carencia
    from _transf_itens t
    join estoque_peixe_ponto e on e.classe_id = t.classe_peixe_id and e.ponto_venda_id = o.id
    group by t.classe_peixe_id, e.classe, e.disponivel, e.em_carencia
  loop
    if r.ovos > r.disponivel then
      raise exception 'Estoque insuficiente de ovos % em %: a transferência leva % e há % disponíveis%', r.classe, o.nome, r.ovos, r.disponivel,
        case when r.em_carencia > 0 then format(' (%s em carência não podem sair)', r.em_carencia) else '' end
        using errcode = 'check_violation';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtext('transferencia_peixe:' || p_empresa::text));
  select coalesce(max(numero), 0) + 1 into v_numero from transferencias_peixe where empresa_id = p_empresa;
  select sum(ovos)::bigint into v_total from _transf_itens;

  insert into transferencias_peixe (empresa_id, numero, data, origem_id, destino_id, kg_enviados, frete_cents, transportador_id, observacoes)
  values (p_empresa, v_numero, p_data, o.id, d.id, v_total, p_frete_cents, p_transportador, nullif(trim(p_observacoes), ''))
  returning id into v_id;

  insert into transferencia_peixe_itens (empresa_id, transferencia_id, classe_peixe_id, kg_enviados)
  select p_empresa, v_id, classe_peixe_id, sum(ovos)::bigint from _transf_itens group by classe_peixe_id;

  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, origem_id, observacao, created_by)
  select p_empresa, app.produto_base_peixe(i.classe_peixe_id), o.deposito_id, p_data, 'transferencia', -i.kg_enviados,
         'transferencias_peixe', v_id, format('Transferência %s para %s', v_numero, d.nome), auth.uid()
  from transferencia_peixe_itens i where i.transferencia_id = v_id;

  if p_frete_cents > 0 and p_frete_a_pagar then
    select id into v_cat from categorias where empresa_id = p_empresa and sentido = 'saida' and nome = 'Fretes';
    if v_cat is null then
      select id into v_cat from categorias where empresa_id = p_empresa and sentido = 'saida' and grupo = 'custo_operacional' order by nome limit 1;
    end if;
    v_cc := coalesce(d.centro_custo_id, (select id from centros_custo where empresa_id = p_empresa and tipo = 'comercial' order by nome limit 1));
    v_ag := public.agendar_titulo(p_empresa, 'pagar', format('Frete da transferência %s · %s → %s', v_numero, o.nome, d.nome),
      coalesce(p_vencimento_frete, p_data), date_trunc('month', p_data)::date, p_frete_cents,
      jsonb_build_array(jsonb_build_object('categoria_id', v_cat, 'centro_custo_id', v_cc, 'valor_cents', p_frete_cents)),
      p_transportador, format('Transferência %s', v_numero), 1, null);
    update agendamentos set origem = 'transferencia_peixe', origem_id = v_id where id = v_ag;
    update transferencias_peixe set frete_titulo_id = v_ag where id = v_id;
  end if;

  if p_receber then
    perform public.receber_transferencia_peixe(v_id, null, p_data);
  end if;
  return v_id;
end $$;

-- Recebe a transferência no destino. p_quebras: {"<classe_id>": ovos_quebrados} (o que chegou quebrado
-- sai como perda no destino). O frete vira custo por ovo recebido nos movimentos de entrada.
create or replace function public.receber_transferencia_peixe(p_transferencia uuid, p_quebras jsonb default null, p_data date default null)
returns bigint
language plpgsql set search_path = public as $$
declare
  t transferencias_peixe%rowtype;
  d pontos_venda%rowtype;
  v_quebrados bigint;
  v_recebidos bigint;
  v_custo numeric;
begin
  select * into t from transferencias_peixe where id = p_transferencia for update;
  if not found then raise exception 'Transferência não encontrada' using errcode = 'no_data_found'; end if;
  if not app.pode(t.empresa_id, 'estoque.editar') then
    raise exception 'Seu usuário não tem permissão para receber transferências' using errcode = 'insufficient_privilege';
  end if;
  if t.status <> 'em_transito' then
    raise exception 'Esta transferência já foi %', case t.status when 'recebida' then 'recebida' else 'cancelada' end
      using errcode = 'check_violation';
  end if;
  p_data := coalesce(p_data, app.hoje(t.empresa_id));
  if p_data < t.data or p_data > app.hoje(t.empresa_id) then
    raise exception 'A data do recebimento precisa estar entre a saída e hoje' using errcode = 'check_violation';
  end if;
  if p_quebras is not null and jsonb_typeof(p_quebras) <> 'object' then
    raise exception 'Quebras inválidas' using errcode = 'check_violation';
  end if;
  if p_quebras is not null and exists (select 1 from jsonb_object_keys(p_quebras) k
      where not exists (select 1 from transferencia_peixe_itens i where i.transferencia_id = t.id and i.classe_peixe_id::text = k)) then
    raise exception 'Quebra numa classe que não foi na transferência' using errcode = 'check_violation';
  end if;
  select * into d from pontos_venda where id = t.destino_id;

  update transferencia_peixe_itens i
  set quebrados = coalesce(nullif(p_quebras->>(i.classe_peixe_id::text), '')::bigint, 0)
  where i.transferencia_id = t.id;
  select sum(quebrados), sum(kg_enviados - quebrados) into v_quebrados, v_recebidos
  from transferencia_peixe_itens where transferencia_id = t.id;

  v_custo := case when t.frete_cents > 0 and v_recebidos > 0 then t.frete_cents::numeric / v_recebidos end;
  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, origem_tabela, origem_id,
                                  observacao, created_by)
  select t.empresa_id, app.produto_base_peixe(i.classe_peixe_id), d.deposito_id, p_data, 'transferencia', i.kg_enviados, v_custo,
         'transferencias_peixe', t.id, format('Transferência %s recebida', t.numero), auth.uid()
  from transferencia_peixe_itens i where i.transferencia_id = t.id;
  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, origem_id, observacao, created_by)
  select t.empresa_id, app.produto_base_peixe(i.classe_peixe_id), d.deposito_id, p_data, 'perda', -i.quebrados,
         'transferencias_peixe', t.id, format('Quebra no transporte da transferência %s', t.numero), auth.uid()
  from transferencia_peixe_itens i where i.transferencia_id = t.id and i.quebrados > 0;

  update transferencias_peixe
  set status = 'recebida', recebida_em = p_data, kg_recebidos = v_recebidos, quebrados = v_quebrados, updated_at = now()
  where id = t.id;
  return v_recebidos;
end $$;

-- Cancela: os ovos voltam para a origem (e saem do destino, se já tinham chegado) e o frete
-- em aberto é cancelado. Frete já pago precisa ter o pagamento estornado antes.
create or replace function public.cancelar_transferencia_peixe(p_transferencia uuid) returns void
language plpgsql set search_path = public as $$
declare
  t transferencias_peixe%rowtype;
  v_produtos uuid[];
begin
  select * into t from transferencias_peixe where id = p_transferencia for update;
  if not found then raise exception 'Transferência não encontrada' using errcode = 'no_data_found'; end if;
  if not app.pode(t.empresa_id, 'estoque.editar') then
    raise exception 'Seu usuário não tem permissão para cancelar transferências' using errcode = 'insufficient_privilege';
  end if;
  if t.status = 'cancelada' then raise exception 'Esta transferência já foi cancelada' using errcode = 'check_violation'; end if;
  if t.frete_titulo_id is not null and exists (select 1 from baixas where agendamento_id = t.frete_titulo_id) then
    raise exception 'O frete desta transferência já foi pago; estorne o pagamento antes de cancelar' using errcode = 'check_violation';
  end if;
  perform app.travar_estoque(t.empresa_id);
  select array_agg(distinct produto_id) into v_produtos from movimentos_estoque
  where origem_tabela = 'transferencias_peixe' and origem_id = t.id;
  delete from movimentos_estoque where origem_tabela = 'transferencias_peixe' and origem_id = t.id;
  if v_produtos is not null then perform app.conferir_saldo_peixe(v_produtos); end if;   -- os ovos já vendidos no destino travam
  if t.frete_titulo_id is not null then
    update agendamentos set status = 'cancelado', updated_at = now() where id = t.frete_titulo_id;
  end if;
  update transferencias_peixe set status = 'cancelada', updated_at = now() where id = t.id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Venda no ponto
-- ---------------------------------------------------------------------------

alter table pedidos_venda add column ponto_venda_id uuid references pontos_venda(id) on delete restrict;
create index on pedidos_venda (ponto_venda_id, data);

-- Ponto ativo da empresa ou erro amigável
create or replace function app.ponto_da_venda(p_empresa uuid, p_ponto uuid) returns pontos_venda
language plpgsql set search_path = public as $$
declare
  pv pontos_venda%rowtype;
  v_id uuid := coalesce(p_ponto, app.ponto_sede(p_empresa));
begin
  select * into pv from pontos_venda where id = v_id and empresa_id = p_empresa;
  if not found then raise exception 'Ponto de venda inválido' using errcode = 'check_violation'; end if;
  if not pv.ativo then raise exception 'O ponto de venda % está inativo', pv.nome using errcode = 'check_violation'; end if;
  return pv;
end $$;

-- Faturar: os ovos saem do ponto do pedido (sem ponto = piscicultura) e a receita cai no centro de custo dele.
CREATE OR REPLACE FUNCTION public.faturar_pedido(p_pedido uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  p pedidos_venda%rowtype;
  pv pontos_venda%rowtype;
  r record;
  v_cat uuid;
  v_cc uuid;
  v_cliente text;
  v_n int;
  v_i int := 0;
  v_acum bigint := 0;
  v_valor bigint;
  v_ag uuid;
  x jsonb;
begin
  select * into p from pedidos_venda where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'no_data_found'; end if;
  perform app.travar_estoque(p.empresa_id);   -- mesma trava em toda função que mexe no saldo
  if p.status not in ('aberto', 'separado') then
    raise exception 'Pedido % não pode ser faturado', p.status using errcode = 'check_violation';
  end if;
  pv := app.ponto_da_venda(p.empresa_id, p.ponto_venda_id);

  for r in
    select pr.classe_peixe_id, sum(i.quantidade * pr.fator_kg)::bigint as ovos, eo.classe, eo.disponivel, eo.em_carencia
    from pedido_itens i join produtos pr on pr.id = i.produto_id
    join estoque_peixe_ponto eo on eo.classe_id = pr.classe_peixe_id and eo.ponto_venda_id = pv.id
    where i.pedido_id = p_pedido and pr.tipo = 'ovo'
    group by pr.classe_peixe_id, eo.classe, eo.disponivel, eo.em_carencia
  loop
    if r.ovos > r.disponivel then
      raise exception 'Estoque insuficiente de ovos %: o pedido precisa de % e há % disponíveis%',
        r.classe || case when pv.sede then '' else ' em ' || pv.nome end, r.ovos, r.disponivel,
        case when r.em_carencia > 0 then format(' (%s em carência)', r.em_carencia) else '' end
        using errcode = 'check_violation';
    end if;
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, origem_id, created_by)
    values (p.empresa_id, app.produto_base_peixe(r.classe_peixe_id), pv.deposito_id, app.hoje(p.empresa_id), 'venda', -r.ovos,
            'pedidos_venda', p.id, auth.uid());
  end loop;

  select id into v_cat from categorias where empresa_id = p.empresa_id and sentido = 'entrada' and nome = 'Venda de ovos';
  if v_cat is null then
    select id into v_cat from categorias where empresa_id = p.empresa_id and grupo = 'receita_operacional' and sentido = 'entrada' order by nome limit 1;
  end if;
  v_cc := coalesce(pv.centro_custo_id, (select id from centros_custo where empresa_id = p.empresa_id and tipo = 'comercial' order by nome limit 1));
  select nome into v_cliente from contatos where id = p.cliente_id;

  v_n := jsonb_array_length(p.condicao_pagamento->'parcelas');
  for x in select * from jsonb_array_elements(p.condicao_pagamento->'parcelas') loop
    v_i := v_i + 1;
    v_valor := case when v_i = v_n then p.total_cents - v_acum else round(p.total_cents * (x->>'pct')::numeric / 100) end;
    v_acum := v_acum + v_valor;
    continue when v_valor <= 0;
    v_ag := public.agendar_titulo(p.empresa_id, 'receber', format('Pedido %s · %s', p.numero, v_cliente),
      p.data + coalesce((x->>'dias')::int, 0), date_trunc('month', p.data)::date, v_valor,
      jsonb_build_array(jsonb_build_object('categoria_id', v_cat, 'centro_custo_id', v_cc, 'valor_cents', v_valor)),
      p.cliente_id, format('Pedido %s', p.numero), 1, p.forma_pagamento);
    update agendamentos set origem = 'pedido_venda', origem_id = p.id,
      parcela_numero = case when v_n > 1 then v_i end, parcela_total = case when v_n > 1 then v_n end
    where id = v_ag;
  end loop;

  update pedidos_venda set status = 'faturado', ponto_venda_id = pv.id, updated_at = now() where id = p_pedido;
  return v_n;
end $function$;

-- PDV: ganha o ponto (sem ponto = piscicultura). Dinheiro sem conta cai no caixa do ponto.
drop function public.venda_balcao(uuid, jsonb, jsonb, uuid, uuid, text);
create function public.venda_balcao(
  p_empresa uuid,
  p_itens jsonb,
  p_pagamentos jsonb,
  p_cliente uuid default null,
  p_client_id uuid default null,
  p_observacoes text default null,
  p_ponto uuid default null
) returns jsonb
language plpgsql set search_path = public as $$
declare
  pv pontos_venda%rowtype;
  v_ped uuid;
  v_total bigint;
  v_numero int;
  v_pago bigint;
  v_dinheiro bigint;
  v_troco bigint;
  v_forma text;
  v_ag uuid;
  v_conta uuid;
  v_valor bigint;
  v_resto bigint;
  x jsonb;
begin
  if p_client_id is not null then
    select id, numero, total_cents into v_ped, v_numero, v_total from pedidos_venda where client_id = p_client_id;
    if found then
      return jsonb_build_object('pedido_id', v_ped, 'numero', v_numero, 'total_cents', v_total, 'troco_cents', 0, 'repetida', true);
    end if;
  end if;
  pv := app.ponto_da_venda(p_empresa, p_ponto);
  if jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) = 0 then
    raise exception 'Informe como o cliente pagou' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_pagamentos) p
             where coalesce((p->>'valor_cents')::bigint, 0) <= 0
                or p->>'forma' not in ('boleto','pix','ted','dinheiro','cartao','debito_automatico','cheque')) then
    raise exception 'Pagamento inválido' using errcode = 'check_violation';
  end if;

  select sum((p->>'valor_cents')::bigint),
         coalesce(sum((p->>'valor_cents')::bigint) filter (where p->>'forma' = 'dinheiro'), 0)
    into v_pago, v_dinheiro
  from jsonb_array_elements(p_pagamentos) p;
  -- forma do título: a que pagou mais
  select p->>'forma' into v_forma from jsonb_array_elements(p_pagamentos) p order by (p->>'valor_cents')::bigint desc limit 1;

  v_ped := public.criar_pedido(p_empresa, coalesce(p_cliente, app.consumidor_final(p_empresa)), p_itens, app.hoje(p_empresa), app.hoje(p_empresa),
    '[{"dias":0,"pct":100}]', v_forma, p_observacoes, p_client_id, 'pdv');
  update pedidos_venda set ponto_venda_id = pv.id where id = v_ped;
  select numero, total_cents into v_numero, v_total from pedidos_venda where id = v_ped;

  if v_pago < v_total then
    raise exception 'Falta receber R$ %', to_char((v_total - v_pago) / 100.0, 'FM999G999G990D00') using errcode = 'check_violation';
  end if;
  v_troco := v_pago - v_total;
  if v_troco > v_dinheiro then
    raise exception 'Os pagamentos passam do total; só dinheiro pode ter troco' using errcode = 'check_violation';
  end if;

  perform public.faturar_pedido(v_ped);
  select id into v_ag from agendamentos where origem = 'pedido_venda' and origem_id = v_ped limit 1;

  v_resto := v_troco;
  for x in select * from jsonb_array_elements(p_pagamentos) loop
    v_valor := (x->>'valor_cents')::bigint;
    if x->>'forma' = 'dinheiro' and v_resto > 0 then
      v_valor := v_valor - least(v_valor, v_resto);
      v_resto := v_resto - least((x->>'valor_cents')::bigint, v_resto);
    end if;
    continue when v_valor <= 0 or v_ag is null;
    v_conta := nullif(x->>'conta_id', '')::uuid;
    if v_conta is null then
      if x->>'forma' <> 'dinheiro' then
        raise exception 'Escolha a conta onde cai o pagamento em %', x->>'forma' using errcode = 'check_violation';
      end if;
      v_conta := coalesce((select id from contas_financeiras where id = pv.conta_caixa_id and not arquivada), app.conta_caixa(p_empresa));
    elsif not exists (select 1 from contas_financeiras where id = v_conta and empresa_id = p_empresa) then
      raise exception 'Conta inválida' using errcode = 'check_violation';
    end if;
    insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, forma_pagamento, observacao, created_by)
    values (p_empresa, v_ag, v_conta, app.hoje(p_empresa), v_valor, x->>'forma',
            format('PDV%s · pedido %s', case when pv.sede then '' else ' ' || pv.nome end, v_numero), auth.uid());
  end loop;

  update pedidos_venda set status = 'entregue', updated_at = now() where id = v_ped;
  return jsonb_build_object('pedido_id', v_ped, 'numero', v_numero, 'total_cents', v_total, 'troco_cents', v_troco, 'repetida', false);
end $$;

-- Recebimentos do PDV por dia, forma, conta e ponto (fechamento do caixa); colunas novas no fim
create or replace view caixa_pdv with (security_invoker = true) as
select b.empresa_id, b.data, coalesce(b.forma_pagamento, 'outro') as forma, b.conta_id, cf.nome as conta_nome,
       count(distinct p.id)::int as vendas, sum(b.valor_cents)::bigint as valor_cents,
       pv.id as ponto_venda_id, pv.nome as ponto_nome
from baixas b
join agendamentos a on a.id = b.agendamento_id and a.origem = 'pedido_venda'
join pedidos_venda p on p.id = a.origem_id and p.origem = 'pdv'
join contas_financeiras cf on cf.id = b.conta_id
left join pontos_venda pv on pv.id = p.ponto_venda_id or (p.ponto_venda_id is null and pv.empresa_id = p.empresa_id and pv.sede)
group by b.empresa_id, b.data, coalesce(b.forma_pagamento, 'outro'), b.conta_id, cf.nome, pv.id, pv.nome;

create or replace view pedidos with (security_invoker = true) as
select p.id, p.empresa_id, p.numero, p.data, p.entrega_prevista, p.status, p.total_cents, p.forma_pagamento,
       p.condicao_pagamento, p.observacoes, p.origem, p.cliente_id, c.nome as cliente_nome,
       (select string_agg(format('%s %s', trim(to_char(i.quantidade, 'FM999G999D###')), pr.nome), ', ' order by pr.nome)
        from pedido_itens i join produtos pr on pr.id = i.produto_id where i.pedido_id = p.id) as itens,
       (select sum(i.quantidade * coalesce(pr.fator_kg, 0)) from pedido_itens i join produtos pr on pr.id = i.produto_id
        where i.pedido_id = p.id)::bigint as ovos,
       pv.id as ponto_venda_id, pv.nome as ponto_nome, coalesce(pv.sede, true) as ponto_sede
from pedidos_venda p join contatos c on c.id = p.cliente_id
left join pontos_venda pv on pv.id = p.ponto_venda_id or (p.ponto_venda_id is null and pv.empresa_id = p.empresa_id and pv.sede);

-- Resumo de cada ponto num período: vendas, ovos que chegaram, quebras e frete por ovo.
create or replace function public.resumo_pontos_venda(p_empresa uuid, p_inicio date, p_fim date)
returns table (ponto_venda_id uuid, nome text, sede boolean, vendas int, vendido_cents bigint, ovos_vendidos bigint,
               kg_recebidos bigint, quebrados bigint, frete_cents bigint)
language sql stable security invoker set search_path = public as $$
  select pv.id, pv.nome, pv.sede,
         coalesce(v.vendas, 0)::int, coalesce(v.valor, 0)::bigint, coalesce(v.ovos, 0)::bigint,
         coalesce(t.recebidos, 0)::bigint, coalesce(t.quebrados, 0)::bigint, coalesce(t.frete, 0)::bigint
  from pontos_venda pv
  left join (
    select coalesce(p.ponto_venda_id, (select s.id from pontos_venda s where s.empresa_id = p.empresa_id and s.sede)) as ponto,
           count(*) as vendas, sum(p.total_cents) as valor, sum(p.ovos) as ovos
    from pedidos p
    where p.empresa_id = p_empresa and p.status in ('faturado', 'entregue') and p.data between p_inicio and p_fim
    group by 1
  ) v on v.ponto = pv.id
  left join (
    select destino_id, sum(kg_recebidos) as recebidos, sum(quebrados) as quebrados, sum(frete_cents) as frete
    from transferencias_peixe
    where empresa_id = p_empresa and status = 'recebida' and recebida_em between p_inicio and p_fim
    group by destino_id
  ) t on t.destino_id = pv.id
  where pv.empresa_id = p_empresa
  order by pv.sede desc, pv.nome
$$;

-- Triggers e travas
create trigger conferir_ponto before update on pontos_venda for each row execute function app.conferir_ponto_venda();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function app.ponto_sede(uuid), app.deposito_ovos(uuid), app.deposito_de_ponto(uuid),
      app.ponto_da_venda(uuid, uuid), app.conferir_ponto_venda() to authenticated;
    grant execute on function public.criar_ponto_venda(uuid, text, text, text, text, text, text, text, boolean) to authenticated;
    grant execute on function public.inventariar_ponto(uuid, jsonb, text) to authenticated;
    grant execute on function public.transferir_peixe(uuid, uuid, uuid, date, jsonb, bigint, boolean, uuid, date, boolean, text) to authenticated;
    grant execute on function public.receber_transferencia_peixe(uuid, jsonb, date) to authenticated;
    grant execute on function public.cancelar_transferencia_peixe(uuid) to authenticated;
    grant execute on function public.venda_balcao(uuid, jsonb, jsonb, uuid, uuid, text, uuid) to authenticated;
    grant execute on function public.resumo_pontos_venda(uuid, date, date) to authenticated;
    grant select, insert, update, delete on pontos_venda, transferencias_peixe, transferencia_peixe_itens to authenticated;
    grant select on estoque_peixe, estoque_peixe_ponto, caixa_pdv, pedidos to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function app.ponto_sede(uuid), app.deposito_ovos(uuid) to service_role;
  end if;
end $$;

select app.travar_referencias();
