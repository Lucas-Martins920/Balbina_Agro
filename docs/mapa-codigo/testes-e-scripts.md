# Testes, workflows, scripts e docs

> Parte do [mapa do código](README.md). Gerado por `scripts/mapa-codigo.mjs`; não edite à mão, rode `npm run mapa`.

## Testes do banco (`npm run test:db`)

- [supabase/tests/00_prelude_postgres.sql](../../supabase/tests/00_prelude_postgres.sql) — Só para rodar os testes num Postgres puro (CI/local). O Supabase já tem isto.
- [supabase/tests/10_regras.sql](../../supabase/tests/10_regras.sql) — Testes das regras que vivem no banco. Qualquer falha aborta com erro.
- [supabase/tests/20_producao_titulos.sql](../../supabase/tests/20_producao_titulos.sql) — Marco 1: povoamento, apontamento e títulos com rateio/parcelas.
- [supabase/tests/30_financeiro.sql](../../supabase/tests/30_financeiro.sql) — Marco 2a: recorrências, transferências e saldos de contas.
- [supabase/tests/40_conciliacao.sql](../../supabase/tests/40_conciliacao.sql) — Marco 2b: extrato, conciliação, relatórios e fechamento de mês.
- [supabase/tests/50_estoque_vendas.sql](../../supabase/tests/50_estoque_vendas.sql) — Marco 3: despesca, estoque de pescado em kg, carência, pedidos de venda e alertas.
- [supabase/tests/60_custo_kg.sql](../../supabase/tests/60_custo_kg.sql) — Marco 4: custo do kg por lote.
- [supabase/tests/70_regras_aging_orcamento.sql](../../supabase/tests/70_regras_aging_orcamento.sql) — Marco 5a: regras de conciliação, aging e orçamento.
- [supabase/tests/80_racao_cartao_comercial.sql](../../supabase/tests/80_racao_cartao_comercial.sql) — Marco 5b: insumos, cartão de crédito e relatórios comerciais (a fábrica de ração foi desativada em 2026-11-11).
- [supabase/tests/90_cobranca.sql](../../supabase/tests/90_cobranca.sql) — Marco 5c: cobrança pelo Asaas e baixa pelo webhook.
- [supabase/tests/95_open_finance_conciliacao.sql](../../supabase/tests/95_open_finance_conciliacao.sql) — Conciliação simplificada: palpite pelo histórico, transferência sugerida, certeiras em lote e conexões Open Finance.
- [supabase/tests/95_usuarios_permissoes.sql](../../supabase/tests/95_usuarios_permissoes.sql) — Usuário master, convites, perfis e permissões por módulo.
- [supabase/tests/96_nfe.sql](../../supabase/tests/96_nfe.sql) — NF-e dos pedidos pela Focus NFe.
- [supabase/tests/97_pdv.sql](../../supabase/tests/97_pdv.sql) — PDV: venda de balcão numa transação só, troco e resumo do caixa.
- [supabase/tests/98_cadastros.sql](../../supabase/tests/98_cadastros.sql) — Cadastros: permissões novas, categoria do sistema, produto com movimento, lote editável e exclusões.
- [supabase/tests/98_tabelas_preco.sql](../../supabase/tests/98_tabelas_preco.sql) — Tabelas de preço: padrão por empresa, tabela do cliente, ajuste em %, preço especial e permissões.
- [supabase/tests/99_acoes_titulos.sql](../../supabase/tests/99_acoes_titulos.sql) — Ações rápidas nas contas (estilo NIBO): editar, duplicar, baixa em lote, reprogramar, lixeira, perda e estorno.
- [supabase/tests/99_alarmes_seguranca.sql](../../supabase/tests/99_alarmes_seguranca.sql) — Alarmes de segurança no painel do master: senha errada em sequência, chave da API revogada sendo usada,
- [supabase/tests/99_apagar_apontamentos.sql](../../supabase/tests/99_apagar_apontamentos.sql) — Apagar apontamentos: vai para a lixeira com tudo o que tinha, desfaz estoque e totais, e dá para restaurar.
- [supabase/tests/99_api_publica.sql](../../supabase/tests/99_api_publica.sql) — API pública: só o master cria chave e webhook, a chave autentica no servidor com os módulos do
- [supabase/tests/99_api_rate_limit.sql](../../supabase/tests/99_api_rate_limit.sql) — Rate limit da API pública no banco: incrementa chamadas por chave/minuto e trava acima do limite.
- [supabase/tests/99_apontamento_campo.sql](../../supabase/tests/99_apontamento_campo.sql) — App de campo: o lançamento que chega do celular (às vezes horas depois, às vezes repetido) grava
- [supabase/tests/99_assinaturas.sql](../../supabase/tests/99_assinaturas.sql) — Assinatura do SaaS: teste grátis, pagamento pelo webhook, carência e bloqueio pelo RLS.
- [supabase/tests/99_assistente_inicio.sql](../../supabase/tests/99_assistente_inicio.sql) — Assistente de início: passos que se dão por feitos sozinhos, pular, esconder e retomar, sumir quando
- [supabase/tests/99_automacoes.sql](../../supabase/tests/99_automacoes.sql) — Automações: configuração por empresa, inscrições de aviso no celular (cada um só as suas) e o
- [supabase/tests/99_automacoes_estoque.sql](../../supabase/tests/99_automacoes_estoque.sql) — Ficha de embalagem (B4): faturar baixa as embalagens; cancelar devolve; dias de compra/produção por empresa.
- [supabase/tests/99_automacoes_financeiro.sql](../../supabase/tests/99_automacoes_financeiro.sql) — Automações do financeiro: lançar pelo histórico (C1), regras sugeridas (C2) e recorrências sugeridas (C6).
- [supabase/tests/99_automacoes_resumo.sql](../../supabase/tests/99_automacoes_resumo.sql) — Automações de rotina: resumo diário (H3) e aviso do pacote do contador (E1)
- [supabase/tests/99_automacoes_vendas.sql](../../supabase/tests/99_automacoes_vendas.sql) — Automações de vendas: pedidos fixos gerados na véspera (D2), bloqueio de venda a prazo para quem está
- [supabase/tests/99_biometria_crescimento.sql](../../supabase/tests/99_biometria_crescimento.sql) — Biometria, peso estimado pela curva do tambaqui, ração sugerida pela tabela de arraçoamento, alertas da água e
- [supabase/tests/99_biometria_grupos.sql](../../supabase/tests/99_biometria_grupos.sql) — Biometria em grupos: média ponderada (peso total ÷ peixes), correção de grupos, reenvio offline sem duplicar,
- [supabase/tests/99_bloqueio_login.sql](../../supabase/tests/99_bloqueio_login.sql) — Bloqueio temporário do login depois de 5 senhas erradas em 15 minutos na mesma conta.
- [supabase/tests/99_campo_insumos.sql](../../supabase/tests/99_campo_insumos.sql) — App de campo: insumos aplicados no viveiro (corretivo, fertilizante, medicamento), com o viveiro vazio do preparo,
- [supabase/tests/99_cancelar_importacao.sql](../../supabase/tests/99_cancelar_importacao.sql) — Cancelar a importação de um extrato lido por engano (quem pode conciliar; o que já foi feito fica), duplicados na
- [supabase/tests/99_cargos.sql](../../supabase/tests/99_cargos.sql) — Cargos: perfis prontos da piscicultura (tratador, gerente, fábrica de ração...) e cargos criados pelo master.
- [supabase/tests/99_causas_mortalidade.sql](../../supabase/tests/99_causas_mortalidade.sql) — Causa das baixas: cada lançamento diz por que os peixes morreram ou foram descartes (opcional), o dia
- [supabase/tests/99_chat_campo_ia.sql](../../supabase/tests/99_chat_campo_ia.sql) — Chat do app de campo (/api/chat/manejo): cada pergunta conta no uso de IA da empresa, com limite próprio,
- [supabase/tests/99_checklist_racao_apontamento.sql](../../supabase/tests/99_checklist_racao_apontamento.sql) — Apontamento de cria/recria com checklist e ração por tipo saindo do estoque; custo do lote pela baixa.
- [supabase/tests/99_conciliacao_multipla.sql](../../supabase/tests/99_conciliacao_multipla.sql) — Conciliação múltipla: um movimento do extrato casa com vários títulos.
- [supabase/tests/99_contas_asaas.sql](../../supabase/tests/99_contas_asaas.sql) — Conta Asaas por piscicultura: a chave fica longe do usuário e a credencial do servidor não pode ser escolhida.
- [supabase/tests/99_desconciliar.sql](../../supabase/tests/99_desconciliar.sql) — Desconciliar com regras (motivo, mês fechado, o que já existia fica) e apagar conciliação ou
- [supabase/tests/99_desempenho.sql](../../supabase/tests/99_desempenho.sql) — Desempenho: funções chamadas linha a linha nas views e policies não podem refazer o RLS a cada linha.
- [supabase/tests/99_desfazer_venda.sql](../../supabase/tests/99_desfazer_venda.sql) — Desfazer entrega e desfazer faturamento de pedido marcado por engano.
- [supabase/tests/99_documentos_recebidos.sql](../../supabase/tests/99_documentos_recebidos.sql) — Documentos lidos por IA (C3), caixa de e-mail (C4) e limite de leituras por IA.
- [supabase/tests/99_excluir_conta.sql](../../supabase/tests/99_excluir_conta.sql) — Contas e caixas: excluir só a conta sem movimento e sem banco ligado; a que tem histórico é arquivada.
- [supabase/tests/99_funcoes_sem_anon.sql](../../supabase/tests/99_funcoes_sem_anon.sql) — Nenhuma função security definer do schema public pode ser chamada sem login (papel anon).
- [supabase/tests/99_fuso.sql](../../supabase/tests/99_fuso.sql) — "Hoje" no fuso de cada empresa (padrão America/Manaus), nunca no UTC do servidor.
- [supabase/tests/99_historico.sql](../../supabase/tests/99_historico.sql) — Histórico de alterações: inclusão, edição e exclusão gravam quem fez e o que mudou; só lê quem tem historico.ver.
- [supabase/tests/99_importacao.sql](../../supabase/tests/99_importacao.sql) — Importação (NIBO / planilhas): cadastros casados por nome e documento, títulos com rateio e baixas,
- [supabase/tests/99_importacao_piscicultura.sql](../../supabase/tests/99_importacao_piscicultura.sql) — Planilha modelo, parte da piscicultura: setores e viveiros, lotes povoados e estoque inicial,
- [supabase/tests/99_importacao_planilha.sql](../../supabase/tests/99_importacao_planilha.sql) — Importação por planilha modelo: produtos no pacote, idempotência por chave, trava do plano
- [supabase/tests/99_isolamento_empresas.sql](../../supabase/tests/99_isolamento_empresas.sql) — Uma empresa não alcança dados de outra apontando, numa linha sua, para o id de um registro alheio.
- [supabase/tests/99_lapidacao.sql](../../supabase/tests/99_lapidacao.sql) — Lapidação de 31/10: o que os Advisors do Supabase apontavam (policies, índices, funções) não volta.
- [supabase/tests/99_lcdpr_portal_cliente.sql](../../supabase/tests/99_lcdpr_portal_cliente.sql) — LCDPR (E2): lançamentos do financeiro realizado. Portal do cliente (D3): link, preços e pedido.
- [supabase/tests/99_login_local.sql](../../supabase/tests/99_login_local.sql) — Login por usuário e senha criado pelo master: conta presa à empresa, troca de senha e dispensa do 2º fator
- [supabase/tests/99_manutencao_removida.sql](../../supabase/tests/99_manutencao_removida.sql) — O módulo de Manutenções saiu do sistema (pedido do Nicolas, 2026-11-02): nada no banco leva mais a /manutencao.
- [supabase/tests/99_medicamentos.sql](../../supabase/tests/99_medicamentos.sql) — Medicamentos e vitaminas: cadastro com dose por kg de ração (ou por m³ de água no banho) e aplicação no
- [supabase/tests/99_mfa.sql](../../supabase/tests/99_mfa.sql) — Verificação em duas etapas: com autenticador cadastrado, só a sessão aal2 vê os dados.
- [supabase/tests/99_mfa_master.sql](../../supabase/tests/99_mfa_master.sql) — Funções de master (convites, usuários, importação) também exigem o código do autenticador
- [supabase/tests/99_movimentar_estoque.sql](../../supabase/tests/99_movimentar_estoque.sql) — Estoque unificado: entrada, saída e ajuste de saldo de qualquer produto do cadastro.
- [supabase/tests/99_nfe_completa.sql](../../supabase/tests/99_nfe_completa.sql) — NF-e completa: NFC-e do balcão, inutilização de numeração e emitente na Focus.
- [supabase/tests/99_nfes_recebidas.sql](../../supabase/tests/99_nfes_recebidas.sql) — NF-e de compra pela SEFAZ (B1): gravação do lote da Focus, fornecedor reconhecido pelo CNPJ,
- [supabase/tests/99_nibo_conciliacao.sql](../../supabase/tests/99_nibo_conciliacao.sql) — Saldos e conciliação do NIBO: só empresa com a integração liberada; o conciliado lá entra conciliado
- [supabase/tests/99_nibo_sincronizar.sql](../../supabase/tests/99_nibo_sincronizar.sql) — Reimportar do NIBO sincroniza: o que mudou ou sumiu lá sai daqui e entra de novo certo; depois, o
- [supabase/tests/99_ordem_cadastros.sql](../../supabase/tests/99_ordem_cadastros.sql) — Ordem das categorias e dos centros de custo (arrastar na lista, como no NIBO).
- [supabase/tests/99_padroes_e_estoque_conciliacao.sql](../../supabase/tests/99_padroes_e_estoque_conciliacao.sql) — Categorias e centros de custo padrão que apagam o resto, e entrada no estoque pela conciliação
- [supabase/tests/99_pagamentos_asaas.sql](../../supabase/tests/99_pagamentos_asaas.sql) — Pagamentos pelo sistema (C7): desligado por padrão, proposta por quem lança, aprovação só do master,
- [supabase/tests/99_planejamento.sql](../../supabase/tests/99_planejamento.sql) — Planejamento de lotes: vazio sanitário mínimo, viveiros coerentes com a fase, isolamento entre empresas e permissões.
- [supabase/tests/99_plano_categorias.sql](../../supabase/tests/99_plano_categorias.sql) — Plano de categorias padrão da piscicultura de engorda (migration 20261102030000).
- [supabase/tests/99_planos.sql](../../supabase/tests/99_planos.sql) — Planos do Balbina: cada nível só libera os módulos dele, inclusive para o master.
- [supabase/tests/99_pontos_venda.sql](../../supabase/tests/99_pontos_venda.sql) — Pontos de venda: sede automática, estoque por ponto, transferência com frete e perda no transporte, PDV no ponto,
- [supabase/tests/99_produtos_para_venda.sql](../../supabase/tests/99_produtos_para_venda.sql) — Produtos de venda x insumos de consumo: milho não pede preço de venda nem entra em pedido.
- [supabase/tests/99_racao_baixa.sql](../../supabase/tests/99_racao_baixa.sql) — Estoque de ração, fase 2: toda saída ligada às entradas (FEFO), custo histórico por lote, estorno, ajuste,
- [supabase/tests/99_racao_entradas.sql](../../supabase/tests/99_racao_entradas.sql) — Estoque de ração: ficha técnica, entradas numeradas com lote e validade, saldo por entrada pelo FEFO.
- [supabase/tests/99_rateio_conciliacao.sql](../../supabase/tests/99_rateio_conciliacao.sql) — Rateio em várias categorias: conciliar um lançamento do extrato dividindo o valor entre categorias e
- [supabase/tests/99_recorrencias_cron.sql](../../supabase/tests/99_recorrencias_cron.sql) — Recorrências renovadas por rotina diária no banco (pg_cron), não mais a cada abertura de tela.
- [supabase/tests/99_regra_ignorar.sql](../../supabase/tests/99_regra_ignorar.sql) — Regra "Ignorar": aplicação/resgate automático (BB Rende Fácil) fica ignorado sozinho, sem título nem baixa,
- [supabase/tests/99_regras_em_partes.sql](../../supabase/tests/99_regras_em_partes.sql) — Importar OFX grande sem timeout: regras aplicadas em partes (aplicar_regras_lote) e permissão de
- [supabase/tests/99_rh_removido.sql](../../supabase/tests/99_rh_removido.sql) — O módulo RH e o cartão de ponto saíram do sistema (2026-11-02): nada de tabela, função, coluna ou permissão sobra.
- [supabase/tests/99_saldo_so_ao_lancar.sql](../../supabase/tests/99_saldo_so_ao_lancar.sql) — Conciliação não mexe no saldo antes de lançar: importar o extrato (OFX ou Open Finance) só aplica a regra
- [supabase/tests/99_termos_e_seguranca.sql](../../supabase/tests/99_termos_e_seguranca.sql) — Aceite dos termos (LGPD) e travas nos identificadores das integrações.
- [supabase/tests/99_titulos_por_modulo.sql](../../supabase/tests/99_titulos_por_modulo.sql) — Títulos por módulo: cargos de campo (fábrica de ração, gerente da piscicultura) e o caixa do PDV não mexem nas
- [supabase/tests/99_transferencia_lotes.sql](../../supabase/tests/99_transferencia_lotes.sql) — Transferência de lote entre viveiros: alevinagem -> recria -> engorda, divisão, histórico, desfazer e permissões.
- [supabase/tests/99_tutoriais.sql](../../supabase/tests/99_tutoriais.sql) — Tutoriais vistos: cada pessoa só vê, marca e refaz os seus.
- [supabase/tests/99_venda_entre_empresas.sql](../../supabase/tests/99_venda_entre_empresas.sql) — Ponto como outra empresa do mesmo dono: a piscicultura vende para a loja e a entrada é lançada na loja.
- [supabase/tests/99_whatsapp.sql](../../supabase/tests/99_whatsapp.sql) — WhatsApp do Balbina (H2): vínculo do celular por código, remetente, destinos dos avisos e régua automática.
- [supabase/tests/99_zerar_financeiro.sql](../../supabase/tests/99_zerar_financeiro.sql) — Zerar o financeiro: só o master, com o código do autenticador digitado agora (amr totp recente)
- [supabase/tests/99_zerar_sistema.sql](../../supabase/tests/99_zerar_sistema.sql) — Zerar todo o sistema: só o master, com o código do autenticador digitado agora, o nome da empresa e a

