-- App de campo (/campo): insumos aplicados no viveiro pelo celular, com reenvio seguro pela fila offline.
--
-- 1. Tipo de produto "corretivo": calcário, cal, adubos e fertilizantes da água, que saem do estoque no viveiro.
-- 2. Manejo do viveiro vazio: calagem, adubação e limpeza do preparo (antes do povoamento) não têm lote.
-- 3. registrar_insumo_viveiro: o que o tratador aplicou no viveiro. Medicamento e vitamina seguem registrar_medicacao
--    (carência e baixa pela dose); corretivo e demais produtos saem do estoque na quantidade informada.

-- ---------------------------------------------------------------------------
-- 1. Corretivo e fertilizante como tipo de produto
-- ---------------------------------------------------------------------------
alter table produtos drop constraint produtos_tipo_check;
alter table produtos add constraint produtos_tipo_check
  check (tipo in ('peixe', 'alevino', 'racao', 'insumo_racao', 'corretivo', 'embalagem', 'medicamento', 'vacina', 'outro'));

-- ---------------------------------------------------------------------------
-- 2. Manejo sem lote (preparo do viveiro) e identificador do envio do celular
-- ---------------------------------------------------------------------------
alter table eventos_sanitarios alter column lote_id drop not null;
alter table eventos_sanitarios add constraint eventos_sanitarios_lote_ou_preparo
  check (lote_id is not null or tipo in ('calagem', 'adubacao', 'limpeza', 'outro'));
alter table eventos_sanitarios add column client_id uuid unique;
comment on column eventos_sanitarios.client_id is
  'Identificador gerado pelo celular para o reenvio da fila offline não duplicar o manejo.';

-- ---------------------------------------------------------------------------
-- 3. Insumo aplicado no viveiro
-- ---------------------------------------------------------------------------
create function public.registrar_insumo_viveiro(
  p_empresa uuid, p_viveiro uuid, p_data date, p_tipo text,
  p_produto uuid default null, p_quantidade numeric default null,
  p_medicamento uuid default null, p_dias integer default 1, p_dose_por_unidade numeric default null,
  p_base numeric default null, p_observacoes text default null, p_client_id uuid default null,
  p_baixar_estoque boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_lote uuid;
  p produtos%rowtype;
  v_dep uuid;
  v_saldo numeric;
begin
  if p_client_id is not null then
    select id into v_id from eventos_sanitarios where client_id = p_client_id and empresa_id = p_empresa;
    if found then return v_id; end if;   -- reenvio da fila do celular
  end if;
  if not app.pode_algum(p_empresa, array['apontamentos.editar', 'sanidade.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar insumos no viveiro' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from viveiros where id = p_viveiro and empresa_id = p_empresa) then
    raise exception 'Viveiro não encontrado' using errcode = 'no_data_found';
  end if;
  if p_data is null or p_data > app.hoje(p_empresa) then
    raise exception 'Informe a data do manejo; data futura não é aceita' using errcode = 'check_violation';
  end if;

  -- medicamento ou vitamina do cadastro: a mesma regra da Sanidade e do apontamento
  if p_medicamento is not null then
    v_id := public.registrar_medicacao(p_empresa, p_viveiro, p_data, p_medicamento, coalesce(p_dias, 1),
                                       p_dose_por_unidade, p_base, p_quantidade, p_observacoes, null);
    update eventos_sanitarios set client_id = p_client_id where id = v_id;
    return v_id;
  end if;

  if p_tipo is null or p_tipo not in ('calagem', 'adubacao', 'banho', 'limpeza', 'outro') then
    raise exception 'Escolha o manejo: calagem, adubação, banho, limpeza ou outro' using errcode = 'check_violation';
  end if;
  select lote_id into v_lote from lote_alocacoes
  where viveiro_id = p_viveiro and empresa_id = p_empresa and periodo @> p_data
  order by lower(periodo) desc limit 1;
  if v_lote is null and p_tipo = 'banho' then
    raise exception 'O viveiro estava vazio em %: banho é aplicado nos peixes', to_char(p_data, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  if p_produto is not null then
    select * into p from produtos where id = p_produto and empresa_id = p_empresa;
    if not found or p.tipo in ('peixe', 'alevino', 'embalagem') then
      raise exception 'Produto inválido para aplicar no viveiro' using errcode = 'check_violation';
    end if;
    if p_quantidade is null or p_quantidade <= 0 then
      raise exception 'Informe quanto de % foi aplicado', p.nome using errcode = 'check_violation';
    end if;
  elsif p_quantidade is not null then
    raise exception 'Escolha o produto aplicado' using errcode = 'check_violation';
  end if;

  insert into eventos_sanitarios (empresa_id, lote_id, viveiro_id, data, tipo, produto_id, dose, quantidade, carencia_dias,
                                  observacoes, status, client_id)
  values (p_empresa, v_lote, p_viveiro, p_data, p_tipo, p.id,
          case when p.id is not null then format('%s %s %s', p.nome, replace(trim_scale(p_quantidade)::text, '.', ','), p.unidade) end,
          p_quantidade, 0, nullif(trim(p_observacoes), ''), 'realizado', p_client_id)
  returning id into v_id;

  -- baixa do estoque no depósito com mais saldo; sem saldo, o celular pergunta se envia sem baixar
  if p.id is not null and coalesce(p_baixar_estoque, true) then
    perform app.travar_estoque(p_empresa);
    select deposito_id, sum(quantidade) into v_dep, v_saldo from movimentos_estoque
    where produto_id = p.id group by deposito_id order by sum(quantidade) desc limit 1;
    if coalesce(v_saldo, 0) < p_quantidade then
      raise exception 'Saldo insuficiente de %: há % %', p.nome, replace(trim_scale(round(coalesce(v_saldo, 0), 3))::text, '.', ','), p.unidade
        using errcode = 'check_violation';
    end if;
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, lote_id, viveiro_id,
                                    origem_tabela, origem_id, observacao, created_by)
    values (p_empresa, p.id, v_dep, p_data, 'consumo_lote', -round(p_quantidade, 3), p.custo_medio_cents, v_lote, p_viveiro,
            'eventos_sanitarios', v_id,
            case p_tipo when 'calagem' then 'Calagem' when 'adubacao' then 'Adubação' when 'banho' then 'Banho'
                        when 'limpeza' then 'Limpeza' else 'Insumo' end || ' no viveiro', auth.uid());
  end if;
  return v_id;
end $$;

revoke all on function public.registrar_insumo_viveiro(uuid, uuid, date, text, uuid, numeric, uuid, integer, numeric, numeric, text, uuid, boolean)
  from public, anon;
grant execute on function public.registrar_insumo_viveiro(uuid, uuid, date, text, uuid, numeric, uuid, integer, numeric, numeric, text, uuid, boolean)
  to authenticated;

select app.travar_referencias();
