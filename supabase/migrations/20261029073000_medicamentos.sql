-- Medicamentos e vitaminas no apontamento diário.
--
-- O consumo de água saiu do apontamento (não dá para medir todo dia); a coluna agua_l continua nas
-- tabelas com o histórico. No lugar entra o que foi aplicado no viveiro:
--
-- 1. Cadastro `medicamentos`: nome, tipo (medicamento, vitamina, vacina, outro), princípio ativo, dose por
--    litro de água, via, carência dos ovos e, se quiser, o produto do estoque que ele consome.
--    `dose_por_unidade_estoque` diz quantas unidades da dose cabem em 1 unidade do produto
--    (1 L = 1000 ml sai sozinho; frasco, caixa e afins a piscicultura informa).
-- 2. `registrar_medicacao`: grava o tratamento como manejo de Sanidade (eventos_sanitarios), então a
--    carência dos ovos, os alertas e o descarte de ovos retidos que já existem continuam valendo.
--    Carência = dias de tratamento + carência do produto (contada depois da última dose).
--    Com quantidade (dose × litros de água medicada, ou informada direto) e produto ligado, baixa o
--    estoque como consumo do lote ao custo médio. Sem saldo, o tratamento fica registrado sem baixa:
--    a carência é segurança alimentar e não pode se perder porque faltou lançar a compra.
-- 3. Excluir o lançamento do apontamento leva a medicação junto; excluir ou cancelar o manejo devolve
--    o produto ao estoque.
--
-- O custo do kg continua vindo do financeiro (compra de medicamento na categoria de sanidade); a baixa
-- de estoque mostra o custo por lote sem somar de novo no custo do kg.

create table medicamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  tipo text not null default 'medicamento' check (tipo in ('medicamento', 'vitamina', 'vacina', 'outro')),
  principio_ativo text,
  dose_por_unidade numeric(12,4) check (dose_por_unidade > 0),
  unidade_dose text not null default 'ml' check (unidade_dose in ('ml', 'l', 'mg', 'g', 'kg', 'un')),
  via text not null default 'agua' check (via in ('agua', 'racao', 'spray', 'ocular', 'injetavel', 'outro')),
  carencia_dias smallint not null default 0 check (carencia_dias between 0 and 365),
  produto_id uuid references produtos(id) on delete set null,
  dose_por_unidade_estoque numeric(14,4) check (dose_por_unidade_estoque > 0),
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome)
);
create index on medicamentos (produto_id);

alter table medicamentos enable row level security;
create policy membros on medicamentos using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on medicamentos as restrictive for insert with check (app.pode(empresa_id, 'sanidade.editar'));
create policy escrita_alterar on medicamentos as restrictive for update
  using (app.pode(empresa_id, 'sanidade.editar')) with check (app.pode(empresa_id, 'sanidade.editar'));
create policy escrita_apagar on medicamentos as restrictive for delete using (app.pode(empresa_id, 'sanidade.editar'));

-- Quantas unidades da dose há em 1 unidade do produto, quando dá para converter pelo nome da unidade.
create or replace function app.fator_unidade(p_dose text, p_produto text) returns numeric
language sql immutable as $$
  with u as (
    select lower(trim(p_dose)) as d,
           case lower(trim(coalesce(p_produto, '')))
             when 'lt' then 'l' when 'litro' then 'l' when 'litros' then 'l'
             when 'dose' then 'un' when 'doses' then 'un' when 'und' then 'un' when 'unidade' then 'un'
             else lower(trim(coalesce(p_produto, ''))) end as p
  )
  select case
    when d = p then 1
    when d = 'ml' and p = 'l' then 1000
    when d = 'l' and p = 'ml' then 0.001
    when d = 'mg' and p = 'g' then 1000
    when d = 'mg' and p = 'kg' then 1000000
    when d = 'g' and p = 'kg' then 1000
    when d = 'g' and p = 'mg' then 0.001
    when d = 'kg' and p = 'g' then 0.001
  end from u
$$;

create or replace function app.medicamento_conferir() returns trigger
language plpgsql set search_path = public as $$
declare v_unidade text; v_fator numeric;
begin
  new.nome := trim(new.nome);
  new.updated_at := now();
  if new.produto_id is null then
    new.dose_por_unidade_estoque := null;
    return new;
  end if;
  select unidade into v_unidade from produtos where id = new.produto_id;
  v_fator := app.fator_unidade(new.unidade_dose, v_unidade);
  if v_fator is not null then
    new.dose_por_unidade_estoque := v_fator;
  elsif new.dose_por_unidade_estoque is null then
    raise exception 'Quantos % há em 1 % do produto no estoque? Informe para a baixa do estoque', new.unidade_dose, v_unidade
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger conferir before insert or update on medicamentos for each row execute function app.medicamento_conferir();