## Testes de unidade (`npm test`)

- [src/app/movimento.test.ts](../../src/app/movimento.test.ts) — Testes.
- [src/lib/abastecimento.test.ts](../../src/lib/abastecimento.test.ts) — Testes de src/lib/abastecimento.ts.
- [src/lib/agua.test.ts](../../src/lib/agua.test.ts) — Testes de src/lib/agua.ts.
- [src/lib/ai/offline-chat.test.ts](../../src/lib/ai/offline-chat.test.ts) — Testes de src/lib/ai/offline-chat.ts.
- [src/lib/ambiente.test.ts](../../src/lib/ambiente.test.ts) — Testes de src/lib/ambiente.ts.
- [src/lib/analise-periodo.test.ts](../../src/lib/analise-periodo.test.ts) — Testes de src/lib/analise-periodo.ts.
- [src/lib/api/regras.test.ts](../../src/lib/api/regras.test.ts) — Testes de src/lib/api/regras.ts.
- [src/lib/apontamento-campo.test.ts](../../src/lib/apontamento-campo.test.ts) — Testes de src/lib/apontamento-campo.ts.
- [src/lib/apontamento-excluir.test.ts](../../src/lib/apontamento-excluir.test.ts) — Testes de src/lib/apontamento-excluir.ts.
- [src/lib/apontamento-racao.test.ts](../../src/lib/apontamento-racao.test.ts) — Testes de src/lib/apontamento-racao.ts.
- [src/lib/app-celular/token.test.ts](../../src/lib/app-celular/token.test.ts) — Testes de src/lib/app-celular/token.ts.
- [src/lib/apresentacao.test.ts](../../src/lib/apresentacao.test.ts) — Testes de src/lib/apresentacao.ts.
- [src/lib/asaas-mapa.test.ts](../../src/lib/asaas-mapa.test.ts) — Testes de src/lib/asaas-mapa.ts.
- [src/lib/assinatura-mapa.test.ts](../../src/lib/assinatura-mapa.test.ts) — Testes de src/lib/assinatura-mapa.ts.
- [src/lib/assistente.test.ts](../../src/lib/assistente.test.ts) — Testes de src/lib/assistente.ts.
- [src/lib/biometria-grupos.test.ts](../../src/lib/biometria-grupos.test.ts) — Testes de src/lib/biometria-grupos.ts.
- [src/lib/boleto.test.ts](../../src/lib/boleto.test.ts) — Testes de src/lib/boleto.ts.
- [src/lib/campo/conhecimento-tambaqui.test.ts](../../src/lib/campo/conhecimento-tambaqui.test.ts) — Testes de src/lib/campo/conhecimento-tambaqui.ts.
- [src/lib/campo/contexto-chat.test.ts](../../src/lib/campo/contexto-chat.test.ts) — Testes de src/lib/campo/contexto-chat.ts.
- [src/lib/campo/fila.test.ts](../../src/lib/campo/fila.test.ts) — Testes de src/lib/campo/fila.ts.
- [src/lib/campo/indicadores.test.ts](../../src/lib/campo/indicadores.test.ts) — Testes de src/lib/campo/indicadores.ts.
- [src/lib/campo/propostas.test.ts](../../src/lib/campo/propostas.test.ts) — Testes de src/lib/campo/propostas.ts.
- [src/lib/campo/validar.test.ts](../../src/lib/campo/validar.test.ts) — Testes de src/lib/campo/validar.ts.
- [src/lib/causas-morte.test.ts](../../src/lib/causas-morte.test.ts) — Testes de src/lib/causas-morte.ts.
- [src/lib/consulta-publica.test.ts](../../src/lib/consulta-publica.test.ts) — Testes de src/lib/consulta-publica.ts.
- [src/lib/contraparte.test.ts](../../src/lib/contraparte.test.ts) — Testes de src/lib/contraparte.ts.
- [src/lib/crescimento.test.ts](../../src/lib/crescimento.test.ts) — Testes de src/lib/crescimento.ts.
- [src/lib/cripto.test.ts](../../src/lib/cripto.test.ts) — Testes de src/lib/cripto.ts.
- [src/lib/db/indexeddb.test.ts](../../src/lib/db/indexeddb.test.ts) — Testes de src/lib/db/indexeddb.ts.
- [src/lib/documento.test.ts](../../src/lib/documento.test.ts) — Testes de src/lib/documento.ts.
- [src/lib/dre-exportar.test.ts](../../src/lib/dre-exportar.test.ts) — Testes de src/lib/dre-exportar.ts.
- [src/lib/eslint-config.test.ts](../../src/lib/eslint-config.test.ts) — Testes.
- [src/lib/estoque-carrinho.test.ts](../../src/lib/estoque-carrinho.test.ts) — Testes de src/lib/estoque-carrinho.ts.
- [src/lib/fala-apontamento.test.ts](../../src/lib/fala-apontamento.test.ts) — Testes de src/lib/fala-apontamento.ts.
- [src/lib/fluxo.test.ts](../../src/lib/fluxo.test.ts) — Testes de src/lib/fluxo.ts.
- [src/lib/focus-mapa.test.ts](../../src/lib/focus-mapa.test.ts) — Testes de src/lib/focus-mapa.ts.
- [src/lib/formato.test.ts](../../src/lib/formato.test.ts) — Testes de src/lib/formato.ts.
- [src/lib/historico.test.ts](../../src/lib/historico.test.ts) — Testes de src/lib/historico.ts.
- [src/lib/importacao-modelo.test.ts](../../src/lib/importacao-modelo.test.ts) — Testes de src/lib/importacao-modelo.ts.
- [src/lib/importacao.test.ts](../../src/lib/importacao.test.ts) — Testes de src/lib/importacao.ts.
- [src/lib/lateral.test.ts](../../src/lib/lateral.test.ts) — Testes de src/lib/lateral.ts.
- [src/lib/lcdpr.test.ts](../../src/lib/lcdpr.test.ts) — Testes de src/lib/lcdpr.ts.
- [src/lib/lembretes.test.ts](../../src/lib/lembretes.test.ts) — Testes de src/lib/lembretes.ts.
- [src/lib/login-bloqueio.test.ts](../../src/lib/login-bloqueio.test.ts) — Testes de src/lib/login-bloqueio.ts.
- [src/lib/login-local.test.ts](../../src/lib/login-local.test.ts) — Testes de src/lib/login-local.ts.
- [src/lib/manutencao.test.ts](../../src/lib/manutencao.test.ts) — Testes de src/lib/manutencao.ts.
- [src/lib/menu.test.ts](../../src/lib/menu.test.ts) — Testes de src/lib/menu.ts.
- [src/lib/nfe-xml.test.ts](../../src/lib/nfe-xml.test.ts) — Testes de src/lib/nfe-xml.ts.
- [src/lib/ofx.test.ts](../../src/lib/ofx.test.ts) — Testes de src/lib/ofx.ts.
- [src/lib/open-finance-mapa.test.ts](../../src/lib/open-finance-mapa.test.ts) — Testes de src/lib/open-finance-mapa.ts.
- [src/lib/ordem.test.ts](../../src/lib/ordem.test.ts) — Testes de src/lib/ordem.ts.
- [src/lib/painel.test.ts](../../src/lib/painel.test.ts) — Testes de src/lib/painel.ts.
- [src/lib/pdv.test.ts](../../src/lib/pdv.test.ts) — Testes de src/lib/pdv.ts.
- [src/lib/pedido-campo.test.ts](../../src/lib/pedido-campo.test.ts) — Testes de src/lib/pedido-campo.ts.
- [src/lib/pendencias.test.ts](../../src/lib/pendencias.test.ts) — Testes de src/lib/pendencias.ts.
- [src/lib/permissoes-regras.test.ts](../../src/lib/permissoes-regras.test.ts) — Testes de src/lib/permissoes-regras.ts.
- [src/lib/pescado.test.ts](../../src/lib/pescado.test.ts) — Testes de src/lib/pescado.ts.
- [src/lib/planejamento.test.ts](../../src/lib/planejamento.test.ts) — Testes de src/lib/planejamento.ts.
- [src/lib/planilha.test.ts](../../src/lib/planilha.test.ts) — Testes de src/lib/planilha.ts.
- [src/lib/pontos.test.ts](../../src/lib/pontos.test.ts) — Testes de src/lib/pontos.ts.
- [src/lib/previsao-racao.test.ts](../../src/lib/previsao-racao.test.ts) — Testes de src/lib/previsao-racao.ts.
- [src/lib/previsao.test.ts](../../src/lib/previsao.test.ts) — Testes de src/lib/previsao.ts.
- [src/lib/racao-estoque.test.ts](../../src/lib/racao-estoque.test.ts) — Testes de src/lib/racao-estoque.ts.
- [src/lib/rateio.test.ts](../../src/lib/rateio.test.ts) — Testes de src/lib/rateio.ts.
- [src/lib/regras-em-partes.test.ts](../../src/lib/regras-em-partes.test.ts) — Testes de src/lib/regras-em-partes.ts.
- [src/lib/regras.test.ts](../../src/lib/regras.test.ts) — Testes de src/lib/regras.ts.
- [src/lib/regua-cobranca.test.ts](../../src/lib/regua-cobranca.test.ts) — Testes de src/lib/regua-cobranca.ts.
- [src/lib/relatorios-catalogo.test.ts](../../src/lib/relatorios-catalogo.test.ts) — Testes de src/lib/relatorios-catalogo.ts.
- [src/lib/relatorios.test.ts](../../src/lib/relatorios.test.ts) — Testes de src/lib/relatorios.ts.
- [src/lib/selecao-lote.test.ts](../../src/lib/selecao-lote.test.ts) — Testes de src/lib/selecao-lote.ts.
- [src/lib/sugestao-apontamento.test.ts](../../src/lib/sugestao-apontamento.test.ts) — Testes de src/lib/sugestao-apontamento.ts.
- [src/lib/supabase/falha-auth.test.ts](../../src/lib/supabase/falha-auth.test.ts) — Testes de src/lib/supabase/falha-auth.ts.
- [src/lib/supabase/todas.test.ts](../../src/lib/supabase/todas.test.ts) — Testes de src/lib/supabase/todas.ts.
- [src/lib/sync/sync.test.ts](../../src/lib/sync/sync.test.ts) — Testes.
- [src/lib/titulos.test.ts](../../src/lib/titulos.test.ts) — Testes de src/lib/titulos.ts.
- [src/lib/tutoriais.test.ts](../../src/lib/tutoriais.test.ts) — Testes de src/lib/tutoriais.ts.
- [src/lib/vendas.test.ts](../../src/lib/vendas.test.ts) — Testes de src/lib/vendas.ts.
- [src/lib/whatsapp-texto.test.ts](../../src/lib/whatsapp-texto.test.ts) — Testes de src/lib/whatsapp-texto.ts.
- [src/lib/zootecnico.test.ts](../../src/lib/zootecnico.test.ts) — Testes de src/lib/zootecnico.ts.

