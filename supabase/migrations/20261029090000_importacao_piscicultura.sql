-- Planilha modelo, parte da piscicultura: viveiros (com o setor), lotes já povoados e o estoque inicial.
-- É o que uma piscicultura nova precisa para começar no Balbina; lançamentos antigos ficam opcionais.
--
-- public.importar_piscicultura(empresa, pacote) recebe:
--   viveiros: [{setor, nome, finalidade, sistema, capacidade, aeracao}]
--   lotes:   [{codigo, espécie, cor_ovo, nascimento, povoamento, setor, viveiro, qtd, custo_cents, fornecedor}]
--   estoque: [{produto, quantidade, data, custo_cents}]
-- Roda depois de importar_pacote (que cria produtos e fornecedores). Pode rodar de novo:
--   viveiro casa por setor + nome e é atualizado; lote casa pelo código e não é povoado de novo;
--   estoque é ajuste de saldo (o saldo do produto passa a ser a quantidade da planilha).
-- Uma linha com problema (viveiro cheio, viveiro já ocupado na data…) vira aviso e as outras seguem.

create or replace function public.importar_piscicultura(p_empresa uuid, p_pacote jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_setor uuid;
  v_viveiro uuid;
  v_especie uuid;
  v_fornecedor uuid;
  v_produto produtos%rowtype;
  v_qtd numeric;
  v_avisos text[] := '{}';
  n_setor int := 0; n_viveiro int := 0; n_viveiro_atual int := 0; n_lote int := 0; n_lote_existente int := 0;
  n_especie int := 0; n_estoque int := 0;
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o usuário master da empresa pode importar dados' using errcode = 'insufficient_privilege';
  end if;

  for r in select e from jsonb_array_elements(coalesce(p_pacote->'viveiros', '[]')) e loop
    continue when nullif(trim(r->>'nome'), '') is null or nullif(trim(r->>'setor'), '') is null;
    begin
      select id into v_setor from setores where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'setor') limit 1;
      if v_setor is null then
        insert into setores (empresa_id, nome) values (p_empresa, trim(r->>'setor')) returning id into v_setor;
        n_setor := n_setor + 1;
      end if;
      select id into v_viveiro from viveiros where setor_id = v_setor and app.nome_chave(nome) = app.nome_chave(r->>'nome') limit 1;
      if v_viveiro is null then
        insert into viveiros (empresa_id, setor_id, nome, finalidade, sistema, capacidade_peixes, aeracao)
        values (p_empresa, v_setor, trim(r->>'nome'), r->>'finalidade', coalesce(nullif(r->>'sistema', ''), 'gaiola'),
                (r->>'capacidade')::int, coalesce((r->>'aeracao')::boolean, false));
        n_viveiro := n_viveiro + 1;
      else
        -- finalidade só muda enquanto o viveiro nunca recebeu lote (ela decide a fase do lote povoado)
        update viveiros g set
          capacidade_peixes = (r->>'capacidade')::int,
          sistema = coalesce(nullif(r->>'sistema', ''), g.sistema),
          aeracao = coalesce((r->>'aeracao')::boolean, g.aeracao),
          finalidade = case when exists (select 1 from lote_alocacoes a where a.viveiro_id = g.id) then g.finalidade else r->>'finalidade' end
        where id = v_viveiro;
        n_viveiro_atual := n_viveiro_atual + 1;
      end if;
    exception when others then
      v_avisos := v_avisos || format('Viveiro "%s" (%s) não entrou: %s', r->>'nome', r->>'setor', sqlerrm);
    end;
  end loop;

  for r in select e from jsonb_array_elements(coalesce(p_pacote->'lotes', '[]')) e loop
    continue when nullif(trim(r->>'codigo'), '') is null;
    if exists (select 1 from lotes where empresa_id = p_empresa and lower(codigo) = lower(trim(r->>'codigo'))) then
      n_lote_existente := n_lote_existente + 1;
      continue;
    end if;
    begin
      select id into v_especie from especies
       where (empresa_id is null or empresa_id = p_empresa) and app.nome_chave(nome) = app.nome_chave(r->>'especie')
       order by empresa_id nulls last limit 1;
      if v_especie is null then
        insert into especies (empresa_id, nome, cor_ovo)
        values (p_empresa, trim(r->>'especie'), case when r->>'cor_ovo' = 'vermelho' then 'vermelho' else 'branco' end)
        returning id into v_especie;
        n_especie := n_especie + 1;
      end if;
      select g.id into v_viveiro from viveiros g join setores n on n.id = g.setor_id
       where g.empresa_id = p_empresa and app.nome_chave(g.nome) = app.nome_chave(r->>'viveiro')
         and (nullif(trim(r->>'setor'), '') is null or app.nome_chave(n.nome) = app.nome_chave(r->>'setor'))
       order by g.ativo desc limit 1;
      if v_viveiro is null then
        raise exception 'viveiro "%" não encontrado', r->>'viveiro';
      end if;
      v_fornecedor := null;
      if nullif(trim(r->>'fornecedor'), '') is not null then
        select id into v_fornecedor from contatos where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'fornecedor')
         order by 'fornecedor' = any(tipos) desc, arquivado limit 1;
        if v_fornecedor is null then
          insert into contatos (empresa_id, tipos, nome) values (p_empresa, array['fornecedor'], trim(r->>'fornecedor'))
          returning id into v_fornecedor;
        end if;
      end if;
      perform povoar_lote(p_empresa, trim(r->>'codigo'), v_especie, (r->>'nascimento')::date, (r->>'povoamento')::date,
                          v_viveiro, (r->>'qtd')::int, coalesce((r->>'custo_cents')::bigint, 0), v_fornecedor);
      n_lote := n_lote + 1;
    exception when others then
      v_avisos := v_avisos || format('Lote "%s" não entrou: %s', r->>'codigo', sqlerrm);
    end;
  end loop;

  for r in select e from jsonb_array_elements(coalesce(p_pacote->'estoque', '[]')) e loop
    continue when nullif(trim(r->>'produto'), '') is null;
    begin
      select * into v_produto from produtos where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'produto')
       order by ativo desc limit 1;
      if not found then
        raise exception 'produto não cadastrado (inclua na aba Produtos)';
      end if;
      v_qtd := (r->>'quantidade')::numeric;
      -- custo informado vira o custo médio do saldo inicial (ovo não tem custo médio próprio)
      if v_produto.tipo <> 'ovo' and coalesce((r->>'custo_cents')::bigint, 0) > 0 and v_qtd > 0 then
        update produtos set custo_medio_cents = (r->>'custo_cents')::numeric / v_qtd where id = v_produto.id;
      end if;
      perform movimentar_estoque(v_produto.id, 'ajuste', v_qtd, null, coalesce((r->>'data')::date, current_date),
                                 null, null, null, 'Estoque inicial (planilha)');
      n_estoque := n_estoque + 1;
    exception when others then
      v_avisos := v_avisos || format('Estoque de "%s" não entrou: %s', r->>'produto', sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'setores', n_setor, 'viveiros', n_viveiro, 'viveiros_atualizados', n_viveiro_atual, 'especies', n_especie,
    'lotes', n_lote, 'lotes_existentes', n_lote_existente, 'estoque', n_estoque,
    'avisos', to_jsonb(v_avisos[1:50]), 'total_avisos', cardinality(v_avisos));
end $$;

revoke all on function public.importar_piscicultura(uuid, jsonb) from public;
grant execute on function public.importar_piscicultura(uuid, jsonb) to authenticated;
