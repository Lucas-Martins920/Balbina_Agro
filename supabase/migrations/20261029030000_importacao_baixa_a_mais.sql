-- Baixa importada maior que o saldo do título (o NIBO recebeu ou pagou a mais, ou duas vezes) deixava
-- de entrar: "Baixa extra ... ignorada: o título já estava quitado". O dinheiro sumia da conta naquele
-- dia (diferença de R$ 60 no Caixa Manaus da Amazônia Viva). Agora o excedente entra num título próprio,
-- já quitado, com a categoria do título original.

-- Grava uma baixa importada no título. O que passar do saldo em aberto vira juros.
create or replace function app.importar_baixa(p_empresa uuid, p_origem text, p_agendamento uuid, x jsonb,
                                              out inserida boolean, out aviso text)
language plpgsql as $$
declare
  v_conta uuid;
  v_valor bigint := (x->>'valor_cents')::bigint;
  v_resto bigint;
  v_desc text;
  v_id uuid;
  v_chave text := nullif(x->>'chave', '');
  v_novo uuid;
begin
  inserida := false;
  if v_chave is not null and app.vinculo(p_empresa, p_origem, 'baixa', v_chave) is not null then return; end if;
  select descricao, greatest(valor_cents - pago_cents, 0) into v_desc, v_resto from agendamentos where id = p_agendamento;

  v_conta := app.vinculo(p_empresa, p_origem, 'conta', coalesce(x->>'conta_chave', app.nome_chave(x->>'conta')));
  if v_conta is null then
    select id into v_conta from contas_financeiras
     where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(x->>'conta') limit 1;
  end if;
  if v_conta is null then
    aviso := format('Baixa de "%s" sem conta conhecida (%s): ficou em aberto', v_desc, x->>'conta');
    return;
  end if;

  if v_chave is not null then
    select b.id into v_id from baixas b
     where b.agendamento_id = p_agendamento and b.conta_id = v_conta and b.data = (x->>'data')::date
       and b.valor_cents + b.juros_cents = v_valor
       and not exists (select 1 from importacao_vinculos v where v.empresa_id = p_empresa and v.entidade = 'baixa' and v.registro_id = b.id)
     limit 1;
    if v_id is not null then
      perform app.vincular(p_empresa, p_origem, 'baixa', v_chave, v_id);
      return;
    end if;
  end if;

  if v_resto = 0 and v_chave is null then
    -- sem chave não dá para saber se é a mesma baixa de uma importação anterior: não duplica
    aviso := format('Baixa extra de "%s" ignorada: o título já estava quitado', v_desc);
    return;
  end if;
  if v_resto = 0 then
    -- recebido ou pago a mais do que o título: o excedente entra num título próprio, já quitado, com a
    -- categoria do original, para o dinheiro aparecer na conta no dia certo
    insert into agendamentos (empresa_id, tipo, contato_id, descricao, vencimento, competencia, previsao,
                              valor_cents, origem, status, created_by)
    select a.empresa_id, a.tipo, a.contato_id, left(a.descricao || ' (valor a mais)', 500), (x->>'data')::date,
           date_trunc('month', (x->>'data')::date)::date, (x->>'data')::date, v_valor, 'importacao', 'aberto', auth.uid()
      from agendamentos a where a.id = p_agendamento
    returning id into v_novo;
    insert into agendamento_rateios (empresa_id, agendamento_id, categoria_id, centro_custo_id, valor_cents)
    select p_empresa, v_novo, r.categoria_id, r.centro_custo_id, v_valor
      from agendamento_rateios r where r.agendamento_id = p_agendamento order by r.valor_cents desc limit 1;
    insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, observacao, created_by)
    values (p_empresa, v_novo, v_conta, (x->>'data')::date, v_valor, 'Importado de ' || p_origem, auth.uid())
    returning id into v_id;
    perform app.vincular(p_empresa, p_origem, 'baixa', v_chave, v_id);
    -- some na sincronização junto com a baixa, se o NIBO deixar de ter esse lançamento
    perform app.vincular(p_empresa, p_origem, 'titulo', 'excedente:' || v_chave, v_novo);
    inserida := true;
    aviso := format('Baixa a mais em "%s" entrou como lançamento próprio (valor a mais)', v_desc);
    return;
  end if;
  insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, juros_cents, observacao, created_by)
  values (p_empresa, p_agendamento, v_conta, (x->>'data')::date, least(v_valor, v_resto), greatest(v_valor - v_resto, 0),
          'Importado de ' || p_origem, auth.uid())
  returning id into v_id;
  if v_chave is not null then perform app.vincular(p_empresa, p_origem, 'baixa', v_chave, v_id); end if;
  inserida := true;
end $$;


select app.travar_referencias();
