-- Cadastros no estilo NIBO: produtos e insumos, categorias, centros de custo, clientes e fornecedores
-- ganham módulo e permissão próprios, e setores, viveiros e lotes passam a ser editáveis e excluíveis
-- com as regras abaixo.

-- ---------------------------------------------------------------------------
-- 1. Permissões: chaves novas (produtos, categorias, centros-de-custo, contatos)
-- ---------------------------------------------------------------------------

create or replace function app.permissoes_perfil(p_perfil text) returns text[]
language sql immutable as $$
  select case p_perfil
    when 'visualizacao' then array['*.ver']
    when 'cadastros' then array['*.ver', 'piscicultura.editar', 'lotes.editar', 'estoque.editar', 'configuracoes.editar',
      'produtos.editar', 'contatos.editar', 'categorias.editar', 'centros-de-custo.editar']
    when 'apontador' then array['apontamentos.editar', 'sanidade.editar', 'piscicultura.ver', 'lotes.ver']
    when 'vendedor' then array['vendas.lancar', 'pdv.operar', 'estoque.ver', 'contas-a-receber.ver', 'cobrancas.ver',
      'contatos.editar', 'produtos.ver']
    when 'caixa' then array['pdv.operar', 'vendas.ver']
    when 'financeiro' then array['contas-a-pagar.editar', 'contas-a-receber.editar', 'contas.editar', 'cobrancas.emitir',
      'cartoes.editar', 'conciliacao.editar', 'fluxo-de-caixa.ver', 'relatorios.editar', 'financeiro.fechar', 'custo-do-kg.ver',
      'contatos.editar', 'categorias.editar', 'centros-de-custo.editar']
    else array[]::text[]
  end
$$;

do $$
declare
  r record;
  v_cond text;
begin
  for r in select * from (values
    ('contatos', array['contatos.editar', 'contas-a-pagar.editar', 'contas-a-receber.editar', 'vendas.lancar', 'pdv.operar',
                       'cobrancas.emitir', 'configuracoes.editar', 'estoque.editar', 'racao.editar']),
    ('categorias', array['categorias.editar', 'configuracoes.editar']),
    ('centros_custo', array['centros-de-custo.editar', 'configuracoes.editar']),
    ('produtos', array['produtos.editar', 'estoque.editar', 'racao.editar', 'vendas.precos'])
  ) t(tabela, perms)
  loop
    v_cond := format('app.pode_algum(empresa_id, %L::text[])', r.perms);
    execute format('drop policy if exists escrita_inserir on %I', r.tabela);
    execute format('drop policy if exists escrita_alterar on %I', r.tabela);
    execute format('drop policy if exists escrita_apagar on %I', r.tabela);
    execute format('create policy escrita_inserir on %I as restrictive for insert with check (%s)', r.tabela, v_cond);
    execute format('create policy escrita_alterar on %I as restrictive for update using (%s) with check (%s)', r.tabela, v_cond, v_cond);
    execute format('create policy escrita_apagar on %I as restrictive for delete using (%s)', r.tabela, v_cond);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Campos novos
-- ---------------------------------------------------------------------------

alter table contatos add column observacoes text;
alter table produtos
  add column estoque_minimo numeric(14,3) check (estoque_minimo is null or estoque_minimo >= 0),
  add column observacoes text,
  add column updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 3. Categorias do sistema: o faturamento procura "Venda de ovos" pelo nome
-- ---------------------------------------------------------------------------

update categorias set sistema = true where nome = 'Venda de ovos' and parent_id is null and sentido = 'entrada';

create or replace function app.marcar_categoria_sistema() returns trigger language plpgsql as $$
begin
  if new.nome = 'Venda de ovos' and new.parent_id is null and new.sentido = 'entrada' then
    new.sistema := true;
  end if;
  return new;
end $$;
create trigger marcar_categoria_sistema before insert on categorias
  for each row execute function app.marcar_categoria_sistema();

