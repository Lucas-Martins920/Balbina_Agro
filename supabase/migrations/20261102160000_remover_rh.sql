-- Apaga do banco o módulo RH e cartão de ponto (pedido do Nicolas em 2026-11-02, card "Apagar depois por migration").
-- A interface saiu no PR #211; aqui saem as tabelas, os dados delas, as funções, os triggers, as colunas de ponto das
-- automações e as permissões rh.* dos cargos e usuários. DESTRUTIVO: funcionários, escalas, folgas, feriados e batidas
-- de ponto somem. O backup diário cifrado de antes do consolidado guarda a última cópia.

-- 1. Funções que citam as tabelas do RH (plpgsql resolve na hora de rodar; sem isto quebrariam depois do drop).
CREATE OR REPLACE FUNCTION app.permissoes_perfil(p_perfil text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_perfil
    when 'visualizacao' then array['*.ver']
    when 'cadastros' then array['*.ver', 'piscicultura.editar', 'lotes.editar', 'estoque.editar', 'configuracoes.editar',
      'produtos.editar', 'contatos.editar', 'categorias.editar', 'centros-de-custo.editar', 'planejamento.editar', 'manutencao.editar']
    when 'apontador' then array['apontamentos.editar', 'sanidade.editar', 'piscicultura.ver', 'lotes.ver', 'manutencao.lancar']
    when 'vendedor' then array['vendas.lancar', 'pdv.operar', 'estoque.ver', 'contas-a-receber.ver', 'cobrancas.ver',
      'contatos.editar', 'produtos.ver']
    when 'caixa' then array['pdv.operar', 'vendas.ver']
    when 'financeiro' then array['contas-a-pagar.editar', 'contas-a-receber.editar', 'contas.editar', 'cobrancas.emitir',
      'cartoes.editar', 'conciliacao.editar', 'fluxo-de-caixa.ver', 'relatorios.editar', 'financeiro.fechar', 'custo-do-kg.ver',
      'contatos.editar', 'categorias.editar', 'centros-de-custo.editar', 'planejamento.editar']
    -- Escritório: vê tudo, cuida dos cadastros, das contas a pagar e receber, dos pedidos e das notas.
    when 'administrativo' then array['*.ver', 'contatos.editar', 'produtos.editar', 'categorias.editar', 'centros-de-custo.editar',
      'contas-a-pagar.editar', 'contas-a-receber.editar', 'vendas.lancar', 'notas.editar', 'configuracoes.editar']
    -- Operação de campo inteira.
    when 'gerente_piscicultura' then array['piscicultura.editar', 'lotes.editar', 'apontamentos.editar', 'sanidade.editar', 'estoque.editar',
      'racao.editar', 'manutencao.editar', 'manutencao.lancar', 'planejamento.editar', 'custo-do-kg.ver', 'produtos.ver', 'contatos.ver']
    when 'tratador' then array['apontamentos.editar', 'piscicultura.ver', 'lotes.ver', 'sanidade.ver', 'manutencao.lancar']
    when 'fabrica_racao' then array['racao.editar', 'produtos.ver', 'estoque.ver', 'manutencao.lancar']
    when 'manutencao' then array['manutencao.editar', 'manutencao.lancar', 'piscicultura.ver', 'estoque.ver', 'produtos.ver']
    else array[]::text[]
  end
$function$;

CREATE OR REPLACE FUNCTION app.tabelas_sem_historico()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array['audit_log', 'custos_lote_mensal', 'importacao_vinculos', 'contas_asaas_segredos',
               'sessoes_2fa', 'dispositivos_confiaveis', 'webhook_eventos', 'aceites_termos',
               'api_chaves_uso', 'api_webhook_entregas', 'focus_emitentes_segredos']
$function$;

CREATE OR REPLACE FUNCTION public.apagar_cargo(p_cargo uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa uuid;
  v_em_uso int;
begin
  select empresa_id into v_empresa from cargos where id = p_cargo;
  if v_empresa is null then raise exception 'Cargo não encontrado' using errcode = 'no_data_found'; end if;
  perform app.exige_master(v_empresa);
  select (select count(*) from usuarios_empresa where cargo_id = p_cargo) + (select count(*) from convites where cargo_id = p_cargo)
    into v_em_uso;
  if v_em_uso > 0 then
    raise exception 'Este cargo está com % usuário(s) ou convite(s). Troque o cargo deles antes de apagar.', v_em_uso
      using errcode = 'foreign_key_violation';
  end if;
  delete from cargos where id = p_cargo;
end $function$;

CREATE OR REPLACE FUNCTION public.avisos_mensais_devidos()
 RETURNS TABLE(empresa_id uuid, tipo text, mes text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_hoje date;
  v_mes date;
begin
  for r in select a.*, e.fuso from automacoes_empresa a join empresas e on e.id = a.empresa_id
           where a.pacote_contador and app.empresa_liberada(a.empresa_id) loop
    v_hoje := (now() at time zone r.fuso)::date;
    v_mes := (date_trunc('month', v_hoje) - interval '1 month')::date;
    if r.pacote_contador and extract(day from v_hoje) >= r.pacote_contador_dia
       and app.marcar_aviso(r.empresa_id, 'pacote_contador', v_mes) then
      empresa_id := r.empresa_id; tipo := 'pacote_contador'; mes := to_char(v_mes, 'YYYY-MM');
      return next;
    end if;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.zerar_sistema(p_empresa uuid, p_confirmacao text, p_frase text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp empresas%rowtype;
  v_digitado text := lower(regexp_replace(btrim(coalesce(p_confirmacao, '')), '\s+', ' ', 'g'));
  v_frase text := upper(regexp_replace(btrim(coalesce(p_frase, '')), '\s+', ' ', 'g'));
  v jsonb := '{}';
  v_fin jsonb;
  n bigint;
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o master da empresa pode zerar o sistema' using errcode = 'insufficient_privilege';
  end if;
  if not app.mfa_recente(5) then
    raise exception 'Confirme com o código do autenticador antes de zerar o sistema' using errcode = 'insufficient_privilege';
  end if;
  -- trava a empresa: duas execuções ao mesmo tempo esperam uma pela outra
  select * into v_emp from empresas where id = p_empresa for update;
  if v_digitado = '' or v_digitado not in (
      lower(regexp_replace(btrim(v_emp.razao_social), '\s+', ' ', 'g')),
      lower(regexp_replace(btrim(coalesce(v_emp.nome_fantasia, '')), '\s+', ' ', 'g'))) then
    raise exception 'Digite o nome da empresa para confirmar' using errcode = 'check_violation';
  end if;
  if v_frase <> 'ZERAR TUDO' then
    raise exception 'Digite ZERAR TUDO para confirmar' using errcode = 'check_violation';
  end if;

  perform set_config('app.zerando_sistema', p_empresa::text, true);

  -- 1. Financeiro: a mesma rotina do "Zerar financeiro" (confere master, código e nome de novo).
  v_fin := public.zerar_financeiro(p_empresa, p_confirmacao);
  v := v || jsonb_build_object('titulos', v_fin->'titulos', 'baixas', v_fin->'baixas',
                               'transferencias', v_fin->'transferencias', 'movimentos_extrato', v_fin->'movimentos_extrato');

  -- 2. Fiscal e comercial. Notas antes dos pedidos; itens saem junto com o pedido e a transferência.
  delete from notas_fiscais where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('notas_fiscais', n);
  delete from inutilizacoes_nfe where empresa_id = p_empresa;
  delete from nfes_recebidas where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('notas_recebidas', n);
  delete from pedidos_fixos_gerados where empresa_id = p_empresa;
  delete from compras_grupo where empresa_id = p_empresa;
  delete from pedidos_venda where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('pedidos', n);
  delete from transferencias_peixe where empresa_id = p_empresa;

  -- 3. Estoque primeiro: com os movimentos fora, desfazer apontamento e classificação não tem o que estornar.
  delete from movimentos_estoque where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('movimentos_estoque', n);
  delete from ordens_producao_racao where empresa_id = p_empresa;
  update produtos set custo_medio_cents = 0, updated_at = now() where empresa_id = p_empresa and custo_medio_cents <> 0;

  -- 4. Produção. O lote leva alocações, transferências, custos mensais e lixeira; o trigger tira o centro de
  --    custo automático dele. Lotes planejados ficam, desligados do lote.
  delete from despescas where empresa_id = p_empresa;
  delete from eventos_sanitarios where empresa_id = p_empresa;
  delete from apontamentos_diarios where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('apontamentos', n);
  delete from apontamentos_lixeira where empresa_id = p_empresa;
  delete from lotes where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('lotes', n);

  -- 5. Manutenção.
  delete from manutencoes where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('manutencoes', n);

  -- 6. Documentos, avisos e restos de importação.
  delete from documentos where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('documentos', n);
  delete from documentos_recebidos where empresa_id = p_empresa;
  delete from lembretes_enviados where empresa_id = p_empresa;
  delete from sugestoes_dispensadas where empresa_id = p_empresa;
  delete from api_webhook_entregas where empresa_id = p_empresa;
  delete from auditorias_importacao where empresa_id = p_empresa;
  -- reimportar volta a criar os movimentos; vínculos de contas e contatos (cadastros) ficam
  delete from importacao_vinculos where empresa_id = p_empresa and entidade not in ('conta', 'contato');

  perform set_config('app.zerando_sistema', '', true);

  insert into audit_log (empresa_id, user_id, usuario, tabela, registro_id, acao, resumo, antes)
  values (
    p_empresa, auth.uid(),
    coalesce((select lower(email) from auth.users where id = auth.uid()), auth.uid()::text),
    'sistema', p_empresa::text, 'delete',
    format('Zerou todo o sistema: %s lotes, %s apontamentos, %s movimentos de estoque, %s pedidos, %s notas, %s títulos e %s baixas apagados; cadastros, usuários e configurações mantidos',
      v->>'lotes', v->>'apontamentos', v->>'movimentos_estoque', v->>'pedidos', v->>'notas_fiscais', v->>'titulos', v->>'baixas'),
    v);
  return v;
end $function$;

-- 2. Triggers e funções exclusivas do RH.
drop trigger if exists cargo_no_funcionario on usuarios_empresa;
drop function if exists app.usuario_cargo_no_funcionario();
drop function if exists public.importar_ponto(uuid, jsonb, jsonb);
drop function if exists public.importar_ponto_coletado(text, jsonb, jsonb);
drop function if exists app.gravar_ponto(uuid, jsonb, jsonb);
drop function if exists public.bater_ponto_celular(uuid, numeric, numeric, numeric);
drop function if exists public.meu_ponto_hoje(uuid);
drop function if exists public.posso_bater_ponto(uuid);
drop function if exists app.meu_funcionario(uuid);

-- 3. Tabelas (os triggers, índices e policies vão junto).
drop table if exists ponto_marcacoes;
drop table if exists ponto_importacoes;
drop table if exists rh_ocorrencias;
drop table if exists funcionario_atribuicoes;
drop table if exists funcionarios;
drop table if exists escalas;
drop table if exists feriados;
drop table if exists rh_parametros;

drop function if exists app.escala_conferir();
drop function if exists app.funcionario_conferir();
drop function if exists app.ocorrencia_conferir();
drop function if exists app.marcacao_proteger();
drop function if exists app.horario_valido(jsonb);
drop function if exists app.cpf_valido(text);
drop function if exists app.distancia_m(numeric, numeric, numeric, numeric);

-- 4. Colunas de ponto das automações (coleta do relógio, ponto pelo celular e aviso de fechamento).
alter table automacoes_empresa
  drop column if exists ponto_token,
  drop column if exists ponto_ultima_coleta,
  drop column if exists ponto_celular,
  drop column if exists ponto_lat,
  drop column if exists ponto_lng,
  drop column if exists ponto_raio_m,
  drop column if exists fechamento_ponto,
  drop column if exists fechamento_ponto_dia;

-- 5. Permissões rh.* que ficaram gravadas em cargos, usuários e convites.
update cargos set permissoes = array(select p from unnest(permissoes) p where p not like 'rh.%')
 where exists (select 1 from unnest(permissoes) p where p like 'rh.%');
update usuarios_empresa set permissoes = array(select p from unnest(permissoes) p where p not like 'rh.%')
 where exists (select 1 from unnest(permissoes) p where p like 'rh.%');
update convites set permissoes = array(select p from unnest(permissoes) p where p not like 'rh.%')
 where exists (select 1 from unnest(permissoes) p where p like 'rh.%');

select app.travar_referencias();
