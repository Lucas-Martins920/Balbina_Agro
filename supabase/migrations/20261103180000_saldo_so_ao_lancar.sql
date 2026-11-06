-- Conciliação só mexe no saldo quando a pessoa lança (pedido do Nicolas, 2026-11-03).
--
-- 1. Importar o extrato (OFX ou Open Finance) não lança mais nada sozinho. Antes, as regras automáticas
--    (inclusive as criadas a partir do histórico do NIBO) criavam título e pagamento na hora da leitura,
--    e o saldo da conta subia só de abrir o arquivo. Agora a importação só aplica a regra "Ignorar" (que
--    não cria pagamento nem mexe no saldo); as regras que lançam rodam quando a pessoa clica em
--    "Aplicar regras".
-- 2. Nada antes da data do saldo inicial da conta entra para conciliar: a importação pula essas linhas
--    (devolve quantas em 'antes_do_saldo'), e o painel, os palpites e as regras não olham para lançamentos
--    antigos que já estejam no extrato.

create or replace function public.importar_extrato(p_conta uuid, p_origem text, p_linhas jsonb, p_arquivo text default null)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_conta contas_financeiras%rowtype;
  v_imp uuid;
  v_novas int;
  v_repetidas int;
  v_antes int;
  v_ignoradas int;
begin
  select * into v_conta from contas_financeiras where id = p_conta;
  if not found then raise exception 'Conta não encontrada' using errcode = 'no_data_found'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Extrato sem lançamentos' using errcode = 'check_violation';
  end if;

  -- o que é antes do saldo inicial já está dentro dele: não entra para conciliar
  select count(*) into v_antes from jsonb_array_elements(p_linhas) x where (x->>'data')::date < v_conta.saldo_inicial_data;

  insert into importacoes_extrato (empresa_id, conta_id, origem, arquivo_path, periodo_inicio, periodo_fim, total_linhas, created_by)
  select v_conta.empresa_id, p_conta, p_origem, p_arquivo, min((x->>'data')::date), max((x->>'data')::date), count(*), auth.uid()
  from jsonb_array_elements(p_linhas) x
  where (x->>'data')::date >= v_conta.saldo_inicial_data
  returning id into v_imp;

  -- Linha repetida: mesma data+valor+descrição que um lançamento de outra importação desta conta. Só contam
  -- os lançamentos que não casaram pelo id com uma linha deste arquivo; a k-ésima linha igual do arquivo
  -- é repetida se a conta já tem k ou mais iguais (dois PIX iguais no mesmo dia continuam dois).
  with linhas as (
    select n, x, (x->>'data')::date as data, (x->>'valor_cents')::bigint as valor,
           app.chave_extrato(coalesce(nullif(trim(x->>'descricao'), ''), 'Sem descrição')) as chave, x->>'id_externo' as id_externo
    from jsonb_array_elements(p_linhas) with ordinality as l(x, n)
    where (x->>'valor_cents')::bigint <> 0
      and (x->>'data')::date >= v_conta.saldo_inicial_data
  ),
  sem_id as (
    select l.n, l.data, l.valor, l.chave, row_number() over (partition by l.data, l.valor, l.chave order by l.n) as k
    from linhas l
    where l.id_externo is null
       or not exists (select 1 from movimentos_bancarios mb where mb.conta_id = p_conta and mb.id_externo = l.id_externo)
  ),
  existentes as (
    select mb.data, mb.valor_cents, app.chave_extrato(mb.descricao) as chave, count(*) as qtd
    from movimentos_bancarios mb
    where mb.conta_id = p_conta
      and mb.data between (select min(data) from linhas) and (select max(data) from linhas)
      and (mb.id_externo is null or mb.id_externo not in (select id_externo from linhas where id_externo is not null))
    group by 1, 2, 3
  ),
  marcadas as (
    select l.*, coalesce(s.k <= e.qtd, false) as repetida
    from linhas l
    left join sem_id s on s.n = l.n
    left join existentes e on e.data = s.data and e.valor_cents = s.valor and e.chave = s.chave
  ),
  novas as (
    insert into movimentos_bancarios (empresa_id, conta_id, importacao_id, data, descricao, valor_cents,
                                      cpf_cnpj_contraparte, nome_contraparte, id_externo)
    select v_conta.empresa_id, p_conta, v_imp, l.data, coalesce(nullif(trim(l.x->>'descricao'), ''), 'Sem descrição'),
           l.valor, nullif(regexp_replace(coalesce(l.x->>'cpf_cnpj', ''), '\D', '', 'g'), ''),
           nullif(trim(l.x->>'nome'), ''), l.id_externo
    from marcadas l
    where not l.repetida
    order by l.n
    on conflict (conta_id, id_externo) do nothing
    returning 1
  )
  select (select count(*) from novas), (select count(*) from marcadas where repetida) into v_novas, v_repetidas;

  update importacoes_extrato set linhas_novas = v_novas, linhas_repetidas = v_repetidas where id = v_imp;

  -- só a regra "Ignorar" roda sozinha: não cria título nem pagamento, não mexe no saldo
  with alvo as (
    select m.id, (select r.id from regras_conciliacao r
                  where r.empresa_id = m.empresa_id and r.tipo = 'ignorar' and app.regra_casa(r, m)
                  order by r.ordem limit 1) as regra_id
    from movimentos_bancarios m
    where m.importacao_id = v_imp and m.status = 'pendente'
  ), feitas as (
    update movimentos_bancarios m set status = 'ignorado', regra_aplicada_id = a.regra_id
    from alvo a where m.id = a.id and a.regra_id is not null
    returning 1
  )
  select count(*) into v_ignoradas from feitas;

  return jsonb_build_object('importacao_id', v_imp, 'total', jsonb_array_length(p_linhas), 'novas', v_novas,
    'repetidas', v_repetidas, 'antes_do_saldo', v_antes,
    'por_regra', v_ignoradas, 'regras_fim', true, 'apos_data', null, 'apos_id', null);
