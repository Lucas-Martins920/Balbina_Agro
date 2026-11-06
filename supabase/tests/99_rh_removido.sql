-- O módulo RH e o cartão de ponto saíram do sistema (2026-11-02): nada de tabela, função, coluna ou permissão sobra.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

select pg_temp.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('funcionarios', 'funcionario_atribuicoes', 'escalas', 'rh_ocorrencias', 'feriados',
    'rh_parametros', 'ponto_importacoes', 'ponto_marcacoes')), 'tabelas do RH apagadas');

select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and p.proname in ('importar_ponto', 'importar_ponto_coletado', 'gravar_ponto',
    'bater_ponto_celular', 'meu_ponto_hoje', 'posso_bater_ponto', 'meu_funcionario', 'usuario_cargo_no_funcionario',
    'escala_conferir', 'funcionario_conferir', 'ocorrencia_conferir', 'marcacao_proteger')), 'funções do RH apagadas');

select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app')
    and p.prosrc ~ '(funcionarios|ponto_marcacoes|ponto_importacoes|rh_ocorrencias|rh_parametros|fechamento_ponto|ponto_token|rh\.)'),
  'nenhuma função cita o RH: ' || coalesce((select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app')
      and p.prosrc ~ '(funcionarios|ponto_marcacoes|ponto_importacoes|rh_ocorrencias|rh_parametros|fechamento_ponto|ponto_token|rh\.)'), ''));

select pg_temp.ok(not exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'automacoes_empresa' and column_name ~ 'ponto'), 'automações sem colunas de ponto');

select pg_temp.ok(not exists (select 1 from unnest(array['visualizacao', 'cadastros', 'apontador', 'vendedor', 'caixa', 'financeiro',
  'administrativo', 'gerente_piscicultura', 'tratador', 'fabrica_racao', 'manutencao']) perfil, unnest(app.permissoes_perfil(perfil)) chave
  where chave like 'rh.%'), 'nenhum perfil tem permissão de RH');

\o
\echo 'TESTES DA REMOÇÃO DO RH PASSARAM'
