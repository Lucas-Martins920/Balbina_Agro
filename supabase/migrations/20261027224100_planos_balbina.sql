-- Quatro planos do Balbina, cada um com os módulos que libera:
--   Basic   produção, estoque, ração e insumos, clientes/fornecedores e produtos
--   Vendas  + financeiro e comercial (vendas e PDV), sem cobrança/boletos e notas fiscais
--   Fiscal  + cobrança (boleto/Pix pelo Asaas) e notas fiscais
--   Gestão  tudo: + conciliação, planejamento e custo do kg
-- A trava fica em app.pode(): a chave "<modulo>.<ação>" só vale se o plano da empresa inclui o módulo,
-- então as policies de escrita e as RPCs param juntas. Teste grátis e empresa sem plano usam o Gestão.
-- Para mudar o que cada plano libera, edite niveis_plano.modulos (o app lê de lá).

create table niveis_plano (
  id text primary key,
  nome text not null,
  descricao text,
  ordem int not null,
  -- prefixos das chaves de permissão liberados; '*' libera todos
  modulos text[] not null
);

insert into niveis_plano (id, nome, descricao, ordem, modulos) values
  ('basic', 'Balbina Basic', 'Produção, estoque, ração e insumos e cadastro de fornecedores.', 1,
   array['piscicultura', 'lotes', 'apontamentos', 'sanidade', 'estoque', 'racao', 'contatos', 'produtos', 'configuracoes']),
  ('vendas', 'Balbina Vendas', 'Tudo do Basic, mais financeiro e comercial (vendas e PDV). Sem cobrança por boleto e sem nota fiscal.', 2,
   array['piscicultura', 'lotes', 'apontamentos', 'sanidade', 'estoque', 'racao', 'contatos', 'produtos', 'configuracoes',
         'contas-a-pagar', 'contas-a-receber', 'contas', 'cartoes', 'fluxo-de-caixa', 'relatorios', 'orcamento', 'financeiro',
         'categorias', 'centros-de-custo', 'vendas', 'pdv']),
  ('fiscal', 'Balbina Fiscal', 'Tudo do Vendas, mais cobrança por boleto e Pix e notas fiscais.', 3,
   array['piscicultura', 'lotes', 'apontamentos', 'sanidade', 'estoque', 'racao', 'contatos', 'produtos', 'configuracoes',
         'contas-a-pagar', 'contas-a-receber', 'contas', 'cartoes', 'fluxo-de-caixa', 'relatorios', 'orcamento', 'financeiro',
         'categorias', 'centros-de-custo', 'vendas', 'pdv', 'cobrancas', 'notas']),
  ('gestao', 'Balbina Gestão', 'Todas as funcionalidades: conciliação bancária, planejamento de lotes e custo do kg.', 4, array['*']);

alter table niveis_plano enable row level security;
create policy leitura on niveis_plano for select to authenticated using (true);
revoke insert, update, delete on niveis_plano from anon, authenticated;

alter table planos add column nivel text references niveis_plano(id);

-- Os dois planos antigos davam acesso a tudo: viram Gestão e saem da vitrine (quem já assinou continua neles).
update planos set nivel = 'gestao', ativo = false, nome = 'Balbina Gestão (antigo ' || nome || ')', ordem = 99;

-- Preços provisórios: ajuste em Table Editor > planos antes de vender.
insert into planos (id, nome, descricao, valor_cents, ciclo, ordem, nivel) values
  ('basic-mensal',  'Balbina Basic',  null, 14900,  'mensal', 1, 'basic'),
  ('basic-anual',   'Balbina Basic',  null, 149000, 'anual',  2, 'basic'),
  ('vendas-mensal', 'Balbina Vendas', null, 24900,  'mensal', 3, 'vendas'),
  ('vendas-anual',  'Balbina Vendas', null, 249000, 'anual',  4, 'vendas'),
  ('fiscal-mensal', 'Balbina Fiscal', null, 34900,  'mensal', 5, 'fiscal'),
  ('fiscal-anual',  'Balbina Fiscal', null, 349000, 'anual',  6, 'fiscal'),
  ('gestao-mensal', 'Balbina Gestão', null, 44900,  'mensal', 7, 'gestao'),
  ('gestao-anual',  'Balbina Gestão', null, 449000, 'anual',  8, 'gestao');

alter table planos alter column nivel set not null;

-- Nível que vale hoje: o do plano assinado. No teste grátis, ou sem plano escolhido (cortesia antiga), vale o Gestão.
create or replace function app.nivel_empresa(p_empresa uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when a.plano_id is null or coalesce(a.teste_ate >= app.hoje_brasil(), false) then 'gestao' else p.nivel end
    from assinaturas a left join planos p on p.id = a.plano_id
    where a.empresa_id = p_empresa), 'gestao')
$$;

create or replace function app.plano_inclui(p_empresa uuid, p_modulo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from niveis_plano n
                 where n.id = app.nivel_empresa(p_empresa) and ('*' = any(n.modulos) or p_modulo = any(n.modulos)))
$$;

create or replace function app.pode(p_empresa uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select app.mfa_em_dia() and app.empresa_liberada(p_empresa) and app.plano_inclui(p_empresa, split_part(p_perm, '.', 1)) and exists (
    select 1 from usuarios_empresa u
    where u.empresa_id = p_empresa and u.user_id = auth.uid() and u.ativo
      and (u.is_admin or u.perfil = 'sem_restricao' or exists (
        select 1 from unnest(app.permissoes_perfil(u.perfil) || u.permissoes) c
        where c = p_perm
           or (p_perm like '%.ver' and (c = '*.ver' or split_part(c, '.', 1) = split_part(p_perm, '.', 1)))))
  )
$$;

-- A nota fiscal é gravada por quem lança vendas, então a chave sozinha não basta: exige o módulo notas no plano.
do $$
declare
  v_cond text := 'app.plano_inclui(empresa_id, ''notas'')';
begin
  execute format('create policy plano_inserir on notas_fiscais as restrictive for insert with check (%s)', v_cond);
  execute format('create policy plano_alterar on notas_fiscais as restrictive for update using (%s) with check (%s)', v_cond, v_cond);
  execute format('create policy plano_apagar on notas_fiscais as restrictive for delete using (%s)', v_cond);
end $$;

-- O app usa o plano para montar o menu e explicar o que falta. modulos null = todos.
create or replace function public.minhas_permissoes(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'master', u.is_admin,
    'perfil', u.perfil,
    'total', u.is_admin or u.perfil = 'sem_restricao',
    'chaves', to_jsonb(app.permissoes_perfil(u.perfil) || u.permissoes),
    'nivel', n.id,
    'nome_plano', n.nome,
    'modulos', case when '*' = any(n.modulos) then null else to_jsonb(n.modulos) end)
  from usuarios_empresa u
  left join niveis_plano n on n.id = app.nivel_empresa(p_empresa)
  where u.empresa_id = p_empresa and u.user_id = auth.uid() and u.ativo
$$;

create or replace function minha_assinatura(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', a.status,
    'liberada', app.assinatura_libera(a.status, a.teste_ate, a.pago_ate),
    'teste_ate', a.teste_ate,
    'pago_ate', a.pago_ate,
    'plano_id', a.plano_id,
    'nivel', app.nivel_empresa(a.empresa_id),
    'fatura_url', a.fatura_url,
    'tem_assinatura', a.asaas_assinatura_id is not null)
  from assinaturas a
  where a.empresa_id = p_empresa and p_empresa in (select app.empresas_vinculadas())
$$;