create or replace function app.protege_categoria_sistema() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.sistema then
      raise exception 'A categoria % é usada pelo sistema e não pode ser excluída', old.nome using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if old.sistema and (new.nome, new.parent_id, new.grupo, new.sentido, new.ativa, new.sistema)
                     is distinct from (old.nome, old.parent_id, old.grupo, old.sentido, old.ativa, old.sistema) then
    raise exception 'A categoria % é usada pelo sistema: só o código pode mudar', old.nome using errcode = 'check_violation';
  end if;
  -- subcategoria acompanha grupo e sentido do pai
  if new.parent_id is not null and new.parent_id is distinct from old.parent_id then
    if new.parent_id = new.id or exists (select 1 from categorias where id = new.parent_id and parent_id = new.id) then
      raise exception 'Uma categoria não pode ficar dentro dela mesma' using errcode = 'check_violation';
    end if;
    if exists (select 1 from categorias where parent_id = new.id) then
      raise exception 'Esta categoria tem subcategorias; ela não pode virar subcategoria' using errcode = 'check_violation';
    end if;
    select grupo, sentido into new.grupo, new.sentido from categorias where id = new.parent_id;
  end if;
  return new;
end $$;
create trigger protege_categoria_sistema before update or delete on categorias
  for each row execute function app.protege_categoria_sistema();

-- ---------------------------------------------------------------------------
-- 4. Produtos: produto com movimento não muda unidade, tipo ou conversão em ovos
-- ---------------------------------------------------------------------------

create or replace function app.protege_produto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.base_estoque then
      raise exception 'O produto % guarda o estoque de ovos da classe e não pode ser excluído', old.nome using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if (new.tipo, new.unidade, new.fator_kg, new.classe_peixe_id, new.base_estoque)
     is distinct from (old.tipo, old.unidade, old.fator_kg, old.classe_peixe_id, old.base_estoque)
     and not (new.base_estoque and not old.base_estoque)   -- produto_base_peixe adotando um produto de mesmo nome
     and (old.base_estoque
          or exists (select 1 from movimentos_estoque where produto_id = old.id)
          or exists (select 1 from pedido_itens where produto_id = old.id)
          or exists (select 1 from formula_itens where insumo_id = old.id)) then
    raise exception 'O produto % já tem movimento: tipo, unidade e conversão não podem mudar. Cadastre um produto novo.', old.nome
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger protege_produto before update or delete on produtos
  for each row execute function app.protege_produto();

-- ---------------------------------------------------------------------------
-- 5. Setores, viveiros e lotes: o centro de custo acompanha o nome e sai junto quando sobra
-- ---------------------------------------------------------------------------

create or replace function app.cc_renomear() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if new.centro_custo_id is null then return new; end if;
  if tg_table_name = 'setores' then
    v_nome := 'Setor ' || new.nome;
  elsif tg_table_name = 'viveiros' then
    select 'Viveiro ' || n.nome || ' / ' || new.nome into v_nome from setores n where n.id = new.setor_id;
  else
    v_nome := 'Lote ' || new.codigo;
  end if;
  update centros_custo set nome = v_nome, updated_at = now() where id = new.centro_custo_id and nome <> v_nome;
  -- renomear o setor renomeia os viveiros dele
  if tg_table_name = 'setores' then
    update centros_custo c set nome = 'Viveiro ' || new.nome || ' / ' || g.nome, updated_at = now()
    from viveiros g where g.setor_id = new.id and c.id = g.centro_custo_id;
  end if;
  return new;
end $$;
create trigger setor_cc_nome after update of nome on setores for each row execute function app.cc_renomear();
create trigger viveiro_cc_nome after update of nome, setor_id on viveiros for each row execute function app.cc_renomear();
create trigger lote_cc_nome after update of codigo on lotes for each row execute function app.cc_renomear();

create or replace function app.cc_remover_orfao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.centro_custo_id is not null
     and not exists (select 1 from agendamento_rateios where centro_custo_id = old.centro_custo_id)
     and not exists (select 1 from centros_custo where parent_id = old.centro_custo_id) then
    delete from centros_custo where id = old.centro_custo_id;
  end if;
  return old;
end $$;
create trigger setor_cc_sai after delete on setores for each row execute function app.cc_remover_orfao();
create trigger viveiro_cc_sai after delete on viveiros for each row execute function app.cc_remover_orfao();
create trigger lote_cc_sai after delete on lotes for each row execute function app.cc_remover_orfao();