## Testes E2E (`npm run test:e2e`)

- [e2e/acesso.spec.ts](../../e2e/acesso.spec.ts) — Testes de e2e/acesso.spec.ts.
- [e2e/api.spec.ts](../../e2e/api.spec.ts) — Testes de e2e/api.spec.ts.
- [e2e/apoio.ts](../../e2e/apoio.ts) — Testes de e2e/apoio.ts.
- [e2e/apontamento-lixeira.spec.ts](../../e2e/apontamento-lixeira.spec.ts) — Testes de e2e/apontamento-lixeira.spec.ts.
- [e2e/financeiro.spec.ts](../../e2e/financeiro.spec.ts) — Testes de e2e/financeiro.spec.ts.
- [e2e/login-local.spec.ts](../../e2e/login-local.spec.ts) — Testes de e2e/login-local.spec.ts.
- [e2e/login.setup.ts](../../e2e/login.setup.ts) — Testes de e2e/login.setup.ts.
- [e2e/offline.spec.ts](../../e2e/offline.spec.ts) — Testes de e2e/offline.spec.ts.
- [e2e/piscicultura.spec.ts](../../e2e/piscicultura.spec.ts) — Testes de e2e/piscicultura.spec.ts.
- [e2e/preparar.ts](../../e2e/preparar.ts) — Testes de e2e/preparar.ts.
- [e2e/producao-vendas.spec.ts](../../e2e/producao-vendas.spec.ts) — Testes de e2e/producao-vendas.spec.ts.
- [e2e/rotina.spec.ts](../../e2e/rotina.spec.ts) — Testes de e2e/rotina.spec.ts.
- [e2e/tela-celular.spec.ts](../../e2e/tela-celular.spec.ts) — Testes de e2e/tela-celular.spec.ts.
- [e2e/telas.spec.ts](../../e2e/telas.spec.ts) — Testes de e2e/telas.spec.ts.
- [e2e/totp.ts](../../e2e/totp.ts) — Testes de e2e/totp.ts.
- [e2e/vendas-pontos.spec.ts](../../e2e/vendas-pontos.spec.ts) — Testes de e2e/vendas-pontos.spec.ts.
- [e2e/vendas-prazo.spec.ts](../../e2e/vendas-prazo.spec.ts) — Testes de e2e/vendas-prazo.spec.ts.
- [e2e/vendedor.spec.ts](../../e2e/vendedor.spec.ts) — Testes de e2e/vendedor.spec.ts.

