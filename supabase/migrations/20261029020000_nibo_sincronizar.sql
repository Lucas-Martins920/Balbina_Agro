-- NIBO: a reimportação passa a sincronizar, e o saldo de cada conta fecha com o NIBO.
--
-- Os saldos continuavam errados mesmo depois de corrigir a leitura, porque a importação só acrescentava:
-- o que tinha entrado errado numa importação anterior (lançamento lido do extrato com o sinal trocado,
-- transferência casada com o par errado, baixa na conta errada) ficava no Balbina para sempre.
--
--  1. sincronizar_importacao: antes de importar, apaga o que veio dessa origem a partir da data inicial
--     e não está mais no pacote, ou mudou de conta, data ou valor. A importação em seguida cria de novo,
--     certo. Meses fechados não são mexidos. O histórico de alterações registra cada linha apagada.
--  2. fixar_saldos_importacao: depois de importar, o saldo de abertura de cada conta na data inicial é o
--     saldo de hoje no NIBO menos o que o Balbina movimentou nela desde então. Assim o saldo de hoje bate
--     com o NIBO; a auditoria mostra, dia a dia, onde os lançamentos ainda diferem.

-- p_pacote: {desde, titulos: [chave, ...], baixas: [{chave, conta_chave, data, valor_cents}],
--            transferencias: [{chave, origem_chave, destino_chave, data, valor_cents}]}
create or replace function public.sincronizar_importacao(p_empresa uuid, p_origem text, p_pacote jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_desde date := nullif(p_pacote->>'desde', '')::date;
  v_chaves text[];
  v_ids uuid[];
  n_baixas int := 0; n_transf int := 0; n_tit int := 0; n_mov int := 0; n_orfaos int := 0;
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o usuário master da empresa pode importar dados' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from integracoes_empresa where empresa_id = p_empresa and sistema = p_origem) then
    raise exception 'A integração com % não está liberada para esta empresa', p_origem using errcode = 'insufficient_privilege';
  end if;
  if v_desde is null then
    raise exception 'Informe a data inicial da sincronização' using errcode = 'check_violation';
  end if;

  -- vínculo cujo registro já foi apagado no Balbina: sai, para a importação criar de novo
  with orfaos as (
    delete from importacao_vinculos v
     where v.empresa_id = p_empresa and v.origem = p_origem and v.entidade in ('titulo', 'baixa', 'transferencia')
       and not exists (select 1 from agendamentos a where a.id = v.registro_id and v.entidade = 'titulo')
       and not exists (select 1 from baixas b where b.id = v.registro_id and v.entidade = 'baixa')
       and not exists (select 1 from transferencias t where t.id = v.registro_id and v.entidade = 'transferencia')
    returning 1)
  select count(*) into n_orfaos from orfaos;

  -- baixas: fora do pacote, ou em outra conta, data ou valor
  with novo as (
    select e->>'chave' chave, e->>'conta_chave' conta_chave, (e->>'data')::date data, (e->>'valor_cents')::bigint valor
      from jsonb_array_elements(coalesce(p_pacote->'baixas', '[]')) e)
  select coalesce(array_agg(v.chave), '{}'), coalesce(array_agg(b.id), '{}') into v_chaves, v_ids
    from importacao_vinculos v
    join baixas b on b.id = v.registro_id
    left join novo n on n.chave = v.chave
   where v.empresa_id = p_empresa and v.origem = p_origem and v.entidade = 'baixa' and b.data >= v_desde
     and not exists (select 1 from periodos_fechados p where p.empresa_id = p_empresa and p.mes = date_trunc('month', b.data)::date)
     and (n.chave is null or n.data is distinct from b.data or n.valor is distinct from b.valor_cents + b.juros_cents
          or (n.conta_chave is not null and b.conta_id is distinct from app.vinculo(p_empresa, p_origem, 'conta', n.conta_chave)));
  delete from baixas where id = any (v_ids);
  get diagnostics n_baixas = row_count;
  delete from importacao_vinculos where empresa_id = p_empresa and origem = p_origem and entidade = 'baixa' and chave = any (v_chaves);

  -- transferências: fora do pacote (outro par de lançamentos), ou com outras contas, data ou valor
  with novo as (
    select e->>'chave' chave, e->>'origem_chave' origem_chave, e->>'destino_chave' destino_chave,
           (e->>'data')::date data, (e->>'valor_cents')::bigint valor
      from jsonb_array_elements(coalesce(p_pacote->'transferencias', '[]')) e)
  select coalesce(array_agg(v.chave), '{}'), coalesce(array_agg(t.id), '{}') into v_chaves, v_ids
    from importacao_vinculos v
    join transferencias t on t.id = v.registro_id
    left join novo n on n.chave = v.chave
   where v.empresa_id = p_empresa and v.origem = p_origem and v.entidade = 'transferencia' and t.data >= v_desde
     and not exists (select 1 from periodos_fechados p where p.empresa_id = p_empresa and p.mes = date_trunc('month', t.data)::date)
     and (n.chave is null or n.data is distinct from t.data or n.valor is distinct from t.valor_cents
          or (n.origem_chave is not null and t.conta_origem_id is distinct from app.vinculo(p_empresa, p_origem, 'conta', n.origem_chave))
          or (n.destino_chave is not null and t.conta_destino_id is distinct from app.vinculo(p_empresa, p_origem, 'conta', n.destino_chave)));
  delete from transferencias where id = any (v_ids);
  get diagnostics n_transf = row_count;
  delete from importacao_vinculos where empresa_id = p_empresa and origem = p_origem and entidade = 'transferencia' and chave = any (v_chaves);

  -- títulos importados que não estão mais no pacote e ficaram sem baixa
  select coalesce(array_agg(distinct a.id), '{}') into v_ids
    from importacao_vinculos v
    join agendamentos a on a.id = v.registro_id
   where v.empresa_id = p_empresa and v.origem = p_origem and v.entidade = 'titulo'
     and a.origem = 'importacao' and a.vencimento >= v_desde
     and not exists (select 1 from baixas b where b.agendamento_id = a.id)
     and not exists (select 1 from importacao_vinculos w, jsonb_array_elements_text(coalesce(p_pacote->'titulos', '[]')) k
                      where w.empresa_id = p_empresa and w.origem = p_origem and w.entidade = 'titulo'
                        and w.registro_id = a.id and w.chave = k);
  delete from agendamentos where id = any (v_ids);
  get diagnostics n_tit = row_count;
  delete from importacao_vinculos where empresa_id = p_empresa and origem = p_origem and entidade = 'titulo' and registro_id = any (v_ids);

  -- extrato conciliado que perdeu o lançamento: o do NIBO sai (volta na conciliação), o resto fica pendente
  with soltos as (
    delete from movimentos_bancarios m
     where m.empresa_id = p_empresa and m.status = 'conciliado' and m.id_externo like p_origem || ':%'
       and not exists (select 1 from conciliacoes c where c.movimento_id = m.id)
    returning 1)
  select count(*) into n_mov from soltos;
  update movimentos_bancarios m set status = 'pendente'
   where m.empresa_id = p_empresa and m.status = 'conciliado'
     and not exists (select 1 from conciliacoes c where c.movimento_id = m.id);

  return jsonb_build_object('baixas', n_baixas, 'transferencias', n_transf, 'titulos', n_tit,
                            'extrato', n_mov, 'vinculos_orfaos', n_orfaos);
end $$;

revoke all on function public.sincronizar_importacao(uuid, text, jsonb) from public;
grant execute on function public.sincronizar_importacao(uuid, text, jsonb) to authenticated;

-- p_contas: [{conta_chave, saldo_cents}] com o saldo de hoje no sistema de origem
create or replace function public.fixar_saldos_importacao(p_empresa uuid, p_origem text, p_desde date, p_contas jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o usuário master da empresa pode importar dados' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from integracoes_empresa where empresa_id = p_empresa and sistema = p_origem) then
    raise exception 'A integração com % não está liberada para esta empresa', p_origem using errcode = 'insufficient_privilege';
  end if;
  if p_desde is null then
    raise exception 'Informe a data inicial' using errcode = 'check_violation';
  end if;

  with alvo as (
    select app.vinculo(p_empresa, p_origem, 'conta', e->>'conta_chave') conta_id, (e->>'saldo_cents')::bigint saldo
      from jsonb_array_elements(coalesce(p_contas, '[]')) e
     where e->>'saldo_cents' is not null)
  update contas_financeiras f set
    saldo_inicial_data = p_desde,
    saldo_inicial_cents = a.saldo - coalesce((select sum(m.valor_cents) from movimentos_caixa m
                                               where m.conta_id = f.id and m.data >= p_desde), 0),
    updated_at = now()
  from alvo a
  where f.id = a.conta_id and f.empresa_id = p_empresa;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.fixar_saldos_importacao(uuid, text, date, jsonb) from public;
grant execute on function public.fixar_saldos_importacao(uuid, text, date, jsonb) to authenticated;

select app.travar_referencias();
