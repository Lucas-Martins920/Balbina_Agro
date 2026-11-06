-- Permissão de escrita em títulos (contas a pagar/receber), baixas e rateios.
--
-- Antes, quem tinha ração, estoque ou lotes (pagar) ou vendas/PDV (receber) podia alterar e apagar
-- qualquer título pela API, porque esses módulos geram contas. Com os cargos de campo (fábrica de
-- ração, gerente da piscicultura, caixa) isso virou brecha: o fabricante de ração mudava a conta de energia.
--
-- Agora:
--  - contas a pagar/receber, conciliação e cartões (só pagar) mexem em qualquer título do tipo;
--  - os módulos só mexem no título que a própria pessoa lançou (created_by) ou que nasceu do módulo
--    (compra e frete de transferência para ração/estoque/lotes; pedido de venda e caixa para vendas/PDV);
--  - a pessoa não consegue se pôr como autora de um título que não lançou.
-- Manutenção: quem só lança apaga e altera só o que lançou; editar continua mexendo em tudo.

create or replace function app.pode_titulo_linha(p_empresa uuid, p_tipo text, p_origem text, p_autor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_tipo
    when 'pagar' then
      app.pode_algum(p_empresa, array['contas-a-pagar.editar', 'conciliacao.editar', 'cartoes.editar'])
      or (app.pode_algum(p_empresa, array['racao.editar', 'estoque.editar', 'lotes.editar'])
          and (p_autor = auth.uid() or p_origem in ('compra', 'transferencia_peixe')))
    when 'receber' then
      app.pode_algum(p_empresa, array['contas-a-receber.editar', 'conciliacao.editar'])
      or (app.pode_algum(p_empresa, array['vendas.lancar', 'pdv.operar'])
          and (p_autor = auth.uid() or p_origem in ('pedido_venda', 'caixa_entrada')))
    else false
  end
$$;

-- Vale para as ações em lote (baixar, estornar, reprogramar...) e para baixas e rateios.
create or replace function app.pode_titulo(p_agendamento uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select app.pode_titulo_linha(empresa_id, tipo, origem, created_by) from agendamentos where id = p_agendamento), false)
$$;

drop policy escrita_inserir on agendamentos;
drop policy escrita_alterar on agendamentos;
drop policy escrita_apagar on agendamentos;
create policy escrita_inserir on agendamentos as restrictive for insert
  with check (app.pode_titulo_linha(empresa_id, tipo, origem, created_by));
create policy escrita_alterar on agendamentos as restrictive for update
  using (app.pode_titulo_linha(empresa_id, tipo, origem, created_by))
  with check (app.pode_titulo_linha(empresa_id, tipo, origem, created_by));
create policy escrita_apagar on agendamentos as restrictive for delete
  using (app.pode_titulo_linha(empresa_id, tipo, origem, created_by));

-- Quem não tem a permissão do financeiro não troca o autor do título para virar dono dele.
create or replace function app.titulo_autor_fixo() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.created_by is distinct from old.created_by
     and not app.pode_algum(new.empresa_id, case new.tipo
       when 'pagar' then array['contas-a-pagar.editar', 'conciliacao.editar', 'cartoes.editar']
       else array['contas-a-receber.editar', 'conciliacao.editar'] end) then
    raise exception 'Só o financeiro muda quem lançou o título.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists titulo_autor_fixo on agendamentos;
create trigger titulo_autor_fixo before update of created_by on agendamentos
  for each row when (auth.uid() is not null) execute function app.titulo_autor_fixo();

-- Manutenção: lançar mexe só no que a pessoa lançou.
drop policy escrita_alterar on manutencoes;
drop policy escrita_apagar on manutencoes;
create policy escrita_alterar on manutencoes as restrictive for update
  using (app.pode(empresa_id, 'manutencao.editar') or (created_by = auth.uid() and app.pode(empresa_id, 'manutencao.lancar')))
  with check (app.pode(empresa_id, 'manutencao.editar') or (created_by = auth.uid() and app.pode(empresa_id, 'manutencao.lancar')));
create policy escrita_apagar on manutencoes as restrictive for delete
  using (app.pode(empresa_id, 'manutencao.editar') or (created_by = auth.uid() and app.pode(empresa_id, 'manutencao.lancar')));

-- Funções de hoje que só tiravam o acesso de public: o Supabase dá execute a anon por padrão.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.salvar_cargo(uuid, uuid, text, text, text[]) from anon;
    revoke execute on function public.apagar_cargo(uuid) from anon;
    revoke execute on function public.receber_compra_do_grupo(uuid, uuid, uuid) from anon;
    revoke execute on function public.desfazer_compra_do_grupo(uuid) from anon;
  end if;
end $$;

revoke all on function app.pode_titulo_linha(uuid, text, text, uuid) from public;
revoke all on function app.titulo_autor_fixo() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function app.pode_titulo_linha(uuid, text, text, uuid) to authenticated;
  end if;
end $$;

select app.travar_referencias();