## Workflows do GitHub Actions

| Workflow | Arquivo | Quando roda | Nota |
|---|---|---|---|
| Backup do banco | [.github/workflows/backup.yml](../../.github/workflows/backup.yml) | agendado, manual | Todo dia às 03:00 de Brasília: dump cifrado do banco de produção, restauração completa |
| Migrations no Supabase | [.github/workflows/migracoes.yml](../../.github/workflows/migracoes.yml) | push, manual | Aplica as migrations novas: |
| Verificação | [.github/workflows/verificacao.yml](../../.github/workflows/verificacao.yml) | PR, manual | Action único de verificação: junta o CI (lint, tipos, testes, |
| Webhooks da API | [.github/workflows/webhooks.yml](../../.github/workflows/webhooks.yml) | agendado, manual | Reserva da entrega dos avisos (webhooks) da API pública que estão na fila. |

## Comandos (`npm run ...`)

| Comando | Executa |
|---|---|
| `npm run dev` | `next dev` |
| `npm run local` | `node scripts/local.mjs` |
| `npm run local:parar` | `node scripts/local.mjs parar` |
| `npm run local:zerar` | `node scripts/local.mjs zerar` |
| `npm run dev:iniciar` | `bash scripts/dev-iniciar.sh` |
| `npm run dev:parar` | `bash scripts/dev-parar.sh` |
| `npm run dev:status` | `node scripts/limites-docker.mjs --ver` |
| `npm run build` | `next build` |
| `npm run start` | `next start` |
| `npm run lint` | `eslint` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:db` | `./scripts/test-db.sh` |
| `npm run test` | `node --test --experimental-strip-types 'src/**/*.test.ts'` |
| `npm run test:e2e` | `playwright test` |
| `npm run mapa` | `node scripts/mapa-codigo.mjs` |
| `npm run tokens:celular` | `node scripts/tokens-celular.mjs` |

## Scripts

- [scripts/aplicar-migracoes.sh](../../scripts/aplicar-migracoes.sh) — Aplica no banco as migrations de supabase/migrations que ainda não rodaram.
- [scripts/backup-banco.sh](../../scripts/backup-banco.sh) — Gera um backup cifrado do banco do Balbina.
- [scripts/conferir-consultas.mjs](../../scripts/conferir-consultas.mjs) — Confere se o que o site (src/) e o app (mobile/src/) pedem ao banco existe depois das migrations:
- [scripts/dev-iniciar.sh](../../scripts/dev-iniciar.sh) — Liga o ambiente de desenvolvimento no modo leve, para notebook de 8 GB no Linux (docs/ambiente-leve.md).
- [scripts/dev-parar.sh](../../scripts/dev-parar.sh) — Desliga TUDO do ambiente de desenvolvimento e devolve a memória ao Linux (docs/ambiente-leve.md):
- [scripts/focus-homologacao.ts](../../scripts/focus-homologacao.ts) — Teste ponta a ponta da NF-e/NFC-e no ambiente de HOMOLOGAÇÃO da Focus NFe (notas sem valor fiscal).
- [scripts/limites-docker.mjs](../../scripts/limites-docker.mjs) — Limites rígidos de RAM e CPU nos contêineres do Supabase local (docs/ambiente-leve.md).
- [scripts/local.mjs](../../scripts/local.mjs) — Roda o Balbina na sua máquina com um banco Supabase local (Docker), sem tocar na produção.
- [scripts/mapa-codigo.mjs](../../scripts/mapa-codigo.mjs) — Gera o mapa do código do Balbina: onde fica cada tela, função, componente, rota de API,
- [scripts/restaurar-backup.sh](../../scripts/restaurar-backup.sh) — Restaura um backup gerado por backup-banco.sh.
- [scripts/test-backup.sh](../../scripts/test-backup.sh) — Faz backup e restauração de um banco com todas as migrations, para o CI pegar
- [scripts/test-db.sh](../../scripts/test-db.sh) — Roda as migrations e os testes de banco num Postgres limpo.
- [scripts/tokens-celular.mjs](../../scripts/tokens-celular.mjs) — Gera mobile/src/tema/tokens.ts a partir dos tokens de src/app/globals.css (blocos :root e
- [scripts/vercel-ignorar.sh](../../scripts/vercel-ignorar.sh) — ignoreCommand da Vercel (vercel.json): sair com 0 PULA o deploy; sair com 1 constrói.

## Documentação

- [docs/ambiente-leve.md](../../docs/ambiente-leve.md) — Ambiente leve (notebook de 8 GB no Linux)
- [docs/api.md](../../docs/api.md) — API pública do Balbina (v1)
- [docs/app-celular.md](../../docs/app-celular.md) — App Balbina para iOS e Android
- [docs/asaas-producao.md](../../docs/asaas-producao.md) — Asaas em produção
- [docs/automacoes.md](../../docs/automacoes.md) — Automações da operação
- [docs/backup.md](../../docs/backup.md) — Backup do banco
- [docs/codigo/README.md](../../docs/codigo/README.md) — Documentação do código do Balbina
- [docs/codigo/arquitetura.md](../../docs/codigo/arquitetura.md) — Arquitetura
- [docs/codigo/banco.md](../../docs/codigo/banco.md) — Banco de dados
- [docs/codigo/convencoes.md](../../docs/codigo/convencoes.md) — Convenções: como escrever código no Balbina
- [docs/codigo/integracoes.md](../../docs/codigo/integracoes.md) — Integrações
- [docs/codigo/modulos.md](../../docs/codigo/modulos.md) — Módulos
- [docs/codigo/testes-e-operacao.md](../../docs/codigo/testes-e-operacao.md) — Testes e operação
- [docs/colocar-no-ar.md](../../docs/colocar-no-ar.md) — Colocar o Balbina no ar (do zero)
- [docs/dominio-proprio.md](../../docs/dominio-proprio.md) — Trocar o endereço do app para um domínio próprio
- [docs/estudos/open-finance-alternativas.md](../../docs/estudos/open-finance-alternativas.md) — Open Finance: alternativas ao Pluggy (estudo, 2026-11-02)
- [docs/ferramentas-claude.md](../../docs/ferramentas-claude.md) — Ferramentas do Claude Code neste repositório
- [docs/fluxo-de-trabalho.md](../../docs/fluxo-de-trabalho.md) — Fluxo de trabalho: Teste-Desevolvimento → produção
- [docs/legado/README.md](../../docs/legado/README.md) — Legado
- [docs/legado/balbina-backend/README.md](../../docs/legado/balbina-backend/README.md) — Backend - Balbina Agro V1
- [docs/legado/balbina-campo/README.md](../../docs/legado/balbina-campo/README.md) — Frontend - Balbina Agro V1
- [docs/legado/balbina-campo/android/app/src/main/assets/public/index.html](../../docs/legado/balbina-campo/android/app/src/main/assets/public/index.html) — Balbina Agro
- [docs/legado/balbina-campo/index.html](../../docs/legado/balbina-campo/index.html) — Balbina Agro
- [docs/legado/balbina-gestao/README.md](../../docs/legado/balbina-gestao/README.md) — Balbina Gestão
- [docs/legado/balbina-gestao/index.html](../../docs/legado/balbina-gestao/index.html) — Balbina Agro
- [docs/legado/balbina-v1/# Índice de Documentação — V1.md](../../docs/legado/balbina-v1/%23%20%C3%8Dndice%20de%20Documenta%C3%A7%C3%A3o%20%E2%80%94%20V1.md) — Indice de Documentacao - V1
- [docs/legado/balbina-v1/CLAUDE-antigo.md](../../docs/legado/balbina-v1/CLAUDE-antigo.md) — Arquitetura Monorepo - Balbina Agro
- [docs/legado/balbina-v1/DOCUMENTACAO_COMPLETA_V1.md](../../docs/legado/balbina-v1/DOCUMENTACAO_COMPLETA_V1.md) — Balbina Agro V1 - Documentacao Completa
- [docs/legado/balbina-v1/README.md](../../docs/legado/balbina-v1/README.md) — Balbina Agro V1
- [docs/legado/balbina-v1/V1 — ESCOPO FECHADO — Sistema.md](../../docs/legado/balbina-v1/V1%20%E2%80%94%20ESCOPO%20FECHADO%20%E2%80%94%20Sistema.md) — V1 — ESCOPO FECHADO — Sistema.md
- [docs/legado/finavi/migrar-sao-paulo.md](../../docs/legado/finavi/migrar-sao-paulo.md) — Mudar o servidor para São Paulo
- [docs/legado/finavi/replica/architecture.md](../../docs/legado/finavi/replica/architecture.md) — Arquitetura: ERP Avicultura de Postura
- [docs/legado/finavi/replica/recon.md](../../docs/legado/finavi/replica/recon.md) — Recon map: NIBO (financeiro) + PosturaWeb (avicultura de postura) — web
- [docs/nfe.md](../../docs/nfe.md) — NF-e e NFC-e (Focus NFe)
- [docs/offline.md](../../docs/offline.md) — Balbina sem internet
- [docs/piscicultura.md](../../docs/piscicultura.md) — Piscicultura no Balbina
- [docs/plano-de-categorias.md](../../docs/plano-de-categorias.md) — Plano de categorias da piscicultura
- [docs/pontos-de-venda.md](../../docs/pontos-de-venda.md) — Pontos de venda
- [docs/rodar-local.md](../../docs/rodar-local.md) — Rodar o Balbina na sua máquina
- [docs/seguranca-e-assinatura.md](../../docs/seguranca-e-assinatura.md) — Segurança e assinatura (SaaS)
- [docs/site-de-teste.md](../../docs/site-de-teste.md) — Site de teste (preview do `Teste-Desevolvimento`)
- [docs/tutoriais.md](../../docs/tutoriais.md) — Tutoriais por tela (balões guiados)