-- Manejo de sanidade ganha o vínculo com o cadastro, a receita aplicada e o lançamento do apontamento
alter table eventos_sanitarios drop constraint eventos_sanitarios_tipo_check;
alter table eventos_sanitarios add constraint eventos_sanitarios_tipo_check
  check (tipo in ('vacina', 'medicacao', 'vitamina', 'pesagem', 'debicagem', 'muda', 'exame', 'limpeza', 'outro'));
alter table eventos_sanitarios
  add column medicamento_id uuid references medicamentos(id) on delete set null,
  add column dose_por_unidade numeric(12,4) check (dose_por_unidade > 0),
  add column agua_l numeric(12,1) check (agua_l > 0),
  add column quantidade numeric(14,4) check (quantidade > 0),
  add column dias_tratamento smallint check (dias_tratamento between 1 and 120),
  add column lancamento_id uuid references apontamento_lancamentos(id) on delete cascade;
create unique index eventos_sanitarios_lancamento_medicamento on eventos_sanitarios (lancamento_id, medicamento_id)
  where lancamento_id is not null;
create index on eventos_sanitarios (medicamento_id);

-- Excluir ou cancelar o manejo devolve o produto (as baixas de ovos em carência ficam: são perda de ovos).
create or replace function app.evento_devolver_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.status <> 'cancelado' or old.status = 'cancelado') then return new; end if;
  delete from movimentos_estoque
  where origem_tabela = 'eventos_sanitarios' and origem_id = old.id and tipo = 'consumo_lote';
  return coalesce(new, old);
end $$;
revoke all on function app.evento_devolver_estoque() from public;
create trigger devolver_estoque after delete or update of status on eventos_sanitarios
  for each row execute function app.evento_devolver_estoque();

