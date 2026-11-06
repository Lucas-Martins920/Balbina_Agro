-- O módulo de Manutenções saiu do sistema (pedido do Nicolas, 2026-11-02): nada no banco leva mais a /manutencao.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

select pg_temp.ok(pg_get_viewdef('public.alertas'::regclass) !~ '(manutenc|equipament)', 'alertas do painel sem manutenção');

select pg_temp.ok(pg_get_functiondef('public.meu_login_local()'::regprocedure) !~ 'manutenc',
  'login local não manda ninguém para o checklist de manutenção');

select pg_temp.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('equipamentos', 'planos_manutencao', 'manutencoes', 'agenda_manutencao',
    'equipamentos_situacao', 'problemas_manutencao')), 'tabelas e views da manutenção apagadas');

select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and p.proname in ('registrar_manutencao', 'registrar_checklist', 'salvar_equipamento',
    'situacao_equipamento', 'centro_custo_equipamento', 'nome_local', 'equipamento_conferir', 'plano_manutencao_conferir',
    'manutencao_conferir', 'manutencao_aplicar')), 'funções da manutenção apagadas');

-- "Manutenção de viveiros e equipamentos" continua como categoria financeira do plano padrão (app.plano_categorias).
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and p.proname not like 'plano_categorias%'
    and p.prosrc ~ '(equipament|manutencoes|planos_manutencao|manutencao\.)'),
  'nenhuma função cita a manutenção: ' || coalesce((select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app') and p.proname not like 'plano_categorias%'
      and p.prosrc ~ '(equipament|manutencoes|planos_manutencao|manutencao\.)'), ''));

select pg_temp.ok('manutencao' = any (app.perfis_validos()) and app.permissoes_perfil('manutencao') @> array['piscicultura.ver', 'estoque.ver', 'produtos.ver'],
  'cargo pronto "Manutenção geral" fica, vendo piscicultura, estoque e produtos');

select pg_temp.ok(not exists (select 1 from unnest(app.perfis_validos()) perfil, unnest(app.permissoes_perfil(perfil)) chave
  where chave like 'manutencao.%'), 'nenhum perfil tem permissão de manutenção');

select pg_temp.ok(not exists (select 1 from niveis_plano where 'manutencao' = any (modulos)), 'nenhum plano tem o módulo');

\o
\echo 'TESTES DA REMOÇÃO DA MANUTENÇÃO PASSARAM'