-- Lote com histórico não some: apontamentos, sanidade e estoque iriam junto
create or replace function app.lote_sem_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from apontamentos_diarios where lote_id = old.id)
     or exists (select 1 from eventos_sanitarios where lote_id = old.id)
     or exists (select 1 from movimentos_estoque where lote_id = old.id) then
    raise exception 'O lote % já tem apontamentos ou movimentos e não pode ser excluído. Mude a fase para descartado.', old.codigo
      using errcode = 'check_violation';
  end if;
  return old;
end $$;
create trigger lote_sem_historico before delete on lotes for each row execute function app.lote_sem_historico();

-- Editar lote. Data de povoamento e quantidade só mudam enquanto o lote está na alocação original.
create or replace function public.editar_lote(
  p_lote uuid,
  p_codigo text,
  p_especie uuid,
  p_nascimento date,
  p_povoamento date,
  p_qtd int,
  p_custo_cents bigint,
  p_fase text,
  p_fornecedor uuid default null,
  p_previsao_despesca date default null,
  p_observacoes text default null
) returns void
language plpgsql set search_path = public as $$
declare
  v_lote lotes%rowtype;
  v_aloc lote_alocacoes%rowtype;
  v_n int;
  v_cap int;
begin
  select * into v_lote from lotes where id = p_lote;
  if not found then raise exception 'Lote não encontrado' using errcode = 'no_data_found'; end if;
  if nullif(trim(p_codigo), '') is null then raise exception 'Informe o código do lote' using errcode = 'check_violation'; end if;
  if p_qtd is null or p_qtd <= 0 then raise exception 'Informe a quantidade de peixes' using errcode = 'check_violation'; end if;
  if not exists (select 1 from especies where id = p_especie and (empresa_id is null or empresa_id = v_lote.empresa_id)) then
    raise exception 'Espécie não encontrada' using errcode = 'foreign_key_violation';
  end if;

  if p_povoamento is distinct from v_lote.data_povoamento or p_qtd is distinct from v_lote.qtd_povoada then
    select count(*) into v_n from lote_alocacoes where lote_id = p_lote;
    if v_n <> 1 then
      raise exception 'O lote já foi transferido ou dividido: data de povoamento e quantidade não podem mais mudar aqui'
        using errcode = 'check_violation';
    end if;
    select * into v_aloc from lote_alocacoes where lote_id = p_lote;
    if exists (select 1 from apontamentos_diarios where lote_id = p_lote and data < p_povoamento) then
      raise exception 'Há apontamentos antes da nova data de povoamento' using errcode = 'check_violation';
    end if;
    select capacidade_peixes into v_cap from viveiros where id = v_aloc.viveiro_id;
    if p_qtd > v_cap then
      raise exception 'O viveiro comporta % peixes', v_cap using errcode = 'check_violation';
    end if;
    update lote_alocacoes set qtd_peixes = p_qtd, periodo = daterange(p_povoamento, upper(v_aloc.periodo))
    where id = v_aloc.id;
  end if;

  update lotes set
    codigo = trim(p_codigo), especie_id = p_especie, data_nascimento = p_nascimento, data_povoamento = p_povoamento,
    qtd_povoada = p_qtd, custo_aquisicao_cents = coalesce(p_custo_cents, 0), fase = p_fase, fornecedor_id = p_fornecedor,
    previsao_despesca = p_previsao_despesca, observacoes = nullif(trim(p_observacoes), ''),
    inicio_producao = case when p_fase = 'producao' and inicio_producao is null then p_povoamento else inicio_producao end,
    updated_at = now()
  where id = p_lote;
  if not found then
    raise exception 'Seu usuário não tem permissão para editar lotes' using errcode = 'insufficient_privilege';
  end if;

  if v_aloc.id is not null then
    perform app.recalcular_peixes(p_lote, v_aloc.viveiro_id, least(p_povoamento, v_lote.data_povoamento));
  end if;
end $$;

revoke all on function public.editar_lote(uuid, text, uuid, date, date, int, bigint, text, uuid, date, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.editar_lote(uuid, text, uuid, date, date, int, bigint, text, uuid, date, text) to authenticated;
  end if;
end $$;