-- Registra o que foi aplicado num viveiro. Sem lançamento, vale o lote que estava no viveiro na data.
-- p_dose_por_unidade vazio usa a do cadastro; p_quantidade vazia vira dose × litros de água medicada.
-- Pode ser chamado por quem lança apontamento ou sanidade (security definer: confere empresa e permissão).
create or replace function public.registrar_medicacao(
  p_empresa uuid, p_viveiro uuid, p_data date, p_medicamento uuid, p_dias integer default 1,
  p_dose_por_unidade numeric default null, p_agua_l numeric default null, p_quantidade numeric default null,
  p_observacoes text default null, p_lancamento uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  m medicamentos%rowtype;
  p produtos%rowtype;
  v_lote uuid;
  v_id uuid;
  v_dose numeric;
  v_qtd numeric;
  v_estoque numeric;
  v_dep uuid;
  v_saldo numeric;
begin
  if not app.pode_algum(p_empresa, array['apontamentos.editar', 'sanidade.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar medicação' using errcode = 'insufficient_privilege';
  end if;
  select * into m from medicamentos where id = p_medicamento and empresa_id = p_empresa;
  if not found then raise exception 'Medicamento não encontrado' using errcode = 'no_data_found'; end if;

  if p_lancamento is not null then
    select id into v_id from eventos_sanitarios where lancamento_id = p_lancamento and medicamento_id = p_medicamento;
    if found then return v_id; end if;   -- reenvio do app offline
    select d.viveiro_id, d.data, d.lote_id into p_viveiro, p_data, v_lote
    from apontamento_lancamentos l join apontamentos_diarios d on d.id = l.apontamento_id
    where l.id = p_lancamento and l.empresa_id = p_empresa;
    if not found then raise exception 'Lançamento do apontamento não encontrado' using errcode = 'no_data_found'; end if;
  end if;

  if p_data is null or p_data > app.hoje(p_empresa) then
    raise exception 'Não dá para lançar medicação em data futura' using errcode = 'check_violation';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 120 then
    raise exception 'Dias de tratamento: de 1 a 120' using errcode = 'check_violation';
  end if;
  if (p_dose_por_unidade is not null and p_dose_por_unidade <= 0) or (p_agua_l is not null and p_agua_l <= 0)
     or (p_quantidade is not null and p_quantidade <= 0) then
    raise exception 'Dose, água e quantidade precisam ser maiores que zero' using errcode = 'check_violation';
  end if;

  if v_lote is null then
    select lote_id into v_lote from lote_alocacoes
    where viveiro_id = p_viveiro and empresa_id = p_empresa and periodo @> p_data;
    if not found then
      raise exception 'Nenhum lote estava neste viveiro em %', to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
    end if;
  end if;

  v_dose := coalesce(p_dose_por_unidade, m.dose_por_unidade);
  v_qtd := coalesce(p_quantidade, v_dose * p_agua_l);

  insert into eventos_sanitarios (empresa_id, lote_id, viveiro_id, data, tipo, produto_id, via, dose, carencia_dias,
                                  observacoes, status, medicamento_id, dose_por_unidade, agua_l, quantidade, dias_tratamento, lancamento_id)
  values (p_empresa, v_lote, p_viveiro, p_data,
          case m.tipo when 'medicamento' then 'medicacao' when 'outro' then 'medicacao' else m.tipo end,
          m.produto_id,
          case m.via when 'agua' then 'água' when 'racao' then 'ração' when 'injetavel' then 'injetável' when 'outro' then null else m.via end,
          concat_ws(', ', m.nome,
                    case when v_dose is not null then format('%s %s/L', trim(to_char(v_dose, 'FM999999990.####')), m.unidade_dose) end,
                    case when p_dias > 1 then format('%s dias', p_dias) end),
          case when m.carencia_dias > 0 then p_dias + m.carencia_dias else 0 end,
          nullif(trim(p_observacoes), ''), 'realizado', m.id, v_dose, p_agua_l, v_qtd, p_dias, p_lancamento)
  returning id into v_id;

  -- Baixa do estoque: só com produto ligado, quantidade conhecida e saldo para isso
  if m.produto_id is not null and v_qtd is not null and m.dose_por_unidade_estoque is not null then
    select * into p from produtos where id = m.produto_id;
    v_estoque := round(v_qtd / m.dose_por_unidade_estoque, 3);
    if v_estoque > 0 then
      perform app.travar_estoque(p_empresa);
      select deposito_id, sum(quantidade) into v_dep, v_saldo from movimentos_estoque
      where produto_id = p.id group by deposito_id order by sum(quantidade) desc limit 1;
      if coalesce(v_saldo, 0) >= v_estoque then
        insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, lote_id, viveiro_id,
                                        origem_tabela, origem_id, observacao, created_by)
        values (p_empresa, p.id, v_dep, p_data, 'consumo_lote', -v_estoque, p.custo_medio_cents, v_lote, p_viveiro,
                'eventos_sanitarios', v_id, format('Medicação: %s', m.nome), auth.uid());
      end if;
    end if;
  end if;
  return v_id;
end $$;

-- Medicações por lote com o que saiu do estoque e quanto custou
create view medicacoes with (security_invoker = true) as
select e.id, e.empresa_id, e.lote_id, l.codigo as lote_codigo, e.viveiro_id, g.nome as viveiro_nome, e.data, e.tipo, e.status,
       e.medicamento_id, m.nome as medicamento_nome, m.unidade_dose, e.dose_por_unidade, e.agua_l, e.quantidade, e.dias_tratamento,
       e.carencia_dias, e.lancamento_id, e.observacoes,
       mv.quantidade is not null as baixou_estoque,
       -mv.quantidade as quantidade_estoque,
       round(-mv.quantidade * mv.custo_unit_cents)::bigint as custo_cents
from eventos_sanitarios e
join lotes l on l.id = e.lote_id
left join viveiros g on g.id = e.viveiro_id
left join medicamentos m on m.id = e.medicamento_id
left join lateral (
  select sum(x.quantidade) as quantidade, max(x.custo_unit_cents) as custo_unit_cents from movimentos_estoque x
  where x.origem_tabela = 'eventos_sanitarios' and x.origem_id = e.id and x.tipo = 'consumo_lote'
  having count(*) > 0
) mv on true
where e.medicamento_id is not null;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on medicamentos to authenticated;
    grant select on medicacoes to authenticated;
    grant execute on function public.registrar_medicacao(uuid, uuid, date, uuid, integer, numeric, numeric, numeric, text, uuid) to authenticated;
    grant execute on function app.fator_unidade(text, text) to authenticated;
  end if;
end $$;
revoke execute on function public.registrar_medicacao(uuid, uuid, date, uuid, integer, numeric, numeric, numeric, text, uuid) from public, anon;

select app.travar_referencias();
