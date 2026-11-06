-- Apaga do banco o módulo de Manutenções (pedido do Nicolas em 2026-11-02: "assim como o RH, tirar toda a parte de
-- manutenção"). A interface saiu em 20261102180000_desligar_manutencao (mesmo caminho do RH: #211 e depois #215); aqui
-- saem as tabelas, os dados delas, as views, as funções, e as permissões manutencao.*. O cargo pronto
-- "Manutenção geral" fica (decisão do Nicolas, 2026-11-03), só com ver piscicultura, estoque e produtos.
-- DESTRUTIVO: equipamentos, planos de preventiva e o histórico de manutenções e checklists somem. As contas a pagar que
-- nasceram de uma manutenção ficam (são títulos comuns). O backup diário cifrado de antes do consolidado guarda a última cópia.

-- 1. Funções que citam as tabelas ou as permissões da manutenção (plpgsql resolve na hora de rodar).
CREATE OR REPLACE FUNCTION app.permissoes_perfil(p_perfil text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_perfil
    when 'visualizacao' then array['*.ver']
    when 'cadastros' then array['*.ver', 'piscicultura.editar', 'lotes.editar', 'estoque.editar', 'configuracoes.editar',
      'produtos.editar', 'contatos.editar', 'categorias.editar', 'centros-de-custo.editar', 'planejamento.editar']
    when 'apontador' then array['apontamentos.editar', 'sanidade.editar', 'piscicultura.ver', 'lotes.ver']
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
      'racao.editar', 'planejamento.editar', 'custo-do-kg.ver', 'produtos.ver', 'contatos.ver']
    when 'tratador' then array['apontamentos.editar', 'piscicultura.ver', 'lotes.ver', 'sanidade.ver']
    when 'fabrica_racao' then array['racao.editar', 'produtos.ver', 'estoque.ver']
    when 'manutencao' then array['piscicultura.ver', 'estoque.ver', 'produtos.ver']
    else array[]::text[]
  end
$function$;

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

  -- 5. Documentos, avisos e restos de importação.
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

-- 2. Views, funções e tabelas (os triggers, índices e policies vão junto).
drop view if exists problemas_manutencao;
drop view if exists equipamentos_situacao;
drop view if exists agenda_manutencao;

drop function if exists public.registrar_manutencao(uuid, uuid, date, text, text, uuid, numeric, numeric, bigint, text, uuid, text, text, jsonb);
drop function if exists public.registrar_checklist(uuid, date, jsonb, text);
drop function if exists public.salvar_equipamento(uuid, uuid, jsonb, jsonb);
drop function if exists app.situacao_equipamento(uuid, uuid, text);
drop function if exists app.centro_custo_equipamento(uuid);

drop table if exists manutencoes;
drop table if exists planos_manutencao;
drop table if exists equipamentos;

drop function if exists app.equipamento_conferir();
drop function if exists app.plano_manutencao_conferir();
drop function if exists app.manutencao_conferir();
drop function if exists app.manutencao_aplicar();
drop function if exists app.nome_local(text, text);

-- 3. Permissões manutencao.* gravadas em cargos, usuários e convites, e o módulo nos planos.
update cargos set permissoes = array(select p from unnest(permissoes) p where p not like 'manutencao.%')
 where exists (select 1 from unnest(permissoes) p where p like 'manutencao.%');
update usuarios_empresa set permissoes = array(select p from unnest(permissoes) p where p not like 'manutencao.%')
 where exists (select 1 from unnest(permissoes) p where p like 'manutencao.%');
update convites set permissoes = array(select p from unnest(permissoes) p where p not like 'manutencao.%')
 where exists (select 1 from unnest(permissoes) p where p like 'manutencao.%');
update niveis_plano set modulos = array_remove(modulos, 'manutencao') where 'manutencao' = any (modulos);

select app.travar_referencias();
