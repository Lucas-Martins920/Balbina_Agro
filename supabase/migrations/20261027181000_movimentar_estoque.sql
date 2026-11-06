-- Estoque unificado: um só lançamento (entrada, saída ou ajuste de saldo) para qualquer produto do cadastro,
-- usado tanto pela tela de Estoque quanto por Produtos e insumos.
-- Ovos: o saldo fica no produto base da classe, em ovos; produtos de ovo embalados (dúzia, caixa)
-- movimentam o produto base da classe convertendo pelo fator de ovos.

alter table movimentos_estoque add column if not exists observacao text;

-- Depósito usado quando o produto (não ovo) não tem depósito escolhido: o primeiro que não é de ovos,
-- ou um "Almoxarifado" criado na hora.
create or replace function app.deposito_padrao(p_empresa uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from depositos where empresa_id = p_empresa and tipo <> 'ovos' order by nome limit 1;
  if not found then
    insert into depositos (empresa_id, nome, tipo) values (p_empresa, 'Almoxarifado', 'almoxarifado')
    on conflict (empresa_id, nome) do update set nome = excluded.nome
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- p_operacao: 'entrada' (soma), 'saida' (tira) ou 'ajuste' (p_quantidade é o saldo contado; lança a diferença).
-- p_quantidade na unidade do produto. Retorna o quanto mexeu no saldo, na unidade do produto (+ entrou, - saiu).
create or replace function public.movimentar_estoque(
  p_produto uuid, p_operacao text, p_quantidade numeric, p_deposito uuid default null, p_data date default current_date,
  p_custo_total_cents bigint default null, p_motivo text default null, p_lote uuid default null, p_observacao text default null
) returns numeric language plpgsql set search_path = public as $$
declare
  p produtos%rowtype;
  v_alvo uuid;
  v_dep uuid;
  v_fator numeric := 1;
  v_qtd numeric;
  v_saldo numeric;
  v_mov numeric;
  v_tipo text;
  v_custo numeric;
begin
  select * into p from produtos where id = p_produto;
  if not found then raise exception 'Produto não encontrado' using errcode = 'no_data_found'; end if;
  if not app.pode_algum(p.empresa_id, array['estoque.editar', 'racao.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar estoque' using errcode = 'insufficient_privilege';
  end if;
  if p_operacao is null or p_operacao not in ('entrada', 'saida', 'ajuste') then
    raise exception 'Escolha entrada, saída ou ajuste de saldo' using errcode = 'check_violation';
  end if;
  if p_quantidade is null or p_quantidade < 0 or (p_quantidade = 0 and p_operacao <> 'ajuste') then
    raise exception 'Quantidade precisa ser positiva' using errcode = 'check_violation';
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'A data do lançamento não pode ser futura' using errcode = 'check_violation';
  end if;
  if p_lote is not null and not exists (select 1 from lotes where id = p_lote and empresa_id = p.empresa_id) then
    raise exception 'Lote inválido' using errcode = 'check_violation';
  end if;

  if p.tipo = 'ovo' then
    if p.classe_peixe_id is null then raise exception 'Produto de ovo sem classe' using errcode = 'check_violation'; end if;
    v_alvo := app.produto_base_peixe(p.classe_peixe_id);
    v_fator := coalesce(nullif(p.fator_kg, 0), 1);
    v_dep := app.deposito_ovos(p.empresa_id);
  else
    v_alvo := p.id;
    v_dep := coalesce(p_deposito, app.deposito_padrao(p.empresa_id));
    if not exists (select 1 from depositos where id = v_dep and empresa_id = p.empresa_id and tipo <> 'ovos') then
      raise exception 'Depósito inválido' using errcode = 'check_violation';
    end if;
  end if;

  v_qtd := p_quantidade * v_fator;
  if p.tipo = 'ovo' and v_qtd <> trunc(v_qtd) then
    raise exception 'A quantidade precisa dar um número inteiro de ovos' using errcode = 'check_violation';
  end if;
  v_saldo := app.saldo_produto(v_alvo, v_dep);

  if p_operacao = 'entrada' then
    v_mov := v_qtd;
    v_tipo := case when p.tipo <> 'ovo' and p_custo_total_cents is not null then 'entrada_compra' else 'ajuste' end;
  elsif p_operacao = 'saida' then
    v_tipo := coalesce(nullif(p_motivo, ''), 'perda');
    if v_tipo not in ('consumo_lote', 'perda', 'ajuste') or (p.tipo = 'ovo' and v_tipo = 'consumo_lote') then
      raise exception 'Motivo de saída inválido' using errcode = 'check_violation';
    end if;
    if v_saldo < v_qtd then
      raise exception 'Saldo insuficiente de %: há % %', p.nome, round(v_saldo / v_fator, 3), p.unidade
        using errcode = 'check_violation';
    end if;
    v_mov := -v_qtd;
  else
    v_mov := v_qtd - v_saldo;
    v_tipo := 'ajuste';
    if v_mov = 0 then return 0; end if;
  end if;

  if p_custo_total_cents is not null and p_custo_total_cents < 0 then
    raise exception 'Custo não pode ser negativo' using errcode = 'check_violation';
  end if;
  v_custo := case
    when p.tipo = 'ovo' then null
    when v_tipo = 'entrada_compra' then p_custo_total_cents::numeric / v_qtd
    else p.custo_medio_cents end;

  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, lote_id,
                                  origem_tabela, observacao, created_by)
  values (p.empresa_id, v_alvo, v_dep, p_data, v_tipo, v_mov, v_custo, case when v_tipo = 'consumo_lote' then p_lote end,
          'lancamento_manual', nullif(trim(p_observacao), ''), auth.uid());
  if v_tipo = 'entrada_compra' then
    perform app.atualizar_custo_medio(v_alvo, v_qtd, v_custo);
  end if;
  return v_mov / v_fator;
end $$;

-- Saldo de cada produto do cadastro, somando os depósitos. Ovo embalado mostra o saldo da classe
-- convertido para a sua unidade (12 ovos = 1 dúzia).
create or replace view saldos_produtos with (security_invoker = true) as
select p.empresa_id, p.id as produto_id,
       case when p.tipo = 'ovo' and not p.base_estoque then coalesce(eo.saldo, 0) / coalesce(nullif(p.fator_kg, 0), 1)
            when p.tipo = 'ovo' then coalesce(eo.saldo, 0)
            else coalesce(s.saldo, 0) end as saldo,
       case when p.tipo = 'ovo' then null else round(coalesce(s.saldo, 0) * p.custo_medio_cents)::bigint end as valor_cents
from produtos p
left join (select produto_id, sum(quantidade) as saldo from movimentos_estoque group by produto_id) s on s.produto_id = p.id
left join estoque_peixe eo on eo.classe_id = p.classe_peixe_id and p.tipo = 'ovo';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.movimentar_estoque(uuid, text, numeric, uuid, date, bigint, text, uuid, text) to authenticated;
    grant execute on function app.deposito_padrao(uuid) to authenticated;
    grant select on saldos_produtos to authenticated;
  end if;
end $$;