end $$;

-- "Aplicar regras" (a pessoa lançando): não lança o que é antes do saldo inicial
create or replace function public.aplicar_regras_lote(p_conta uuid, p_importacao uuid default null,
  p_apos_data date default null, p_apos_id uuid default null, p_segundos numeric default 3)
returns jsonb language plpgsql set search_path = public as $$
declare
  m movimentos_bancarios%rowtype;
  v_inicio timestamptz := clock_timestamp();
  v_n int := 0;
begin
  for m in select mb.* from movimentos_bancarios mb join contas_financeiras cf on cf.id = mb.conta_id
           where mb.conta_id = p_conta and mb.status = 'pendente' and mb.data >= cf.saldo_inicial_data
             and (p_importacao is null or mb.importacao_id = p_importacao)
             and (p_apos_id is null or (mb.data, mb.id) > (p_apos_data, p_apos_id))
           order by mb.data, mb.id loop
    if app.aplicar_regra_movimento(m) then v_n := v_n + 1; end if;
    if p_segundos is not null and clock_timestamp() - v_inicio >= make_interval(secs => p_segundos::double precision) then
      return jsonb_build_object('aplicadas', v_n, 'fim', false, 'apos_data', m.data, 'apos_id', m.id);
    end if;
  end loop;
  return jsonb_build_object('aplicadas', v_n, 'fim', true);
end $$;

create or replace function public.painel_conciliacao(p_conta uuid, p_limite int default 50)
returns table (movimento_id uuid, data date, descricao text, valor_cents bigint, nome_contraparte text, cpf_cnpj_contraparte text,
               sugestoes jsonb, palpite jsonb, transferencia jsonb, certeira uuid, ja_lancados jsonb)
language sql stable set search_path = public as $$
  select m.id, m.data, m.descricao, m.valor_cents, m.nome_contraparte, m.cpf_cnpj_contraparte,
         s.lista, p.palpite, t.transferencia,
         case when j.lista = '[]'::jsonb
                   and (s.lista->0->>'pontos')::int >= 70
                   and (s.lista->0->>'saldo_cents')::bigint = abs(m.valor_cents)
                   and coalesce((s.lista->1->>'pontos')::int, 0) < (s.lista->0->>'pontos')::int - 10
              then (s.lista->0->>'agendamento_id')::uuid end,
         j.lista
  from movimentos_bancarios m
  cross join lateral (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.pontos desc, abs(x.vencimento - m.data)), '[]'::jsonb) as lista
    from public.sugestoes_conciliacao(m.id) x
  ) s
  cross join lateral (select app.ja_lancados(m) as lista) j
  left join lateral (select to_jsonb(x) as palpite from public.palpite_lancamento(m.id) x limit 1) p on true
  left join lateral (
    -- a outra perna: mesmo valor com sinal trocado noutra conta da empresa, até 3 dias de diferença
    select jsonb_build_object('conta_id', o.conta_id, 'conta_nome', cf.nome) as transferencia
    from movimentos_bancarios o join contas_financeiras cf on cf.id = o.conta_id
    where o.empresa_id = m.empresa_id and o.conta_id <> m.conta_id and o.valor_cents = -m.valor_cents
      and abs(o.data - m.data) <= 3 and o.status <> 'ignorado'
    order by abs(o.data - m.data)
    limit 1
  ) t on true
  where m.conta_id = p_conta and m.status = 'pendente'
    and m.data >= (select cf.saldo_inicial_data from contas_financeiras cf where cf.id = p_conta)
  order by m.data, m.id
  limit p_limite
$$;

create or replace function public.palpites_firmes(p_conta uuid)
returns table (movimento_id uuid, data date, descricao text, valor_cents bigint,
               categoria_id uuid, centro_custo_id uuid, contato_id uuid, vezes int)
language sql stable set search_path = public as $$
  select m.id, m.data, m.descricao, m.valor_cents, h.categoria_id, h.centro_custo_id, h.contato_id, h.vezes::int
  from movimentos_bancarios m
  cross join lateral (
    select (array_agg(x.categoria_id))[1] categoria_id, (array_agg(x.centro_custo_id))[1] centro_custo_id,
           (array_agg(x.contato_id))[1] contato_id, count(*) vezes, count(distinct x.categoria_id) categorias
    from app.historico_movimento(m) x
  ) h
  where m.conta_id = p_conta and m.status = 'pendente'
    and m.data >= (select cf.saldo_inicial_data from contas_financeiras cf where cf.id = p_conta)
    and h.vezes >= 2 and h.categorias = 1
    and exists (select 1 from categorias k where k.id = h.categoria_id and k.ativa
                and k.sentido = case when m.valor_cents > 0 then 'entrada' else 'saida' end)
    and not exists (select 1 from public.sugestoes_conciliacao(m.id))
    and app.ja_lancados(m) = '[]'::jsonb
  order by m.data, m.id
  limit 200
$$;

select app.travar_referencias();
