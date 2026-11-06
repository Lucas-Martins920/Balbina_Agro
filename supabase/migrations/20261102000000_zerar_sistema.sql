-- Zerar todo o sistema (pedido do Nicolas em 2026-11-01): apaga todos os movimentos DA EMPRESA do master,
-- para recomeçar do zero com os cadastros prontos. Nunca toca outra empresa nem dados da plataforma.
--
-- Apaga: tudo que o "Zerar financeiro" apaga (títulos, baixas, transferências, recorrências, cobranças,
-- pagamentos pelo Asaas, remessas, extrato, conciliações, meses fechados) e mais: lotes (com alocações,
-- transferências, custos mensais e o centro de custo automático de cada lote), apontamentos (e a lixeira),
-- eventos sanitários, classificação de ovos, todo o estoque (movimentos), ordens de produção de ração,
-- pedidos de venda, pedidos gerados pelos pedidos fixos, compras entre empresas, transferências de ovos,
-- notas fiscais emitidas e recebidas, inutilizações, documentos e anexos, caixa de entrada de documentos,
-- marcações e arquivos de ponto, folgas/férias/atestados, manutenções feitas, avisos já enviados, sugestões
-- dispensadas, entregas de webhook e vínculos de importação de movimentos.
-- Mantém: a empresa, usuários, cargos, convites e logins; assinatura e plano; histórico de alterações; todos
-- os cadastros (clientes e fornecedores, produtos, classes de ovo, depósitos, setores e viveiros, espécies,
-- categorias, centros de custo, contas e caixas com saldo zero, fórmulas, medicamentos, equipamentos e planos
-- de manutenção, funcionários, escalas, feriados, tabelas de preço, pontos de venda, regras fiscais e de
-- conciliação, pedidos fixos, checklist); planejamento e orçamento; configurações e integrações (Asaas, Focus
-- NFe, Open Finance, WhatsApp, API, automações, LCDPR, ponto) e o uso da IA (base da cobrança).
--
-- Só o master, com o código do autenticador digitado há no máximo 5 minutos, o nome da empresa e a frase
-- ZERAR TUDO. Cada linha apagada fica no histórico (trigger historico) e um resumo entra como "Sistema zerado".

-- Batidas do relógio e do celular só saem pelo zerar sistema da própria empresa.
create or replace function app.marcacao_proteger() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.origem in ('arquivo', 'celular') and pg_trigger_depth() < 2
       and current_setting('app.zerando_sistema', true) is distinct from old.empresa_id::text then
      raise exception 'Batida do relógio ou do celular não se apaga: marque como desconsiderada, com o motivo, ou apague a importação inteira'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  if (new.cpf, new.pis, new.data, new.hora, new.origem, new.nsr, new.importacao_id, new.empresa_id, new.lat, new.lng)
     is distinct from (old.cpf, old.pis, old.data, old.hora, old.origem, old.nsr, old.importacao_id, old.empresa_id, old.lat, old.lng) then
    raise exception 'Data e hora da batida não mudam: lance uma batida manual com justificativa e desconsidere a errada'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- Zerar financeiro: o pagamento de boleto pelo Asaas (pagamentos_saida, PR #179) prende o título
-- (on delete restrict) e travava o zerar. Ele sai antes do título; o resto é igual.
create or replace function public.zerar_financeiro(p_empresa uuid, p_confirmacao text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp empresas%rowtype;
  v_digitado text := lower(regexp_replace(btrim(coalesce(p_confirmacao, '')), '\s+', ' ', 'g'));
  v jsonb := '{}';
  n bigint;
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o master da empresa pode zerar o financeiro' using errcode = 'insufficient_privilege';
  end if;
  if not app.mfa_recente(5) then
    raise exception 'Confirme com o código do autenticador antes de zerar o financeiro' using errcode = 'insufficient_privilege';
  end if;
  -- trava a empresa: duas execuções ao mesmo tempo esperam uma pela outra
  select * into v_emp from empresas where id = p_empresa for update;
  if v_digitado = '' or v_digitado not in (
      lower(regexp_replace(btrim(v_emp.razao_social), '\s+', ' ', 'g')),
      lower(regexp_replace(btrim(coalesce(v_emp.nome_fantasia, '')), '\s+', ' ', 'g'))) then
    raise exception 'Digite o nome da empresa para confirmar' using errcode = 'check_violation';
  end if;

  perform set_config('app.zerando_financeiro', p_empresa::text, true);

  -- meses fechados travam a exclusão de baixas e transferências
  delete from periodos_fechados where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('meses_reabertos', n);

  delete from conciliacoes where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('conciliacoes', n);
  delete from movimentos_bancarios where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('movimentos_extrato', n);
  delete from importacoes_extrato where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('extratos_importados', n);

  delete from baixas where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('baixas', n);
  delete from transferencias where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('transferencias', n);
  -- pagamentos de boleto pelo Asaas (PR #179) seguram o título: saem antes dele
  delete from pagamentos_saida where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('pagamentos_saida', n);
  delete from cobrancas where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('cobrancas', n);
  delete from remessas_cnab where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('remessas_cnab', n);
  delete from agendamentos where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('titulos', n);
  delete from recorrencias where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('recorrencias', n);

  update documentos set vinculo_tabela = null, vinculo_id = null
  where empresa_id = p_empresa
    and vinculo_tabela in ('agendamentos', 'baixas', 'transferencias', 'movimentos_bancarios', 'cobrancas');
  -- reimportar do NIBO volta a criar os lançamentos em vez de achar que já existem
  delete from importacao_vinculos where empresa_id = p_empresa and entidade in ('titulo', 'baixa', 'transferencia');

  update contas_financeiras set saldo_inicial_cents = 0, updated_at = now()
  where empresa_id = p_empresa and saldo_inicial_cents <> 0;
  get diagnostics n = row_count; v := v || jsonb_build_object('contas_zeradas', n);
  -- a próxima sincronização do Open Finance traz o extrato inteiro, não só os últimos dias
  update conexoes_bancarias set ultima_sincronizacao = null, updated_at = now()
  where empresa_id = p_empresa and ultima_sincronizacao is not null;

  perform set_config('app.zerando_financeiro', '', true);

  insert into audit_log (empresa_id, user_id, usuario, tabela, registro_id, acao, resumo, antes)
  values (
    p_empresa, auth.uid(),
    coalesce((select lower(email) from auth.users where id = auth.uid()), auth.uid()::text),
    'financeiro', p_empresa::text, 'delete',
    format('Zerou o financeiro: %s títulos, %s baixas, %s transferências, %s lançamentos do extrato e %s conciliações apagados; saldos das contas em zero',
      v->>'titulos', v->>'baixas', v->>'transferencias', v->>'movimentos_extrato', v->>'conciliacoes'),
    v);
  return v;
end $$;

create or replace function public.zerar_sistema(p_empresa uuid, p_confirmacao text, p_frase text) returns jsonb
language plpgsql security definer set search_path = public as $$
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

  -- 5. RH e manutenção. A importação leva as batidas dela; as do celular e manuais saem em seguida.
  select count(*) into n from ponto_marcacoes where empresa_id = p_empresa;
  v := v || jsonb_build_object('batidas_ponto', n);
  delete from ponto_importacoes where empresa_id = p_empresa;
  delete from ponto_marcacoes where empresa_id = p_empresa;
  delete from rh_ocorrencias where empresa_id = p_empresa;
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
end $$;

revoke all on function public.zerar_sistema(uuid, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.zerar_sistema(uuid, text, text) to authenticated;
  end if;
end $$;
