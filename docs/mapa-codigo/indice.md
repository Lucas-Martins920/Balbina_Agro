# Índice alfabético

> Parte do [mapa do código](README.md). Gerado por `scripts/mapa-codigo.mjs`; não edite à mão, rode `npm run mapa`.

Só os nomes exportados (usáveis por outros arquivos). Os internos aparecem em [Código por domínio](codigo-por-dominio.md) e na busca do mapa.html.

| Nome | Tipo | Onde | Domínio | Usado em |
|---|---|---|---|---|
| `_reiniciarArmazem` | função | `src/lib/db/indexeddb.ts:238` | Comum | 1 arquivo |
| `Aba` | tipo | `src/app/(app)/conciliacao/abas.tsx:5` | Financeiro | 1 arquivo |
| `Aba` | tipo | `src/components/campo/contexto.tsx:26` | Produção | 1 arquivo |
| `abaCsv` | função | `src/lib/importacao-modelo.ts:824` | Importação | 2 arquivos |
| `AbaLida` | tipo | `src/lib/importacao-modelo.ts:280` | Importação | 3 arquivos |
| `AbaPlanilha` | tipo | `src/lib/planilha.ts:83` | Comum | — |
| `AbaProduto` | tipo | `src/lib/estoque.ts:33` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `Abas` | componente | `src/app/(app)/conciliacao/abas.tsx:8` | Financeiro | 1 arquivo |
| `ABAS_PRODUTO` | constante | `src/lib/estoque.ts:25` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `AbasFiltro` | componente | `src/components/cadastro.tsx:522` | Comum | 10 arquivos |
| `AbasPlanejamento` | componente | `src/app/(app)/planejamento/linha-do-tempo.tsx:9` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `AbasRelatorio` | componente | `src/app/(app)/relatorios/abas.tsx:7` | Planejamento, previsões, custo do kg e relatórios | 8 arquivos |
| `abaTabela` | função | `src/lib/planilha.ts:117` | Comum | — |
| `abaTitulos` | função | `src/lib/planilha.ts:192` | Comum | 3 arquivos |
| `abrirArmazem` | função | `src/lib/db/indexeddb.ts:137` | Comum | 1 arquivo |
| `abrirLancamento` | função | `e2e/apoio.ts:112` | Comum | 5 arquivos |
| `abrirLoteCampo` | função | `src/lib/campo/servidor.ts:156` | Produção | 1 arquivo |
| `AbrirLoteCampo` | tipo | `src/lib/campo/validar.ts:94` | Produção | — |
| `abrirSubconta` | ação | `src/app/(app)/cobrancas/conta-actions.ts:66` | Cobrança | 1 arquivo |
| `Acao` | tipo | `src/lib/historico.ts:4` | Login, segurança, usuários e permissões | 1 arquivo |
| `Acao` | tipo | `src/lib/permissoes-regras.ts:10` | Login, segurança, usuários e permissões | — |
| `AcaoConfirmada` | componente | `src/components/acao-confirmada.tsx:18` | Comum | 11 arquivos |
| `acaoEmLote` | ação | `src/app/(app)/_titulos/actions.ts:218` | Financeiro | 1 arquivo |
| `AcaoFolha` | tipo | `src/components/campo/contexto.tsx:27` | Produção | 3 arquivos |
| `AcaoRapida` | tipo | `src/components/cadastro.tsx:49` | Comum | — |
| `AcaoWebhook` | tipo | `src/lib/asaas-mapa.ts:85` | Cobrança | — |
| `aceitar_convites` | função SQL | `supabase/migrations/20261029213000_cargos.sql:249` | Login, segurança, usuários e permissões | 5 arquivos |
| `aceitar_termos` | função SQL | `supabase/migrations/20261027123500_termos_e_seguranca.sql:24` | Login, segurança, usuários e permissões | 1 arquivo |
| `aceitarConvites` | função | `src/lib/empresa.ts:28` | Início, painel, ajuda e configurações | — |
| `aceitarTermos` | ação | `src/app/aceitar-termos/actions.ts:9` | Login, segurança, usuários e permissões | 1 arquivo |
| `aceites_termos` | tabela | `supabase/migrations/20261027123500_termos_e_seguranca.sql:9` | Login, segurança, usuários e permissões | 1 arquivo |
| `Acesso` | tipo | `src/lib/permissoes-regras.ts:6` | Login, segurança, usuários e permissões | 6 arquivos |
| `AcessoApi` | tipo | `src/lib/api/regras.ts:46` | API pública, webhooks e rotinas agendadas | — |
| `ACOES` | constante | `src/lib/historico.ts:6` | Login, segurança, usuários e permissões | 1 arquivo |
| `AcoesMovimento` | componente | `src/app/(app)/conciliacao/acoes-movimento.tsx:29` | Financeiro | 1 arquivo |
| `Agenda` | classe | `src/lib/planejamento.ts:152` | Planejamento, previsões, custo do kg e relatórios | — |
| `agendamento_rateios` | tabela | `supabase/migrations/20261026000001_schema.sql:238` | Financeiro | 1 arquivo |
| `agendamentos` | tabela | `supabase/migrations/20261026000001_schema.sql:195` | Financeiro | 7 arquivos |
| `agendar_titulo` | função SQL | `supabase/migrations/20261102031000_rateio_conciliacao.sql:45` | Financeiro | 2 arquivos |
| `agendarTitulo` | ação | `src/app/(app)/_titulos/actions.ts:18` | Financeiro | 1 arquivo |
| `aging_titulos` | view | `supabase/migrations/20261028060000_fuso_da_empresa.sql:1088` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `agoraComFuso` | função | `src/lib/focus-mapa.ts:198` | Fiscal | 2 arquivos |
| `agruparPorEmbalagem` | função | `src/lib/pescado.ts:93` | Comum | 2 arquivos |
| `Agua` | tipo | `src/lib/agua.ts:8` | Comum | 6 arquivos |
| `AJUDA` | constante | `src/lib/whatsapp-texto.ts:84` | Comum | 1 arquivo |
| `ajustar_entrada_racao` | função SQL | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:517` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `ajustar_estoque_peixe` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:632` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `ajustarEntradaRacao` | ação | `src/app/(app)/racao/actions.ts:55` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `AlertaPrevisao` | tipo | `src/lib/previsao-dados.ts:32` | Planejamento, previsões, custo do kg e relatórios | — |
| `alertas` | view | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:370` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `alertas_seguranca` | função SQL | `supabase/migrations/20261030140000_alarmes_seguranca.sql:72` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `alertasTendencia` | função | `src/lib/previsao.ts:162` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `AlertaTendencia` | tipo | `src/lib/previsao.ts:106` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `Alocacao` | tipo | `src/app/(app)/lotes/[id]/viveiros.tsx:11` | Produção | 1 arquivo |
| `alocacoes_atuais` | view | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:206` | Produção | 15 arquivos |
| `alterar_webhook_api` | função SQL | `supabase/migrations/20261028233000_api_publica.sql:171` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `alterarWebhook` | ação | `src/app/(app)/configuracoes/api/actions.ts:62` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `alternarAjuda` | função | `src/components/tutorial.tsx:39` | Início, painel, ajuda e configurações | 1 arquivo |
| `alternarItemChecklist` | ação | `src/app/(app)/apontamentos/actions.ts:209` | Produção | 1 arquivo |
| `alternarPedidoFixo` | ação | `src/app/(app)/vendas/fixos/actions.ts:39` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `alternarRegra` | ação | `src/app/(app)/conciliacao/actions.ts:321` | Financeiro | 1 arquivo |
| `alternarSelecao` | função | `src/lib/selecao-lote.ts:5` | Produção | 1 arquivo |
| `alternarTodos` | função | `src/lib/selecao-lote.ts:13` | Produção | 1 arquivo |
| `ambiente` | função | `src/lib/ambiente.ts:10` | Início, painel, ajuda e configurações | 3 arquivos |
| `AmbienteAsaas` | tipo | `src/lib/asaas-mapa.ts:10` | Cobrança | — |
| `ambienteAsaas` | função | `src/lib/asaas-mapa.ts:13` | Cobrança | 3 arquivos |
| `ambienteDaChave` | função | `src/lib/asaas-mapa.ts:23` | Cobrança | 2 arquivos |
| `AmbienteFocus` | tipo | `src/lib/focus.ts:6` | Fiscal | — |
| `ambienteFocus` | função | `src/lib/focus.ts:7` | Fiscal | 2 arquivos |
| `amoniaToxica` | função | `src/lib/agua.ts:53` | Comum | 1 arquivo |
| `amostraBiometria` | função | `src/lib/previsao-racao.ts:384` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `Analise` | tipo | `src/lib/analise-periodo.ts:263` | Planejamento, previsões, custo do kg e relatórios | 4 arquivos |
| `analiseHorizontal` | função | `src/lib/relatorios.ts:67` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `AnalisePeriodo` | componente | `src/app/(app)/relatorios/periodo/page.tsx:17` | Planejamento, previsões, custo do kg e relatórios | — |
| `analiseVertical` | função | `src/lib/relatorios.ts:62` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `aoFalharGravacao` | função | `src/lib/db/indexeddb.ts:233` | Comum | — |
| `aoVoltarConexao` | função | `src/lib/sync/detector.ts:72` | Comum | 2 arquivos |
| `apagar_cargo` | função SQL | `supabase/migrations/20261102160000_remover_rh.sql:46` | Login, segurança, usuários e permissões | 1 arquivo |
| `apagar_conciliacao` | função SQL | `supabase/migrations/20261029080000_desconciliar_e_apagar_extrato.sql:184` | Financeiro | — |
| `apagar_movimento_extrato` | função SQL | `supabase/migrations/20261029080000_desconciliar_e_apagar_extrato.sql:202` | Financeiro | — |
| `apagarCargo` | ação | `src/app/(app)/configuracoes/usuarios/actions.ts:183` | Login, segurança, usuários e permissões | 1 arquivo |
| `apagarConciliacao` | ação | `src/app/(app)/conciliacao/actions.ts:201` | Financeiro | 1 arquivo |
| `apagarDoExtrato` | ação | `src/app/(app)/conciliacao/actions.ts:205` | Financeiro | 1 arquivo |
| `apagarItem` | função | `src/lib/db/indexeddb.ts:211` | Comum | — |
| `api_autenticar` | função SQL | `supabase/migrations/20261030140000_alarmes_seguranca.sql:41` | Comum | 1 arquivo |
| `api_chaves` | tabela | `supabase/migrations/20261028233000_api_publica.sql:38` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `api_chaves_uso` | tabela | `supabase/migrations/20261028233000_api_publica.sql:54` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `api_dentro_do_limite` | função SQL | `supabase/migrations/20261104010000_api_rate_limit_no_banco.sql:16` | Comum | 1 arquivo |
| `api_registrar_entrega` | função SQL | `supabase/migrations/20261028233000_api_publica.sql:239` | Comum | 1 arquivo |
| `api_reservar_entregas` | função SQL | `supabase/migrations/20261028233000_api_publica.sql:214` | Comum | 1 arquivo |
| `api_webhook` | trigger | `supabase/migrations/20261028233000_api_publica.sql:299` | Financeiro | — |
| `api_webhook` | trigger | `supabase/migrations/20261028233000_api_publica.sql:301` | Vendas, PDV, estoque, produtos e ração | — |
| `api_webhook` | trigger | `supabase/migrations/20261028233000_api_publica.sql:303` | Financeiro | — |
| `api_webhook` | trigger | `supabase/migrations/20261028233000_api_publica.sql:305` | Vendas, PDV, estoque, produtos e ração | — |
| `api_webhook` | trigger | `supabase/migrations/20261028233000_api_publica.sql:307` | Vendas, PDV, estoque, produtos e ração | — |
| `api_webhook_entregas` | tabela | `supabase/migrations/20261028233000_api_publica.sql:72` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `api_webhooks` | tabela | `supabase/migrations/20261028233000_api_publica.sql:59` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `aplicar` | trigger | `supabase/migrations/20261029200000_equipamentos_manutencao.sql:219` | Manutenções | — |
| `aplicar_plano_categorias` | função SQL | `supabase/migrations/20261102030000_plano_categorias_piscicultura.sql:194` | Cobrança | — |
| `aplicar_regras` | função SQL | `supabase/migrations/20261102050000_importar_extrato_em_partes.sql:101` | Financeiro | — |
| `aplicar_regras_lote` | função SQL | `supabase/migrations/20261103180000_saldo_so_ao_lancar.sql:103` | Produção | 2 arquivos |
| `aplicarAjuste` | função | `src/lib/vendas.ts:104` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `aplicarCentrosPadrao` | ação | `src/app/(app)/centros-de-custo/actions.ts:66` | Financeiro | 1 arquivo |
| `aplicarPlanoPadrao` | ação | `src/app/(app)/categorias/actions.ts:87` | Financeiro | 1 arquivo |
| `aplicarRegras` | ação | `src/app/(app)/conciliacao/actions.ts:221` | Financeiro | 1 arquivo |
| `aplicarRegrasEmPartes` | função | `src/lib/regras-em-partes.ts:9` | Financeiro | 3 arquivos |
| `aplicarSugestaoMeta` | ação | `src/app/(app)/planejamento/actions.ts:176` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `apontamento_checklist` | tabela | `supabase/migrations/20261029064500_checklist_e_racao_no_apontamento.sql:44` | Produção | 1 arquivo |
| `apontamento_lancamentos` | tabela | `supabase/migrations/20261027123000_apontamento_por_turno.sql:76` | Produção | 4 arquivos |
| `apontamento_racoes` | tabela | `supabase/migrations/20261029064500_checklist_e_racao_no_apontamento.sql:99` | Produção | 1 arquivo |
| `ApontamentoCampo` | tipo | `src/lib/apontamento-campo.ts:6` | Produção | — |
| `apontamentoDoTurno` | função | `src/lib/campo/fila.ts:102` | Produção | 3 arquivos |
| `apontamentos_diarios` | tabela | `supabase/migrations/20261026000001_schema.sql:680` | Produção | 2 arquivos |
| `apontamentos_lixeira` | tabela | `supabase/migrations/20261101120000_apagar_apontamentos.sql:42` | Produção | 1 arquivo |
| `app.amonia_toxica` | função SQL | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:30` | Comum | — |
| `app.api_chave_atual` | função SQL | `supabase/migrations/20261028233000_api_publica.sql:315` | API pública, webhooks e rotinas agendadas | — |
| `app.api_enfileirar_evento` | função SQL | `supabase/migrations/20261028233000_api_publica.sql:273` | Comum | — |
| `app.api_escopos` | função SQL | `supabase/migrations/20261028233000_api_publica.sql:21` | Comum | — |
| `app.api_eventos` | função SQL | `supabase/migrations/20261028233000_api_publica.sql:28` | Comum | — |
| `app.api_rate_limit` | tabela | `supabase/migrations/20261104010000_api_rate_limit_no_banco.sql:7` | Comum | — |
| `app.api_rate_limit_limpar` | função SQL | `supabase/migrations/20261104010000_api_rate_limit_no_banco.sql:25` | Comum | — |
| `app.aplicar_plano_categorias` | função SQL | `supabase/migrations/20261102030000_plano_categorias_piscicultura.sql:115` | Cobrança | — |
| `app.aplicar_regra_movimento` | função SQL | `supabase/migrations/20261103020000_cancelar_importacao_e_duplicados.sql:318` | Financeiro | — |
| `app.assinatura_inicial` | função SQL | `supabase/migrations/20261027050000_assinaturas.sql:85` | Cobrança | — |
| `app.assinatura_libera` | função SQL | `supabase/migrations/20261027050000_assinaturas.sql:42` | Cobrança | — |
| `app.atualiza_saldo_agendamento` | função SQL | `supabase/migrations/20261029001000_zerar_financeiro.sql:26` | Financeiro | — |
| `app.atualizar_custo_medio` | função SQL | `supabase/migrations/20261026000009_racao_cartao_comercial.sql:23` | Planejamento, previsões, custo do kg e relatórios | — |
| `app.baixar_embalagens` | função SQL | `supabase/migrations/20261101120500_automacoes_estoque.sql:46` | Financeiro | — |
| `app.baixar_racao` | função SQL | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:219` | Vendas, PDV, estoque, produtos e ração | — |
| `app.biomassa_lote` | função SQL | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:24` | Produção | — |
| `app.bloqueia_periodo_fechado` | função SQL | `supabase/migrations/20261026000001_schema.sql:340` | Comum | — |
| `app.bloqueia_prazo_inadimplente` | função SQL | `supabase/migrations/20261101170000_automacoes_vendas.sql:133` | Comum | — |
| `app.carencia_ate` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:509` | Produção | — |
| `app.carimba_custo_planejamento` | função SQL | `supabase/migrations/20261027193500_planejamento.sql:164` | Planejamento, previsões, custo do kg e relatórios | — |
| `app.carregar_padroes` | função SQL | `supabase/migrations/20261105000005_piscicultura_cadastros.sql:141` | Comum | — |
| `app.categoria_no_fim` | função SQL | `supabase/migrations/20261101153000_ordem_categorias_centros.sql:30` | Financeiro | — |
| `app.causas_morte_validas` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:31` | Produção | — |
| `app.cc_automatico` | função SQL | `supabase/migrations/20261026000003_producao_e_titulos.sql:8` | Comum | — |
| `app.cc_remover_orfao` | função SQL | `supabase/migrations/20261027010000_cadastros.sql:159` | Comum | — |
| `app.cc_renomear` | função SQL | `supabase/migrations/20261027010000_cadastros.sql:135` | Comum | — |
| `app.centro_custo_no_fim` | função SQL | `supabase/migrations/20261101153000_ordem_categorias_centros.sql:50` | Planejamento, previsões, custo do kg e relatórios | — |
| `app.chave_celular` | função SQL | `supabase/migrations/20261101200000_whatsapp.sql:15` | Comum | — |
| `app.chave_descricao` | função SQL | `supabase/migrations/20261026210000_open_finance_conciliacao.sql:40` | Comum | — |
| `app.chave_extrato` | função SQL | `supabase/migrations/20261103020000_cancelar_importacao_e_duplicados.sql:37` | Financeiro | — |
| `app.chave_lancamento` | função SQL | `supabase/migrations/20261101110000_automacoes_financeiro.sql:29` | Financeiro | — |
| `app.chaves_membro` | função SQL | `supabase/migrations/20261029213000_cargos.sql:92` | Comum | — |
| `app.checa_mesma_empresa` | função SQL | `supabase/migrations/20261028050000_isolamento_entre_empresas.sql:15` | Início, painel, ajuda e configurações | — |
| `app.checa_perfil_da_cobranca` | função SQL | `supabase/migrations/20261027123500_termos_e_seguranca.sql:80` | Cobrança | — |
| `app.checa_rateio` | função SQL | `supabase/migrations/20261026000001_schema.sql:252` | Financeiro | — |
| `app.checa_rateio_do_titulo` | função SQL | `supabase/migrations/20261026000001_schema.sql:272` | Financeiro | — |
| `app.checa_vinculo_importacao` | função SQL | `supabase/migrations/20261028050000_isolamento_entre_empresas.sql:56` | Importação | — |
| `app.checklist_padrao` | função SQL | `supabase/migrations/20261105000001_piscicultura_estrutura.sql:280` | Comum | — |
| `app.checklist_padrao_empresa` | função SQL | `supabase/migrations/20261029064500_checklist_e_racao_no_apontamento.sql:83` | Início, painel, ajuda e configurações | — |
| `app.classe_sem_classificacao` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:62` | Produção | — |
| `app.classe_sem_classificacao_empresa` | função SQL | `supabase/migrations/20261027123000_apontamento_por_turno.sql:36` | Produção | — |
| `app.cliente_do_portal` | função SQL | `supabase/migrations/20261101190000_lcdpr_portal_cliente.sql:72` | Comum | — |
| `app.condicao_casa` | função SQL | `supabase/migrations/20261029150000_regra_ignorar.sql:28` | Comum | — |
| `app.confere_ficha_embalagem` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:162` | Fiscal | — |
| `app.confere_inutilizacao` | função SQL | `supabase/migrations/20261029140000_nfe_completa.sql:131` | Fiscal | — |
| `app.confere_lote_planejado` | função SQL | `supabase/migrations/20261105000001_piscicultura_estrutura.sql:306` | Fiscal | — |
| `app.confere_parametros_planejamento` | função SQL | `supabase/migrations/20261027193500_planejamento.sql:148` | Planejamento, previsões, custo do kg e relatórios | — |
| `app.conferir_grupos_biometria` | função SQL | `supabase/migrations/20261111000004_biometria_grupos.sql:51` | Fiscal | — |
| `app.conferir_ponto_venda` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:260` | Fiscal | — |
| `app.conferir_saldo_peixe` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:284` | Fiscal | — |
| `app.config_fiscal` | função SQL | `supabase/migrations/20261029140000_nfe_completa.sql:37` | Comum | — |
| `app.consumidor_final` | função SQL | `supabase/migrations/20261026233000_vendas_pdv.sql:11` | Comum | — |
| `app.conta_caixa` | função SQL | `supabase/migrations/20261026233000_vendas_pdv.sql:24` | Financeiro | — |
| `app.contato_lista_preco` | função SQL | `supabase/migrations/20261027133000_tabelas_de_preco.sql:129` | Vendas, PDV, estoque, produtos e ração | — |
| `app.convite_sem_login_local` | função SQL | `supabase/migrations/20261029223000_login_local.sql:93` | Login, segurança, usuários e permissões | — |
| `app.custo_kg_entrada` | função SQL | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:96` | Planejamento, previsões, custo do kg e relatórios | — |
| `app.deposito_de_ponto` | função SQL | `supabase/migrations/20261029173000_pontos_de_venda.sql:202` | RH e cartão de ponto | — |
| `app.deposito_padrao` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:188` | Vendas, PDV, estoque, produtos e ração | — |
| `app.deposito_peixe` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:248` | Vendas, PDV, estoque, produtos e ração | — |
| `app.desfaz_despesca_estoque` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:432` | Vendas, PDV, estoque, produtos e ração | — |
| `app.dispensa_2fa_valida` | função SQL | `supabase/migrations/20261029223000_login_local.sql:55` | Login, segurança, usuários e permissões | — |
| `app.dominio_login_local` | função SQL | `supabase/migrations/20261029223000_login_local.sql:18` | Login, segurança, usuários e permissões | — |
| `app.e_master` | função SQL | `supabase/migrations/20261028040000_auditoria_correcoes.sql:6` | Comum | — |
| `app.empresa_liberada` | função SQL | `supabase/migrations/20261027050000_assinaturas.sql:49` | Início, painel, ajuda e configurações | — |
| `app.empresas_master` | função SQL | `supabase/migrations/20261031040000_lapidacao_advisors.sql:39` | Início, painel, ajuda e configurações | — |
| `app.empresas_onde_pode` | função SQL | `supabase/migrations/20261028203000_desempenho.sql:27` | Início, painel, ajuda e configurações | — |
| `app.empresas_vinculadas` | função SQL | `supabase/migrations/20261027154700_mfa.sql:13` | Início, painel, ajuda e configurações | — |
| `app.entrada_no_grupo` | função SQL | `supabase/migrations/20261029183000_venda_entre_empresas.sql:31` | Comum | — |
| `app.evento_devolver_estoque` | função SQL | `supabase/migrations/20261029073000_medicamentos.sql:110` | Vendas, PDV, estoque, produtos e ração | — |
| `app.exige_master` | função SQL | `supabase/migrations/20261028233000_api_publica.sql:119` | Comum | — |
| `app.exige_pode_titulos` | função SQL | `supabase/migrations/20261028190000_acoes_titulos.sql:6` | Financeiro | — |
| `app.exige_produto_de_venda` | função SQL | `supabase/migrations/20261102170000_produtos_para_venda.sql:35` | Vendas, PDV, estoque, produtos e ração | — |
| `app.exige_um_master` | função SQL | `supabase/migrations/20261026000011_usuarios_permissoes.sql:138` | Comum | — |
| `app.exigir_2fa` | função SQL | `supabase/migrations/20261028034500_mfa_obrigatorio.sql:13` | Login, segurança, usuários e permissões | — |
| `app.exigir_master_com_codigo` | função SQL | `supabase/migrations/20261029080000_desconciliar_e_apagar_extrato.sql:173` | Comum | — |
| `app.faixa_arracoamento` | função SQL | `supabase/migrations/20261105000001_piscicultura_estrutura.sql:225` | Comum | — |
| `app.fase_do_viveiro` | função SQL | `supabase/migrations/20261105000001_piscicultura_estrutura.sql:294` | Comum | — |
| `app.fator_unidade` | função SQL | `supabase/migrations/20261029073000_medicamentos.sql:51` | Comum | — |
| `app.fechamento_da_fatura` | função SQL | `supabase/migrations/20261026000009_racao_cartao_comercial.sql:199` | Comum | — |
| `app.fuso_empresa` | função SQL | `supabase/migrations/20261028203000_desempenho.sql:7` | Início, painel, ajuda e configurações | — |
| `app.gerar_recorrencias_base` | função SQL | `supabase/migrations/20261028060000_fuso_da_empresa.sql:25` | Financeiro | — |
| `app.gerar_recorrencias_todas` | função SQL | `supabase/migrations/20261030220000_recorrencias_no_cron.sql:5` | Financeiro | — |
| `app.gravar_grupos_biometria` | função SQL | `supabase/migrations/20261111000004_biometria_grupos.sql:73` | Comum | — |
| `app.gravar_rateio` | função SQL | `supabase/migrations/20261102031000_rateio_conciliacao.sql:135` | Financeiro | — |
| `app.historico_movimento` | função SQL | `supabase/migrations/20261101110000_automacoes_financeiro.sql:35` | Login, segurança, usuários e permissões | — |
| `app.hoje` | função SQL | `supabase/migrations/20261028203000_desempenho.sql:13` | Comum | — |
| `app.hoje_brasil` | função SQL | `supabase/migrations/20261027050000_assinaturas.sql:37` | Comum | — |
| `app.idade_equivalente` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:650` | Comum | — |
| `app.importar_baixa` | função SQL | `supabase/migrations/20261029030000_importacao_baixa_a_mais.sql:7` | Importação | — |
| `app.importar_categoria` | função SQL | `supabase/migrations/20261028010000_importacao_grupo_categoria.sql:6` | Importação | — |
| `app.importar_centro` | função SQL | `supabase/migrations/20261027140000_importacao.sql:84` | Importação | — |
| `app.ja_lancados` | função SQL | `supabase/migrations/20261103020000_cancelar_importacao_e_duplicados.sql:121` | Comum | — |
| `app.lembrar_produto_fornecedor` | função SQL | `supabase/migrations/20261103010000_padroes_e_estoque_na_conciliacao.sql:255` | Vendas, PDV, estoque, produtos e ração | — |
| `app.ligar_historico` | função SQL | `supabase/migrations/20261028201500_historico_alteracoes.sql:97` | Login, segurança, usuários e permissões | — |
| `app.limpa_regra_ao_voltar` | função SQL | `supabase/migrations/20261029150000_regra_ignorar.sql:108` | Comum | — |
| `app.lista_preco_inicial` | função SQL | `supabase/migrations/20261027133000_tabelas_de_preco.sql:67` | Vendas, PDV, estoque, produtos e ração | — |
| `app.login_local_uma_empresa` | função SQL | `supabase/migrations/20261029223000_login_local.sql:82` | Login, segurança, usuários e permissões | — |
| `app.lote_sem_historico` | função SQL | `supabase/migrations/20261105000005_piscicultura_cadastros.sql:176` | Produção | — |
| `app.marcar_aviso` | função SQL | `supabase/migrations/20261101130000_automacoes_resumo.sql:43` | Comum | — |
| `app.marcar_categoria_sistema` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:823` | Financeiro | — |
| `app.marcar_componente_custo` | função SQL | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:56` | Planejamento, previsões, custo do kg e relatórios | — |
| `app.medicamento_conferir` | função SQL | `supabase/migrations/20261029073000_medicamentos.sql:72` | Fiscal | — |
| `app.mes_fechado` | função SQL | `supabase/migrations/20261026000001_schema.sql:297` | Comum | — |
| `app.mfa_em_dia` | função SQL | `supabase/migrations/20261029223000_login_local.sql:63` | Login, segurança, usuários e permissões | — |
| `app.mfa_recente` | função SQL | `supabase/migrations/20261029001000_zerar_financeiro.sql:16` | Login, segurança, usuários e permissões | — |
| `app.minhas_empresas` | função SQL | `supabase/migrations/20261027154700_mfa.sql:18` | Início, painel, ajuda e configurações | — |
| `app.modulos_sensiveis` | função SQL | `supabase/migrations/20261029223000_login_local.sql:38` | Comum | — |
| `app.motivo_valido` | função SQL | `supabase/migrations/20261029080000_desconciliar_e_apagar_extrato.sql:130` | Comum | — |
| `app.movimentar_racao` | função SQL | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:343` | Vendas, PDV, estoque, produtos e ração | — |
| `app.movimento_pendente` | função SQL | `supabase/migrations/20261104020000_conciliacao_multipla.sql:10` | Financeiro | — |
| `app.nivel_empresa` | função SQL | `supabase/migrations/20261027224100_planos_balbina.sql:55` | Início, painel, ajuda e configurações | — |
| `app.nome_chave` | função SQL | `supabase/migrations/20261027140000_importacao.sql:38` | Comum | — |
| `app.nome_pescado` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:90` | Comum | — |
| `app.num_br` | função SQL | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:363` | Comum | — |
| `app.numero_agua` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:84` | Comum | — |
| `app.ordem_fase` | função SQL | `supabase/migrations/20261105000001_piscicultura_estrutura.sql:300` | Comum | — |
| `app.pagamentos_so_master` | função SQL | `supabase/migrations/20261101230000_pagamentos_asaas.sql:18` | Comum | — |
| `app.parametros` | tabela | `supabase/migrations/20261028034500_mfa_obrigatorio.sql:9` | Comum | — |
| `app.passo_feito` | função SQL | `supabase/migrations/20261029101500_assistente_inicio.sql:27` | Comum | — |
| `app.passo_recorrencia` | função SQL | `supabase/migrations/20261026000004_financeiro_base.sql:35` | Financeiro | — |
| `app.passos_assistente` | função SQL | `supabase/migrations/20261029101500_assistente_inicio.sql:21` | Início, painel, ajuda e configurações | — |
| `app.peixes_lote` | função SQL | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:13` | Produção | — |
| `app.peixes_no_viveiro` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:692` | Comum | — |
| `app.perfil_asaas` | função SQL | `supabase/migrations/20261101230000_pagamentos_asaas.sql:64` | Cobrança | — |
| `app.perfil_com_cargo` | função SQL | `supabase/migrations/20261029213000_cargos.sql:141` | Login, segurança, usuários e permissões | — |
| `app.perfis_validos` | função SQL | `supabase/migrations/20261029213000_cargos.sql:18` | Comum | — |
| `app.permissoes_perfil` | função SQL | `supabase/migrations/20261103120000_remover_manutencao.sql:9` | Login, segurança, usuários e permissões | — |
| `app.peso_curva` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:635` | Produção | — |
| `app.peso_estimado` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:664` | Comum | — |
| `app.plano_categorias` | função SQL | `supabase/migrations/20261105000005_piscicultura_cadastros.sql:6` | Financeiro | — |
| `app.plano_categorias_mudancas` | função SQL | `supabase/migrations/20261102030000_plano_categorias_piscicultura.sql:99` | Financeiro | — |
| `app.plano_centros_custo` | função SQL | `supabase/migrations/20261105000005_piscicultura_cadastros.sql:102` | Financeiro | — |
| `app.plano_inclui` | função SQL | `supabase/migrations/20261027224100_planos_balbina.sql:63` | Comum | — |
| `app.pode` | função SQL | `supabase/migrations/20261029213000_cargos.sql:100` | Comum | — |
| `app.pode_algum` | função SQL | `supabase/migrations/20261026000011_usuarios_permissoes.sql:64` | Comum | — |
| `app.pode_dispensar_2fa` | função SQL | `supabase/migrations/20261029223000_login_local.sql:45` | Login, segurança, usuários e permissões | — |
| `app.pode_mexer_lancamento` | função SQL | `supabase/migrations/20261101120000_apagar_apontamentos.sql:14` | Financeiro | — |
| `app.pode_titulo` | função SQL | `supabase/migrations/20261029224500_titulos_por_modulo.sql:30` | Financeiro | — |
| `app.pode_titulo_linha` | função SQL | `supabase/migrations/20261029224500_titulos_por_modulo.sql:14` | Financeiro | — |
| `app.ponto_da_venda` | função SQL | `supabase/migrations/20261029173000_pontos_de_venda.sql:568` | Vendas, PDV, estoque, produtos e ração | — |
| `app.ponto_sede` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:201` | Comum | — |
| `app.preco_na_lista` | função SQL | `supabase/migrations/20261027133000_tabelas_de_preco.sql:102` | Vendas, PDV, estoque, produtos e ração | — |
| `app.produto_base_peixe` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:95` | Vendas, PDV, estoque, produtos e ração | — |
| `app.produto_para_venda_padrao` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:130` | Vendas, PDV, estoque, produtos e ração | — |
| `app.produtos_da_classe` | função SQL | `supabase/migrations/20261105000005_piscicultura_cadastros.sql:386` | Vendas, PDV, estoque, produtos e ração | — |
| `app.produtos_venda_peixe` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:112` | Vendas, PDV, estoque, produtos e ração | — |
| `app.protege_categoria_sistema` | função SQL | `supabase/migrations/20261027010000_cadastros.sql:75` | Financeiro | — |
| `app.protege_credenciais` | função SQL | `supabase/migrations/20261027130000_contas_asaas.sql:37` | Comum | — |
| `app.protege_exclusao_conta` | função SQL | `supabase/migrations/20261029040000_excluir_conta.sql:8` | Financeiro | — |
| `app.protege_ids_integracao` | função SQL | `supabase/migrations/20261027123500_termos_e_seguranca.sql:53` | Vendas, PDV, estoque, produtos e ração | — |
| `app.protege_lista_preco` | função SQL | `supabase/migrations/20261027133000_tabelas_de_preco.sql:38` | Vendas, PDV, estoque, produtos e ração | — |
| `app.protege_produto` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:139` | Vendas, PDV, estoque, produtos e ração | — |
| `app.protege_sem_classificacao` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:75` | Produção | — |
| `app.pula_movimento_apagado` | função SQL | `supabase/migrations/20261029080000_desconciliar_e_apagar_extrato.sql:42` | Financeiro | — |
| `app.racao_apontamento_estoque` | função SQL | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:276` | Produção | — |
| `app.racao_entrada_conferir` | função SQL | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:559` | Fiscal | — |
| `app.racao_entrada_estoque` | função SQL | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:189` | Vendas, PDV, estoque, produtos e ração | — |
| `app.racao_movimento_conferir` | função SQL | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:127` | Fiscal | — |
| `app.racao_movimento_sem_apagar` | função SQL | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:173` | Vendas, PDV, estoque, produtos e ração | — |
| `app.racao_saldo_conferir` | função SQL | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:152` | Fiscal | — |
| `app.ratear_por_percentual` | função SQL | `supabase/migrations/20261026000004_financeiro_base.sql:83` | Comum | — |
| `app.recalcular_peixes` | função SQL | `supabase/migrations/20261026000003_producao_e_titulos.sql:109` | Comum | — |
| `app.registrar_alteracao` | função SQL | `supabase/migrations/20261028233000_api_publica.sql:326` | Vendas, PDV, estoque, produtos e ração | — |
| `app.registrar_desconciliacao` | função SQL | `supabase/migrations/20261029080000_desconciliar_e_apagar_extrato.sql:138` | Financeiro | — |
| `app.registro_em_uso` | função SQL | `supabase/migrations/20261103010000_padroes_e_estoque_na_conciliacao.sql:11` | Comum | — |
| `app.regra_casa` | função SQL | `supabase/migrations/20261026000008_regras_aging_orcamento.sql:39` | Comum | — |
| `app.restaurar_centros_custo` | função SQL | `supabase/migrations/20261103010000_padroes_e_estoque_na_conciliacao.sql:128` | Financeiro | — |
| `app.restaurar_plano_categorias` | função SQL | `supabase/migrations/20261103010000_padroes_e_estoque_na_conciliacao.sql:38` | Cobrança | — |
| `app.revoga_chaves_de_ex_master` | função SQL | `supabase/migrations/20261028235500_api_chave_7_dias.sql:44` | Comum | — |
| `app.saldo_entrada` | função SQL | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:86` | Financeiro | — |
| `app.saldo_produto` | função SQL | `supabase/migrations/20261026000009_racao_cartao_comercial.sql:17` | Vendas, PDV, estoque, produtos e ração | — |
| `app.sede_no_deposito_de_peixe` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:237` | Vendas, PDV, estoque, produtos e ração | — |
| `app.sem_acento` | função SQL | `supabase/migrations/20261029150000_regra_ignorar.sql:21` | Comum | — |
| `app.sem_campos_ocultos` | função SQL | `supabase/migrations/20261028201500_historico_alteracoes.sql:35` | Produção | — |
| `app.sessao_com_senha` | função SQL | `supabase/migrations/20261028170000_dispositivos_confiaveis.sql:28` | Comum | — |
| `app.so_digitos` | função SQL | `supabase/migrations/20261027140000_importacao.sql:44` | Comum | — |
| `app.soltar_conciliacao` | função SQL | `supabase/migrations/20261103020000_cancelar_importacao_e_duplicados.sql:179` | Financeiro | — |
| `app.soma_causas_morte` | função SQL | `supabase/migrations/20261031010000_causas_mortalidade.sql:18` | Produção | — |
| `app.soma_conciliada` | função SQL | `supabase/migrations/20261104020000_conciliacao_multipla.sql:21` | Financeiro | — |
| `app.tabelas_sem_historico` | função SQL | `supabase/migrations/20261102160000_remover_rh.sql:36` | Login, segurança, usuários e permissões | — |
| `app.taxa_arracoamento` | função SQL | `supabase/migrations/20261105000001_piscicultura_estrutura.sql:235` | Comum | — |
| `app.tem_permissao` | função SQL | `supabase/migrations/20261026000011_usuarios_permissoes.sql:76` | Login, segurança, usuários e permissões | — |
| `app.titulo_autor_fixo` | função SQL | `supabase/migrations/20261029224500_titulos_por_modulo.sql:47` | Financeiro | — |
| `app.totalizar_apontamento` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:97` | Produção | — |
| `app.totalizar_lancamento` | função SQL | `supabase/migrations/20261027123000_apontamento_por_turno.sql:158` | Financeiro | — |
| `app.travar_estoque` | função SQL | `supabase/migrations/20261028070000_estoque_sem_corrida.sql:12` | Vendas, PDV, estoque, produtos e ração | — |
| `app.travar_referencias` | função SQL | `supabase/migrations/20261028201500_historico_alteracoes.sql:143` | Comum | — |
| `app.usuario_pode` | função SQL | `supabase/migrations/20261101130000_automacoes_resumo.sql:21` | Login, segurança, usuários e permissões | — |
| `app.valida_acesso` | função SQL | `supabase/migrations/20261029213000_cargos.sql:129` | Comum | — |
| `app.valida_baixa` | função SQL | `supabase/migrations/20261026000003_producao_e_titulos.sql:344` | Financeiro | — |
| `app.validar_rateio` | função SQL | `supabase/migrations/20261102031000_rateio_conciliacao.sql:12` | Financeiro | — |
| `app.veio_de_importacao` | função SQL | `supabase/migrations/20261029080000_desconciliar_e_apagar_extrato.sql:60` | Importação | — |
| `app.vencimento_fatura` | função SQL | `supabase/migrations/20261026000009_racao_cartao_comercial.sql:189` | Comum | — |
| `app.vincular` | função SQL | `supabase/migrations/20261027140000_importacao.sql:30` | Comum | — |
| `app.vinculo` | função SQL | `supabase/migrations/20261027140000_importacao.sql:24` | Comum | — |
| `app.viveiros_sem_lancamento` | função SQL | `supabase/migrations/20261101100000_automacoes.sql:54` | Financeiro | — |
| `AppCampo` | componente | `src/components/campo/app-campo.tsx:34` | Produção | 1 arquivo |
| `AppVendedor` | componente | `src/components/vendas/vendedor.tsx:57` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `apresentacaoPdf` | função | `src/lib/apresentacao-pdf.ts:177` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `apresentacaoPptx` | função | `src/lib/apresentacao-pptx.ts:114` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `aprovar_pagamentos` | função SQL | `supabase/migrations/20261101230000_pagamentos_asaas.sql:113` | Comum | 1 arquivo |
| `aprovarPagamentos` | ação | `src/app/(app)/contas-a-pagar/pagamentos/actions.ts:39` | Financeiro | 1 arquivo |
| `Area` | tipo | `src/lib/pendencias.ts:4` | Comum | 1 arquivo |
| `Area` | tipo | `src/lib/relatorios-catalogo.ts:6` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `AREAS` | constante | `src/lib/pendencias.ts:6` | Comum | — |
| `AREAS` | constante | `src/lib/relatorios-catalogo.ts:9` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `AreaTexto` | componente | `src/components/ui.tsx:86` | Comum | 16 arquivos |
| `armazemPronto` | função | `src/lib/db/indexeddb.ts:165` | Comum | 2 arquivos |
| `Arquivo` | tipo | `src/lib/documento-recebido.ts:30` | Comum | — |
| `ARQUIVO_DADOS` | constante | `e2e/apoio.ts:65` | Comum | — |
| `ArvoreOrdenavel` | componente | `src/components/ordenar.tsx:34` | Comum | 2 arquivos |
| `asaas` | função | `src/lib/asaas.ts:31` | Cobrança | 6 arquivos |
| `AsaasErro` | classe | `src/lib/asaas.ts:25` | Cobrança | 3 arquivos |
| `assinar` | ação | `src/app/assinatura/actions.ts:25` | Cobrança | 1 arquivo |
| `assinarArmazem` | função | `src/lib/db/indexeddb.ts:226` | Comum | 2 arquivos |
| `assinarConexao` | função | `src/lib/sync/detector.ts:65` | Comum | 1 arquivo |
| `assinarLateral` | função | `src/lib/lateral.ts:25` | Comum | 1 arquivo |
| `assinarWebhook` | função | `src/lib/api/regras.ts:311` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `Assinatura` | tipo | `src/lib/assinatura-mapa.ts:7` | Cobrança | 2 arquivos |
| `assinatura_inicial` | trigger | `supabase/migrations/20261027050000_assinaturas.sql:93` | Início, painel, ajuda e configurações | — |
| `assinaturaConfere` | função | `src/lib/whatsapp-texto.ts:31` | Comum | 2 arquivos |
| `assinaturas` | tabela | `supabase/migrations/20261027050000_assinaturas.sql:23` | Cobrança | 2 arquivos |
| `assistente_esconder` | função SQL | `supabase/migrations/20261029101500_assistente_inicio.sql:93` | Início, painel, ajuda e configurações | 1 arquivo |
| `assistente_inicio` | função SQL | `supabase/migrations/20261029101500_assistente_inicio.sql:46` | Início, painel, ajuda e configurações | 1 arquivo |
| `assistente_inicio` | tabela | `supabase/migrations/20261029101500_assistente_inicio.sql:7` | Início, painel, ajuda e configurações | — |
| `assistente_pular` | função SQL | `supabase/migrations/20261029101500_assistente_inicio.sql:76` | Início, painel, ajuda e configurações | 1 arquivo |
| `AssistentePainel` | componente | `src/components/assistente-painel.tsx:7` | Início, painel, ajuda e configurações | 1 arquivo |
| `ativarProdutosEmLote` | ação | `src/app/(app)/produtos/actions.ts:135` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `ATRASO_ABRIR` | constante | `src/lib/lateral.ts:37` | Comum | 1 arquivo |
| `ATRASO_RECOLHER` | constante | `src/lib/lateral.ts:39` | Comum | 1 arquivo |
| `atualizar_pagamento_saida` | função SQL | `supabase/migrations/20261101230000_pagamentos_asaas.sql:177` | Comum | 1 arquivo |
| `atualizar_usuario` | função SQL | `supabase/migrations/20261029213000_cargos.sql:268` | Login, segurança, usuários e permissões | 1 arquivo |
| `atualizarConta` | ação | `src/app/(app)/cobrancas/conta-actions.ts:134` | Cobrança | 1 arquivo |
| `atualizarUsuario` | ação | `src/app/(app)/configuracoes/usuarios/actions.ts:49` | Login, segurança, usuários e permissões | 1 arquivo |
| `audit_log` | tabela | `supabase/migrations/20261026000001_schema.sql:59` | Login, segurança, usuários e permissões | 1 arquivo |
| `auditarNibo` | função | `src/lib/importacao-nibo.ts:378` | Importação | 1 arquivo |
| `AuditoriaConta` | tipo | `src/lib/importacao-nibo.ts:371` | Importação | 1 arquivo |
| `auditorias_importacao` | tabela | `supabase/migrations/20261028230000_nibo_saldos_conciliacao.sql:33` | Importação | 2 arquivos |
| `autenticar` | função | `src/lib/api/servidor.ts:54` | API pública, webhooks e rotinas agendadas | — |
| `automacoes_empresa` | tabela | `supabase/migrations/20261101100000_automacoes.sql:8` | Início, painel, ajuda e configurações | 7 arquivos |
| `avisarEmpresa` | função | `src/lib/push.ts:16` | Comum | 3 arquivos |
| `avisarPorWhatsApp` | função | `src/lib/whatsapp.ts:74` | Comum | 1 arquivo |
| `Aviso` | componente | `src/components/ui.tsx:140` | Comum | 56 arquivos |
| `Aviso` | tipo | `src/lib/push.ts:12` | Comum | — |
| `AvisoAgua` | tipo | `src/lib/agua.ts:60` | Comum | — |
| `AvisoAmbiente` | componente | `src/components/aviso-ambiente.tsx:7` | Início, painel, ajuda e configurações | 1 arquivo |
| `AvisoCampo` | componente | `src/components/campo/pecas.tsx:182` | Produção | 8 arquivos |
| `AvisoCookies` | componente | `src/components/aviso-cookies.tsx:25` | Login, segurança, usuários e permissões | 1 arquivo |
| `AvisoFlutuante` | componente | `src/components/cadastro.tsx:328` | Comum | 1 arquivo |
| `avisos_mensais_devidos` | função SQL | `supabase/migrations/20261102160000_remover_rh.sql:68` | Comum | 1 arquivo |
| `avisosAgua` | função | `src/lib/agua.ts:65` | Comum | 6 arquivos |
| `AvisosPush` | componente | `src/components/avisos-push.tsx:14` | Comum | 1 arquivo |
| `avisosWhatsApp` | ação | `src/app/(app)/seguranca/whatsapp-actions.ts:26` | Login, segurança, usuários e permissões | 1 arquivo |
| `baixa_periodo` | trigger | `supabase/migrations/20261026000001_schema.sql:351` | Financeiro | — |
| `baixa_saldo` | trigger | `supabase/migrations/20261026000001_schema.sql:337` | Financeiro | — |
| `baixa_valida` | trigger | `supabase/migrations/20261026000003_producao_e_titulos.sql:365` | Financeiro | — |
| `BaixaApi` | tipo | `src/lib/api/regras.ts:196` | API pública, webhooks e rotinas agendadas | — |
| `BaixaImportada` | tipo | `src/lib/importacao.ts:36` | Importação | 1 arquivo |
| `baixar_cobranca` | função SQL | `supabase/migrations/20261028040000_auditoria_correcoes.sql:25` | Cobrança | 1 arquivo |
| `baixar_embalagens` | trigger | `supabase/migrations/20261101120500_automacoes_estoque.sql:68` | Vendas, PDV, estoque, produtos e ração | — |
| `baixar_titulos` | função SQL | `supabase/migrations/20261028190000_acoes_titulos.sql:86` | Financeiro | 1 arquivo |
| `baixarArquivoFocus` | função | `src/lib/focus.ts:64` | Fiscal | 2 arquivos |
| `baixarMidia` | função | `src/lib/whatsapp.ts:59` | Comum | 1 arquivo |
| `baixarTitulo` | ação | `src/app/(app)/_titulos/actions.ts:55` | Financeiro | 1 arquivo |
| `baixas` | tabela | `supabase/migrations/20261026000001_schema.sql:303` | Financeiro | 3 arquivos |
| `balbinaAsaas` | função | `src/lib/assinatura.ts:29` | Cobrança | 2 arquivos |
| `balbinaAsaasConfigurado` | função | `src/lib/assinatura.ts:19` | Cobrança | 3 arquivos |
| `BarraLateral` | componente | `src/components/barra-lateral.tsx:251` | Comum | 1 arquivo |
| `BarraPartes` | componente | `src/components/graficos.tsx:261` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `BarrasRanking` | componente | `src/components/graficos.tsx:222` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `BarrasResultado` | componente | `src/components/graficos-planejamento.tsx:93` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `BaseCiclo` | tipo | `src/lib/previsao.ts:261` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `BaseCusto` | tipo | `src/lib/planejamento.ts:470` | Planejamento, previsões, custo do kg e relatórios | — |
| `baseDoCiclo` | função | `src/lib/previsao.ts:269` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `BASES` | constante | `src/app/(app)/planejamento/parametros/custos.tsx:12` | Planejamento, previsões, custo do kg e relatórios | — |
| `biomassaTexto` | função | `src/components/campo/detalhe-tanque.tsx:21` | Produção | 1 arquivo |
| `Biometria` | tipo | `src/lib/crescimento.ts:64` | Produção | 2 arquivos |
| `biometria_grupos` | tabela | `supabase/migrations/20261111000004_biometria_grupos.sql:26` | Comum | 1 arquivo |
| `BiometriaCampo` | componente | `src/components/campo/biometria-campo.tsx:14` | Produção | 1 arquivo |
| `BiometriaCampo` | tipo | `src/lib/campo/validar.ts:48` | Produção | — |
| `BiometriaRecente` | tipo | `src/lib/campo/tipos.ts:16` | Produção | 1 arquivo |
| `biometrias` | tabela | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:522` | Comum | 6 arquivos |
| `bloqueia_prazo_inadimplente` | trigger | `supabase/migrations/20261101170000_automacoes_vendas.sql:155` | Vendas, PDV, estoque, produtos e ração | — |
| `bloqueioLogin` | função | `src/lib/login-servidor.ts:26` | Login, segurança, usuários e permissões | 2 arquivos |
| `Boleto` | tipo | `src/lib/boleto.ts:6` | Comum | — |
| `BoletoAsaas` | tipo | `src/lib/pagamentos-asaas.ts:7` | Cobrança | — |
| `Botao` | componente | `src/components/ui.tsx:31` | Comum | 40 arquivos |
| `BotaoCopiar` | componente | `src/components/vendas/botao-copiar.tsx:7` | Vendas, PDV, estoque, produtos e ração | 4 arquivos |
| `BotaoGrande` | componente | `src/components/campo/pecas.tsx:107` | Produção | 10 arquivos |
| `BotaoLancamento` | componente | `src/components/lancamento.tsx:15` | Financeiro | 21 arquivos |
| `BotaoLote` | componente | `src/components/cadastro.tsx:290` | Comum | 1 arquivo |
| `BotaoNfe` | componente | `src/components/vendas/botao-nfe.tsx:13` | Fiscal | 2 arquivos |
| `BotaoPilula` | componente | `src/components/campo/pecas.tsx:117` | Produção | 4 arquivos |
| `BotaoTema` | componente | `src/components/tema.tsx:119` | Comum | 1 arquivo |
| `buscarConhecimento` | função | `src/lib/campo/conhecimento-tambaqui.ts:154` | Produção | 2 arquivos |
| `buscarContas` | função | `src/lib/open-finance.ts:75` | Financeiro | 1 arquivo |
| `buscarDuvidas` | função | `src/lib/tutoriais.ts:739` | Início, painel, ajuda e configurações | 2 arquivos |
| `buscarItem` | função | `src/lib/open-finance.ts:73` | Financeiro | 1 arquivo |
| `buscarNfesRecebidas` | função | `src/lib/focus.ts:71` | Fiscal | 1 arquivo |
| `buscarRelatorios` | função | `src/lib/relatorios-catalogo.ts:78` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `buscarTelas` | função | `src/lib/menu.ts:85` | Comum | 2 arquivos |
| `buscarTransacoes` | função | `src/lib/open-finance.ts:80` | Financeiro | 1 arquivo |
| `CabecalhoDre` | tipo | `src/lib/dre-exportar.ts:15` | Planejamento, previsões, custo do kg e relatórios | — |
| `cabecalhoTabela` | função | `src/lib/planilha.ts:42` | Comum | 2 arquivos |
| `cadastrarEmitenteFocus` | ação | `src/app/(app)/notas/actions.ts:292` | Fiscal | 1 arquivo |
| `cadastrarRapido` | ação | `src/app/(app)/_cadastro-rapido/actions.ts:14` | Comum | 1 arquivo |
| `CadastroApp` | componente | `src/app/auth/mfa/cadastro-app.tsx:11` | Login, segurança, usuários e permissões | 1 arquivo |
| `CadastroLotes` | componente | `src/app/(app)/lotes/lista.tsx:100` | Produção | 1 arquivo |
| `CadastroPiscicultura` | componente | `src/app/(app)/piscicultura/lista.tsx:133` | Produção | 1 arquivo |
| `CadastroProdutos` | componente | `src/app/(app)/produtos/cadastro.tsx:25` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `CADASTROS` | constante | `src/lib/menu.ts:21` | Comum | — |
| `caixa_pdv` | view | `supabase/migrations/20261029173000_pontos_de_venda.sql:745` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `CaixaConfiar` | componente | `src/app/auth/mfa/confiar.tsx:4` | Login, segurança, usuários e permissões | 2 arquivos |
| `calcular_custos_mes` | função SQL | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:70` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `caminhoArquivoValido` | função | `src/lib/focus-mapa.ts:264` | Fiscal | 3 arquivos |
| `Campo` | tipo | `src/components/campo/contexto.tsx:29` | Produção | 1 arquivo |
| `Campo` | componente | `src/components/ui.tsx:66` | Comum | 70 arquivos |
| `CampoNumero` | componente | `src/components/campo/pecas.tsx:36` | Produção | 5 arquivos |
| `CAMPOS_AGUA` | constante | `src/lib/agua.ts:10` | Comum | 3 arquivos |
| `CAMPOS_REGRA` | constante | `src/lib/regras.ts:9` | Financeiro | 2 arquivos |
| `CamposLancamento` | componente | `src/app/(app)/apontamentos/campos-lancamento.tsx:78` | Produção | 1 arquivo |
| `CamposNovoLancamento` | componente | `src/app/(app)/conciliacao/campos-novo.tsx:15` | Produção | 1 arquivo |
| `CamposPonto` | componente | `src/app/(app)/pontos-de-venda/campos.tsx:6` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `cancelar_convite` | função SQL | `supabase/migrations/20261026000011_usuarios_permissoes.sql:202` | Login, segurança, usuários e permissões | 1 arquivo |
| `cancelar_importacao` | função SQL | `supabase/migrations/20261103050000_cancelar_importacao_sem_apagar.sql:13` | Importação | 1 arquivo |
| `cancelar_pagamento` | função SQL | `supabase/migrations/20261101230000_pagamentos_asaas.sql:98` | Comum | 1 arquivo |
| `cancelar_pedido` | função SQL | `supabase/migrations/20261102010000_desfazer_entrega.sql:69` | Vendas, PDV, estoque, produtos e ração | — |
| `cancelar_transferencia_peixe` | função SQL | `supabase/migrations/20261029173000_pontos_de_venda.sql:534` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `cancelarAssinatura` | ação | `src/app/assinatura/actions.ts:86` | Cobrança | 1 arquivo |
| `cancelarCobranca` | ação | `src/app/(app)/cobrancas/actions.ts:56` | Cobrança | 1 arquivo |
| `cancelarConvite` | ação | `src/app/(app)/configuracoes/usuarios/actions.ts:150` | Login, segurança, usuários e permissões | 1 arquivo |
| `cancelarEvento` | ação | `src/app/(app)/sanidade/actions.ts:91` | Produção | 1 arquivo |
| `cancelarImportacao` | ação | `src/app/(app)/conciliacao/actions.ts:211` | Financeiro | 1 arquivo |
| `cancelarNfe` | ação | `src/app/(app)/notas/actions.ts:162` | Fiscal | 1 arquivo |
| `cancelarPagamento` | ação | `src/app/(app)/contas-a-pagar/pagamentos/actions.ts:29` | Financeiro | 1 arquivo |
| `cancelarPedido` | ação | `src/app/(app)/vendas/actions.ts:250` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `cancelarTransferencia` | ação | `src/app/(app)/pontos-de-venda/actions.ts:149` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `Captcha` | componente | `src/components/captcha.tsx:40` | Login, segurança, usuários e permissões | 2 arquivos |
| `CaptchaApp` | componente | `src/app/app-captcha/captcha-app.tsx:12` | Login, segurança, usuários e permissões | 1 arquivo |
| `Cargo` | tipo | `src/components/permissoes-cargos.tsx:8` | Login, segurança, usuários e permissões | 2 arquivos |
| `cargos` | tabela | `supabase/migrations/20261029213000_cargos.sql:68` | Login, segurança, usuários e permissões | 1 arquivo |
| `carimba_custo_planejamento` | trigger | `supabase/migrations/20261027193500_planejamento.sql:173` | Planejamento, previsões, custo do kg e relatórios | — |
| `Carregando` | componente | `src/app/(app)/loading.tsx:3` | Início, painel, ajuda e configurações | — |
| `carregarAnalise` | função | `src/lib/analise-periodo-dados.ts:43` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `carregarCatalogo` | função | `src/lib/vendas-dados.ts:22` | Vendas, PDV, estoque, produtos e ração | 5 arquivos |
| `carregarDre` | função | `src/lib/consultas-relatorio.ts:18` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `carregarPlanejamento` | função | `src/lib/planejamento-dados.ts:42` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `carregarPlanoRacao` | função | `src/lib/previsao-racao-dados.ts:28` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `carregarPontos` | função | `src/lib/pontos-dados.ts:25` | Vendas, PDV, estoque, produtos e ração | 7 arquivos |
| `carregarPrevisoes` | função | `src/lib/previsao-dados.ts:36` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `carregarSugestoes` | função | `src/lib/sugestao-apontamento-dados.ts:11` | Produção | 2 arquivos |
| `Cartao` | componente | `src/components/ui.tsx:95` | Comum | 49 arquivos |
| `Cartao` | tipo | `src/lib/campo/propostas.ts:25` | Produção | 2 arquivos |
| `CartaoApontamento` | tipo | `src/lib/campo/propostas.ts:13` | Produção | 1 arquivo |
| `CartaoBiometria` | tipo | `src/lib/campo/propostas.ts:18` | Produção | — |
| `CartaoContaAsaas` | componente | `src/app/(app)/cobrancas/conta.tsx:11` | Cobrança | 1 arquivo |
| `cartaoDaFala` | função | `src/lib/campo/propostas.ts:105` | Produção | 2 arquivos |
| `CartaoInsumo` | tipo | `src/lib/campo/propostas.ts:21` | Produção | 1 arquivo |
| `CartaoKpi` | componente | `src/components/ui.tsx:291` | Comum | 2 arquivos |
| `cartoesDaIa` | função | `src/lib/campo/propostas.ts:74` | Produção | 2 arquivos |
| `CATALOGO` | constante | `src/lib/permissoes-regras.ts:26` | Login, segurança, usuários e permissões | 3 arquivos |
| `Categoria` | tipo | `src/app/(app)/categorias/lista.tsx:12` | Financeiro | 1 arquivo |
| `Categoria` | tipo | `src/lib/planejamento.ts:468` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `CategoriaDre` | tipo | `src/lib/relatorios.ts:118` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `CategoriaImportada` | tipo | `src/lib/importacao.ts:11` | Importação | 2 arquivos |
| `CATEGORIAS` | constante | `src/lib/planejamento.ts:517` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `categorias` | tabela | `supabase/migrations/20261026000001_schema.sql:97` | Financeiro | 13 arquivos |
| `categorias_custo` | view | `supabase/migrations/20261026000007_custo_do_ovo.sql:40` | Financeiro | — |
| `Causas` | tipo | `src/lib/causas-morte.ts:13` | Produção | 1 arquivo |
| `CAUSAS_MORTE` | constante | `src/lib/causas-morte.ts:3` | Produção | 10 arquivos |
| `Celula` | tipo | `src/lib/planilha.ts:73` | Comum | — |
| `centavos` | função | `src/lib/importacao.ts:98` | Importação | 3 arquivos |
| `centavosParaCampo` | função | `src/lib/formato.ts:33` | Comum | 12 arquivos |
| `CentralRelatorios` | componente | `src/app/(app)/relatorios/central.tsx:20` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `Centro` | tipo | `src/app/(app)/centros-de-custo/lista.tsx:12` | Financeiro | 1 arquivo |
| `centros_custo` | tabela | `supabase/migrations/20261026000001_schema.sql:114` | Financeiro | 12 arquivos |
| `ChatCampo` | componente | `src/components/campo/chat-campo.tsx:287` | Produção | 1 arquivo |
| `CHAVE_LATERAL` | constante | `src/lib/lateral.ts:5` | Comum | — |
| `CHAVE_VERSAO` | constante | `src/lib/versao.ts:5` | Início, painel, ajuda e configurações | 2 arquivos |
| `ChaveAgua` | tipo | `src/lib/agua.ts:7` | Comum | 1 arquivo |
| `chaveCabecalho` | função | `src/lib/importacao-modelo.ts:270` | Importação | — |
| `chaveCelular` | função | `src/lib/whatsapp-texto.ts:14` | Comum | 1 arquivo |
| `chaveEnviados` | função | `src/lib/campo/fila.ts:37` | Produção | 1 arquivo |
| `chaveFila` | função | `src/lib/campo/fila.ts:36` | Produção | 1 arquivo |
| `ChaveIndicador` | tipo | `src/lib/zootecnico.ts:132` | Produção | — |
| `ChavePeriodo` | tipo | `src/lib/analise-periodo.ts:16` | Planejamento, previsões, custo do kg e relatórios | — |
| `CHAVES_VALIDAS` | constante | `src/lib/permissoes-regras.ts:41` | Login, segurança, usuários e permissões | 4 arquivos |
| `chavesDoCargo` | função | `src/lib/permissoes-regras.ts:63` | Login, segurança, usuários e permissões | 2 arquivos |
| `chavesDosTutoriais` | função | `src/lib/tutoriais.ts:731` | Início, painel, ajuda e configurações | 2 arquivos |
| `chavesDoValorCargo` | função | `src/components/permissoes-cargos.tsx:41` | Login, segurança, usuários e permissões | 1 arquivo |
| `chavesPermitidas` | função | `src/lib/tutoriais-dados.ts:13` | Início, painel, ajuda e configurações | 2 arquivos |
| `chavesSincronizacao` | função | `src/lib/importacao-nibo.ts:324` | Importação | 1 arquivo |
| `checa_vinculo` | trigger | `supabase/migrations/20261028050000_isolamento_entre_empresas.sql:73` | Importação | — |
| `checklist_itens` | tabela | `supabase/migrations/20261029064500_checklist_e_racao_no_apontamento.sql:19` | Manutenções | 4 arquivos |
| `checklist_padrao` | trigger | `supabase/migrations/20261029064500_checklist_e_racao_no_apontamento.sql:90` | Início, painel, ajuda e configurações | — |
| `Chip` | componente | `src/components/vendas/controles.tsx:6` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `Ciclo` | tipo | `src/lib/assinatura-mapa.ts:4` | Cobrança | — |
| `cifrar` | função | `src/lib/cripto.ts:10` | Login, segurança, usuários e permissões | 4 arquivos |
| `Classe` | tipo | `src/app/(app)/piscicultura/lista.tsx:17` | Produção | 1 arquivo |
| `CLASSE_BOTAO_TEXTO` | constante | `src/components/ui.tsx:51` | Comum | 37 arquivos |
| `CLASSE_CONTROLE` | constante | `src/components/ui.tsx:54` | Comum | 18 arquivos |
| `CLASSE_ENTRADA` | constante | `src/components/campo/pecas.tsx:8` | Produção | — |
| `CLASSE_ESPIANDO` | constante | `src/lib/lateral.ts:34` | Comum | — |
| `CLASSE_RECOLHIDA` | constante | `src/lib/lateral.ts:6` | Comum | — |
| `classe_sem_classificacao` | trigger | `supabase/migrations/20261027123000_apontamento_por_turno.sql:42` | Início, painel, ajuda e configurações | — |
| `classeBotao` | função | `src/components/ui.tsx:21` | Comum | 53 arquivos |
| `classeReconhecimento` | função | `src/lib/reconhecimento-voz.ts:10` | Comum | 2 arquivos |
| `classes_peixe` | tabela | `supabase/migrations/20261026000001_schema.sql:668` | Produção | 6 arquivos |
| `Classificacao` | tipo | `src/lib/zootecnico.ts:176` | Produção | — |
| `cliente` | função | `src/lib/ia.ts:22` | Comum | 1 arquivo |
| `clienteAvulso` | função | `src/lib/app-celular/sessao.ts:13` | Comum | 2 arquivos |
| `ClienteContato` | tipo | `src/lib/vendas.ts:77` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `clienteNavegador` | função | `src/lib/supabase/client.ts:8` | Comum | 7 arquivos |
| `ClienteRapido` | tipo | `src/app/(app)/vendas/actions.ts:36` | Vendas, PDV, estoque, produtos e ração | — |
| `clientes_compras` | view | `supabase/migrations/20261028200000_clientes_compras.sql:4` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `clientesSemComprar` | função | `src/lib/vendas.ts:80` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `ClienteVenda` | tipo | `src/lib/vendas-dados.ts:8` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `cnpjValido` | função | `src/lib/documento.ts:15` | Comum | 3 arquivos |
| `Cobertura` | tipo | `src/lib/previsao.ts:189` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `COBERTURA_ATENCAO` | constante | `src/lib/previsao.ts:191` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `COBERTURA_CRITICA` | constante | `src/lib/previsao.ts:190` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `coberturaRacao` | função | `src/lib/previsao.ts:194` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `cobrancas` | tabela | `supabase/migrations/20261026000001_schema.sql:475` | Cobrança | 6 arquivos |
| `cobrancas_whatsapp_devidas` | função SQL | `supabase/migrations/20261101200000_whatsapp.sql:138` | Cobrança | 1 arquivo |
| `cobrarPedido` | ação | `src/app/(app)/vendas/actions.ts:254` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `CodigoEmail` | componente | `src/app/auth/mfa/codigo-email.tsx:10` | Login, segurança, usuários e permissões | 1 arquivo |
| `CodigoMfa` | componente | `src/components/codigo-mfa.tsx:8` | Login, segurança, usuários e permissões | 5 arquivos |
| `codigoNovo` | função | `e2e/apoio.ts:87` | Comum | — |
| `codigoSugerido` | função | `src/components/campo/form-lote.tsx:14` | Produção | — |
| `codigoTotp` | função | `e2e/totp.ts:4` | Comum | 4 arquivos |
| `ColunaMatriz` | tipo | `src/components/permissoes-visual.tsx:118` | Login, segurança, usuários e permissões | 1 arquivo |
| `ColunaModelo` | tipo | `src/lib/importacao-modelo.ts:16` | Importação | — |
| `ColunaPlanilha` | tipo | `src/lib/planilha.ts:74` | Comum | — |
| `COLUNAS_BAIXA` | constante | `src/lib/api/consultas.ts:11` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `COLUNAS_CONTATO` | constante | `src/lib/api/consultas.ts:13` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `COLUNAS_LANCAMENTO` | constante | `src/lib/api/consultas.ts:5` | API pública, webhooks e rotinas agendadas | 3 arquivos |
| `COLUNAS_PRODUTO` | constante | `src/lib/api/consultas.ts:16` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `COLUNAS_VENDA` | constante | `src/lib/api/consultas.ts:19` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `colunasDosCargos` | função | `src/components/permissoes-cargos.tsx:32` | Login, segurança, usuários e permissões | 1 arquivo |
| `ColunasEmpilhadas` | componente | `src/components/graficos-planejamento.tsx:25` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `Comando` | tipo | `src/lib/whatsapp-texto.ts:73` | Comum | — |
| `comandoDoTexto` | função | `src/lib/whatsapp-texto.ts:75` | Comum | 2 arquivos |
| `Comparado` | tipo | `src/lib/analise-periodo.ts:83` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `compararOrdem` | função | `src/lib/ordem.ts:11` | Comum | 3 arquivos |
| `completar_lancamento` | função SQL | `supabase/migrations/20261029064500_checklist_e_racao_no_apontamento.sql:152` | Financeiro | 1 arquivo |
| `COMPONENTES_CUSTO` | constante | `src/lib/titulos.ts:74` | Financeiro | 3 arquivos |
| `compra_cartao` | função SQL | `supabase/migrations/20261026000009_racao_cartao_comercial.sql:239` | Financeiro | 1 arquivo |
| `CompraCliente` | tipo | `src/lib/vendas.ts:76` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `Comprar` | tipo | `src/lib/abastecimento.ts:5` | Comum | — |
| `comprarNoCartao` | ação | `src/app/(app)/cartoes/actions.ts:39` | Financeiro | 1 arquivo |
| `compras_grupo` | tabela | `supabase/migrations/20261029183000_venda_entre_empresas.sql:7` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `ComRetry` | tipo | `src/lib/sync/queue.ts:11` | Comum | 3 arquivos |
| `comServiceWorker` | função | `e2e/apoio.ts:28` | Comum | 2 arquivos |
| `comSituacao` | função | `src/lib/api/consultas.ts:27` | API pública, webhooks e rotinas agendadas | 3 arquivos |
| `ConciliacaoConta` | tipo | `src/lib/importacao-nibo.ts:342` | Importação | 1 arquivo |
| `conciliacaoNibo` | função | `src/lib/importacao-nibo.ts:350` | Importação | 1 arquivo |
| `conciliacoes` | tabela | `supabase/migrations/20261026000001_schema.sql:412` | Financeiro | — |
| `conciliadoNoNibo` | função | `src/lib/importacao-nibo.ts:345` | Importação | — |
| `conciliar_certeiras` | função SQL | `supabase/migrations/20261026210000_open_finance_conciliacao.sql:112` | Financeiro | 1 arquivo |
| `conciliar_com_estoque` | função SQL | `supabase/migrations/20261103010000_padroes_e_estoque_na_conciliacao.sql:214` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `conciliar_com_existente` | função SQL | `supabase/migrations/20261103020000_cancelar_importacao_e_duplicados.sql:153` | Financeiro | — |
| `conciliar_com_titulo` | função SQL | `supabase/migrations/20261104020000_conciliacao_multipla.sql:83` | Financeiro | — |
| `conciliar_criando_titulo` | função SQL | `supabase/migrations/20261102031000_rateio_conciliacao.sql:164` | Financeiro | — |
| `conciliar_multiplos` | função SQL | `supabase/migrations/20261104020000_conciliacao_multipla.sql:28` | Financeiro | — |
| `conciliar_rateando` | função SQL | `supabase/migrations/20261102031000_rateio_conciliacao.sql:146` | Financeiro | — |
| `conciliar_transferencia` | função SQL | `supabase/migrations/20261026000005_conciliacao_relatorios.sql:122` | Vendas, PDV, estoque, produtos e ração | — |
| `conciliarCerteiras` | ação | `src/app/(app)/conciliacao/actions.ts:237` | Financeiro | 1 arquivo |
| `conciliarComExistente` | ação | `src/app/(app)/conciliacao/actions.ts:149` | Financeiro | 1 arquivo |
| `conciliarComTitulo` | ação | `src/app/(app)/conciliacao/actions.ts:89` | Financeiro | 1 arquivo |
| `conciliarCriandoTitulo` | ação | `src/app/(app)/conciliacao/actions.ts:104` | Financeiro | 1 arquivo |
| `conciliarMultiplos` | ação | `src/app/(app)/conciliacao/actions.ts:96` | Financeiro | 1 arquivo |
| `conciliarTransferencia` | ação | `src/app/(app)/conciliacao/actions.ts:157` | Financeiro | 1 arquivo |
| `concluirEvento` | ação | `src/app/(app)/sanidade/actions.ts:80` | Produção | 1 arquivo |
| `Condicao` | tipo | `src/lib/regras.ts:24` | Financeiro | 2 arquivos |
| `condicaoDoLancamento` | função | `src/lib/regras.ts:27` | Financeiro | 4 arquivos |
| `CONDICOES` | constante | `src/lib/vendas.ts:2` | Vendas, PDV, estoque, produtos e ração | 8 arquivos |
| `ConectarBanco` | componente | `src/app/(app)/conciliacao/conectar-banco.tsx:12` | Financeiro | 2 arquivos |
| `conectarContaPropria` | ação | `src/app/(app)/cobrancas/conta-actions.ts:101` | Cobrança | 1 arquivo |
| `conexaoAtual` | função | `src/lib/sync/detector.ts:61` | Comum | 3 arquivos |
| `conexoes_bancarias` | tabela | `supabase/migrations/20261026210000_open_finance_conciliacao.sql:10` | Financeiro | 6 arquivos |
| `confere` | trigger | `supabase/migrations/20261029140000_nfe_completa.sql:154` | Fiscal | — |
| `confere_ficha_embalagem` | trigger | `supabase/migrations/20261101120500_automacoes_estoque.sql:41` | Vendas, PDV, estoque, produtos e ração | — |
| `confere_lote_planejado` | trigger | `supabase/migrations/20261027193500_planejamento.sql:145` | Produção | — |
| `confere_parametros_planejamento` | trigger | `supabase/migrations/20261027193500_planejamento.sql:161` | Planejamento, previsões, custo do kg e relatórios | — |
| `conferir` | trigger | `supabase/migrations/20261029073000_medicamentos.sql:92` | Produção | — |
| `conferir` | trigger | `supabase/migrations/20261029200000_equipamentos_manutencao.sql:177` | Manutenções | — |
| `conferir` | trigger | `supabase/migrations/20261029200000_equipamentos_manutencao.sql:191` | Manutenções | — |
| `conferir` | trigger | `supabase/migrations/20261029200000_equipamentos_manutencao.sql:205` | Manutenções | — |
| `conferir` | trigger | `supabase/migrations/20261029231000_rh_ponto.sql:278` | RH e cartão de ponto | — |
| `conferir` | trigger | `supabase/migrations/20261029231000_rh_ponto.sql:308` | RH e cartão de ponto | — |
| `conferir` | trigger | `supabase/migrations/20261029231000_rh_ponto.sql:334` | RH e cartão de ponto | — |
| `conferir_ponto` | trigger | `supabase/migrations/20261029173000_pontos_de_venda.sql:794` | Vendas, PDV, estoque, produtos e ração | — |
| `conferirConexao` | função | `src/lib/sync/detector.ts:31` | Comum | — |
| `conferirCredencial` | função | `src/lib/asaas-mapa.ts:31` | Cobrança | 2 arquivos |
| `conferirLeitura` | função | `src/lib/documento-recebido.ts:16` | Comum | — |
| `Confianca` | tipo | `src/lib/previsao-racao.ts:18` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `confiarDispositivo` | ação | `src/app/auth/mfa/actions.ts:83` | Login, segurança, usuários e permissões | 1 arquivo |
| `confiarNesteDispositivo` | função | `src/lib/mfa.ts:47` | Login, segurança, usuários e permissões | 1 arquivo |
| `config` | constante | `src/proxy.ts:62` | Login, segurança, usuários e permissões | — |
| `config_fiscal_empresa` | função SQL | `supabase/migrations/20261026220000_nfe.sql:35` | Início, painel, ajuda e configurações | 2 arquivos |
| `CONFIG_TITULO` | constante | `src/lib/titulos.ts:4` | Financeiro | 5 arquivos |
| `ConfigFiscal` | tipo | `src/lib/focus-mapa.ts:8` | Fiscal | 1 arquivo |
| `ConfigLcdpr` | tipo | `src/lib/lcdpr-dados.ts:6` | Comum | — |
| `ConfigOllama` | tipo | `src/lib/ai/offline-chat.ts:24` | Comum | 1 arquivo |
| `configOllamaNavegador` | função | `src/lib/ai/offline-chat.ts:46` | Comum | 1 arquivo |
| `configOllamaServidor` | função | `src/lib/ai/offline-chat.ts:41` | Comum | 4 arquivos |
| `confirmarCodigoEmail` | ação | `src/app/auth/mfa/actions.ts:47` | Login, segurança, usuários e permissões | 1 arquivo |
| `confirmarLinkEmail` | ação | `src/app/auth/mfa/actions.ts:67` | Login, segurança, usuários e permissões | 1 arquivo |
| `Conflito` | tipo | `src/lib/planejamento.ts:99` | Planejamento, previsões, custo do kg e relatórios | — |
| `CONSULTA_MOUSE` | constante | `src/lib/lateral.ts:35` | Comum | 1 arquivo |
| `consultarBoleto` | função | `src/lib/pagamentos-asaas.ts:22` | Cobrança | 1 arquivo |
| `consultarCep` | função | `src/lib/consulta-publica.ts:63` | Comum | 1 arquivo |
| `consultarCnpj` | função | `src/lib/consulta-publica.ts:56` | Comum | 1 arquivo |
| `consultarNfe` | ação | `src/app/(app)/notas/actions.ts:146` | Fiscal | 1 arquivo |
| `consumoPorRacao` | função | `src/lib/previsao-racao.ts:368` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `ConsumoRacao` | tipo | `src/lib/previsao-racao.ts:291` | Vendas, PDV, estoque, produtos e ração | — |
| `Conta` | tipo | `src/app/(app)/contas/lista.tsx:18` | Financeiro | 1 arquivo |
| `ContaAsaas` | tipo | `src/app/(app)/cobrancas/conta.tsx:6` | Cobrança | 1 arquivo |
| `Contador` | componente | `src/components/vendas/controles.tsx:21` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `Contador` | tipo | `src/lib/lcdpr.ts:24` | Comum | — |
| `ContaImportada` | tipo | `src/lib/importacao.ts:12` | Importação | 2 arquivos |
| `ContaLcdpr` | tipo | `src/lib/lcdpr.ts:17` | Comum | 1 arquivo |
| `ContaPluggy` | tipo | `src/lib/open-finance-mapa.ts:21` | Financeiro | 1 arquivo |
| `contarDispositivosConfiaveis` | função | `src/lib/mfa.ts:108` | Login, segurança, usuários e permissões | 1 arquivo |
| `contarMortes` | função | `src/lib/ia.ts:87` | Comum | 1 arquivo |
| `contarMortesPorFoto` | ação | `src/app/(app)/apontamentos/foto-mortes-action.ts:11` | Produção | 1 arquivo |
| `contarPescado` | ação | `src/app/(app)/estoque/actions.ts:41` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `contarPonto` | ação | `src/app/(app)/pontos-de-venda/actions.ts:83` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `contas_asaas` | tabela | `supabase/migrations/20261027130000_contas_asaas.sql:6` | Cobrança | 4 arquivos |
| `contas_asaas_segredos` | tabela | `supabase/migrations/20261027130000_contas_asaas.sql:20` | Cobrança | 3 arquivos |
| `contas_financeiras` | tabela | `supabase/migrations/20261026000001_schema.sql:127` | Financeiro | 21 arquivos |
| `Contato` | tipo | `src/app/(app)/contatos/lista.tsx:12` | Financeiro | 1 arquivo |
| `contato_lista_preco` | trigger | `supabase/migrations/20261027133000_tabelas_de_preco.sql:137` | Financeiro | — |
| `ContatoApi` | tipo | `src/lib/api/regras.ts:217` | API pública, webhooks e rotinas agendadas | — |
| `ContatoConciliacao` | tipo | `src/app/(app)/conciliacao/campos-novo.tsx:9` | Produção | 1 arquivo |
| `ContatoImportado` | tipo | `src/lib/importacao.ts:16` | Importação | 3 arquivos |
| `contatos` | tabela | `supabase/migrations/20261026000001_schema.sql:77` | Financeiro | 28 arquivos |
| `ContaVenda` | tipo | `src/lib/vendas-dados.ts:10` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `Contexto` | tipo | `src/lib/importacao-modelo.ts:282` | Importação | 2 arquivos |
| `ContextoApi` | tipo | `src/lib/api/servidor.ts:13` | API pública, webhooks e rotinas agendadas | — |
| `ContextoCartoes` | tipo | `src/lib/campo/propostas.ts:52` | Produção | 5 arquivos |
| `contextoDosCartoes` | função | `src/lib/campo/manejo-ia.ts:70` | Produção | 2 arquivos |
| `conversarOllama` | função | `src/lib/ai/offline-chat.ts:53` | Comum | — |
| `convidar_usuario` | função SQL | `supabase/migrations/20261029213000_cargos.sql:210` | Login, segurança, usuários e permissões | 1 arquivo |
| `convidarUsuario` | ação | `src/app/(app)/configuracoes/usuarios/actions.ts:31` | Login, segurança, usuários e permissões | 1 arquivo |
| `Convite` | tipo | `src/app/(app)/configuracoes/usuarios/lista.tsx:19` | Login, segurança, usuários e permissões | 1 arquivo |
| `convite_sem_login_local` | trigger | `supabase/migrations/20261029223000_login_local.sql:101` | Login, segurança, usuários e permissões | — |
| `CONVITE_UPGRADE` | constante | `src/lib/assinatura-mapa.ts:105` | Cobrança | 1 arquivo |
| `convites` | tabela | `supabase/migrations/20261026000011_usuarios_permissoes.sql:103` | Login, segurança, usuários e permissões | 1 arquivo |
| `COOKIE_DISPOSITIVO` | constante | `src/lib/mfa.ts:43` | Login, segurança, usuários e permissões | — |
| `COOKIE_EMPRESA` | constante | `src/lib/empresa.ts:8` | Início, painel, ajuda e configurações | 2 arquivos |
| `cookiePonto` | função | `src/lib/pontos.ts:44` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `Cor` | tipo | `src/components/ui.tsx:266` | Comum | 3 arquivos |
| `COR_FICHA` | constante | `src/components/ui.tsx:267` | Comum | — |
| `CORES` | constante | `src/lib/apresentacao.ts:10` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `corrigir_grupos_biometria` | função SQL | `supabase/migrations/20261111000004_biometria_grupos.sql:132` | Comum | 1 arquivo |
| `corrigirGruposBiometria` | ação | `src/app/(app)/lotes/actions.ts:201` | Produção | 1 arquivo |
| `corrigirNfe` | ação | `src/app/(app)/notas/actions.ts:186` | Fiscal | 1 arquivo |
| `cpfValido` | função | `src/lib/documento.ts:9` | Comum | 4 arquivos |
| `createAdminClient` | função | `src/lib/supabase/admin.ts:7` | Comum | 21 arquivos |
| `createClient` | função | `src/lib/supabase/server.ts:7` | Comum | 148 arquivos |
| `Credencial` | tipo | `src/lib/asaas.ts:7` | Cobrança | 5 arquivos |
| `credencialBalbina` | função | `src/lib/assinatura.ts:23` | Cobrança | 1 arquivo |
| `credencialDoPerfil` | função | `src/lib/asaas.ts:12` | Cobrança | 6 arquivos |
| `crescimentoLote` | função | `src/lib/crescimento.ts:74` | Produção | 3 arquivos |
| `criar_chave_api` | função SQL | `supabase/migrations/20261028235500_api_chave_7_dias.sql:18` | Comum | 1 arquivo |
| `criar_empresa` | função SQL | `supabase/migrations/20261026232000_corrige_criar_empresa.sql:9` | Início, painel, ajuda e configurações | 2 arquivos |
| `criar_pedido` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:836` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `criar_pedido_portal` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:982` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `criar_ponto_venda` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:1014` | RH e cartão de ponto | 1 arquivo |
| `criar_recorrencia` | função SQL | `supabase/migrations/20261026000004_financeiro_base.sql:104` | Financeiro | 1 arquivo |
| `criar_regra` | função SQL | `supabase/migrations/20261026000008_regras_aging_orcamento.sql:97` | Comum | 1 arquivo |
| `criar_regras_do_historico` | função SQL | `supabase/migrations/20261027140000_importacao.sql:369` | Login, segurança, usuários e permissões | 1 arquivo |
| `criar_webhook_api` | função SQL | `supabase/migrations/20261028233000_api_publica.sql:157` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `criarCartao` | ação | `src/app/(app)/cartoes/actions.ts:15` | Financeiro | 1 arquivo |
| `criarChave` | ação | `src/app/(app)/configuracoes/api/actions.ts:15` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `criarClienteRapido` | ação | `src/app/(app)/vendas/actions.ts:38` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `criarContato` | ação | `src/app/(app)/_titulos/actions.ts:86` | Financeiro | 1 arquivo |
| `criarDispositivoConfiavel` | função | `src/lib/mfa.ts:66` | Login, segurança, usuários e permissões | 1 arquivo |
| `criarEmpresa` | ação | `src/app/onboarding/actions.ts:10` | Início, painel, ajuda e configurações | 1 arquivo |
| `criarEspecie` | ação | `src/app/(app)/lotes/actions.ts:224` | Produção | 1 arquivo |
| `criarItemChecklist` | ação | `src/app/(app)/apontamentos/actions.ts:191` | Produção | 1 arquivo |
| `criarLoginLocal` | ação | `src/app/(app)/configuracoes/usuarios/actions.ts:81` | Login, segurança, usuários e permissões | 1 arquivo |
| `criarPonto` | ação | `src/app/(app)/pontos-de-venda/actions.ts:38` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `criarRecorrencia` | ação | `src/app/(app)/_titulos/actions.ts:114` | Financeiro | 1 arquivo |
| `criarRegra` | ação | `src/app/(app)/conciliacao/actions.ts:292` | Financeiro | 1 arquivo |
| `criarRegraSugerida` | ação | `src/app/(app)/conciliacao/actions.ts:259` | Financeiro | 1 arquivo |
| `criarSincronizador` | função | `src/lib/sync/worker.ts:26` | Comum | 2 arquivos |
| `criarTokenConexao` | função | `src/lib/open-finance.ts:61` | Financeiro | 1 arquivo |
| `criarWebhook` | ação | `src/app/(app)/configuracoes/api/actions.ts:40` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `cursorSeguinte` | função | `src/lib/open-finance-mapa.ts:97` | Financeiro | 2 arquivos |
| `curvaAbc` | função | `src/lib/vendas.ts:67` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `CurvaPadrao` | tipo | `src/lib/previsao.ts:20` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `curvas_crescimento` | tabela | `supabase/migrations/20261026000001_schema.sql:618` | Produção | 6 arquivos |
| `curvasDasEspecies` | função | `src/lib/planejamento-dados.ts:99` | Planejamento, previsões, custo do kg e relatórios | — |
| `CurvaSemana` | tipo | `src/lib/planejamento.ts:484` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `custeio_habitual` | função SQL | `supabase/migrations/20261101160000_nfes_recebidas.sql:93` | Comum | 2 arquivos |
| `Custo` | tipo | `src/lib/analise-periodo.ts:258` | Planejamento, previsões, custo do kg e relatórios | — |
| `custo_formulas` | view | `supabase/migrations/20261103040000_formula_racao_qualquer_total.sql:55` | Vendas, PDV, estoque, produtos e ração | — |
| `custo_kg_lote` | view | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:304` | Produção | 5 arquivos |
| `custoKgMes` | função | `src/lib/pescado.ts:111` | Comum | 3 arquivos |
| `CustoLinha` | tipo | `src/lib/planejamento-dados.ts:23` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `CustoLote` | tipo | `src/lib/analise-periodo.ts:187` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `CustoMes` | tipo | `src/lib/previsao.ts:219` | Planejamento, previsões, custo do kg e relatórios | — |
| `custos_lote_mensal` | tabela | `supabase/migrations/20261026000001_schema.sql:884` | Planejamento, previsões, custo do kg e relatórios | — |
| `custoSemanalVariavel` | função | `src/lib/previsao.ts:230` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `CustosFuturos` | componente | `src/app/(app)/planejamento/parametros/custos.tsx:61` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `Dados` | tipo | `e2e/apoio.ts:69` | Comum | 1 arquivo |
| `DadosBalcao` | tipo | `src/app/(app)/vendas/actions.ts:170` | Vendas, PDV, estoque, produtos e ração | — |
| `DadosBarra` | tipo | `src/components/barra-lateral.tsx:64` | Comum | 1 arquivo |
| `DadosCadastro` | tipo | `src/lib/consulta-publica.ts:4` | Comum | 1 arquivo |
| `DadosCampo` | tipo | `src/components/campo/contexto.tsx:13` | Produção | 1 arquivo |
| `dadosCampo` | função | `src/lib/apontamento-campo-servidor.ts:13` | Produção | 2 arquivos |
| `dadosDoCep` | função | `src/lib/consulta-publica.ts:43` | Comum | 1 arquivo |
| `dadosDoCnpj` | função | `src/lib/consulta-publica.ts:25` | Comum | 1 arquivo |
| `DadosDocumento` | tipo | `src/lib/documento-recebido.ts:8` | Comum | 1 arquivo |
| `DadosEstoque` | tipo | `src/app/(app)/produtos/lista.tsx:49` | Vendas, PDV, estoque, produtos e ração | — |
| `DadosLote` | tipo | `src/lib/previsao-racao.ts:30` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `DadosNibo` | tipo | `src/lib/importacao-nibo.ts:49` | Importação | 2 arquivos |
| `DadosSubconta` | tipo | `src/lib/asaas-mapa.ts:173` | Cobrança | — |
| `DadosVenda` | tipo | `src/app/(app)/vendas/actions.ts:72` | Vendas, PDV, estoque, produtos e ração | — |
| `dataCurta` | função | `src/components/campo/pecas.tsx:23` | Produção | 5 arquivos |
| `dataIso` | função | `src/lib/importacao.ts:110` | Importação | 2 arquivos |
| `dataLocal` | função | `src/lib/open-finance-mapa.ts:34` | Financeiro | 1 arquivo |
| `datasDoLote` | função | `src/lib/planejamento.ts:141` | Planejamento, previsões, custo do kg e relatórios | — |
| `dataValida` | função | `src/lib/api/regras.ts:91` | API pública, webhooks e rotinas agendadas | 4 arquivos |
| `decifrar` | função | `src/lib/cripto.ts:17` | Login, segurança, usuários e permissões | 4 arquivos |
| `decodificar` | função | `src/lib/importacao-planilha.ts:77` | Importação | 1 arquivo |
| `decodificarOfx` | função | `src/lib/ofx.ts:15` | Financeiro | 2 arquivos |
| `definir_dispensa_2fa` | função SQL | `supabase/migrations/20261029223000_login_local.sql:159` | Login, segurança, usuários e permissões | 1 arquivo |
| `definir_preco` | função SQL | `supabase/migrations/20261028060000_fuso_da_empresa.sql:512` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `definirDispensa2fa` | ação | `src/app/(app)/configuracoes/usuarios/actions.ts:140` | Login, segurança, usuários e permissões | 1 arquivo |
| `definirEspiando` | função | `src/lib/lateral.ts:45` | Comum | 1 arquivo |
| `definirLateral` | função | `src/lib/lateral.ts:15` | Comum | 1 arquivo |
| `definirPreco` | ação | `src/app/(app)/vendas/actions.ts:278` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `DELETE` | função | `src/app/api/push/route.ts:33` | Comum | — |
| `Dependencias` | tipo | `src/lib/sync/worker.ts:18` | Comum | — |
| `depositos` | tabela | `supabase/migrations/20261026000001_schema.sql:743` | Vendas, PDV, estoque, produtos e ração | 6 arquivos |
| `desconciliar` | ação | `src/app/(app)/conciliacao/actions.ts:196` | Financeiro | 1 arquivo |
| `desconciliar` | função SQL | `supabase/migrations/20261104020000_conciliacao_multipla.sql:179` | Financeiro | — |
| `desconectarBanco` | ação | `src/app/(app)/conciliacao/open-finance-actions.ts:127` | Financeiro | 2 arquivos |
| `descreverCondicao` | função | `src/lib/regras.ts:33` | Financeiro | 2 arquivos |
| `descricaoFaixa` | função | `src/lib/previsao-racao.ts:81` | Vendas, PDV, estoque, produtos e ração | — |
| `descricaoRacao` | função | `src/lib/racao-estoque.ts:27` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `desdeNiboValido` | função | `src/lib/importacao-nibo.ts:479` | Importação | 2 arquivos |
| `desfaz_despesca_estoque` | trigger | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:442` | Comum | — |
| `desfazer_compra_do_grupo` | função SQL | `supabase/migrations/20261029183000_venda_entre_empresas.sql:140` | Comum | 1 arquivo |
| `desfazer_despesca` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:579` | Comum | 1 arquivo |
| `desfazer_entrega` | função SQL | `supabase/migrations/20261102010000_desfazer_entrega.sql:6` | Comum | — |
| `desfazer_faturamento` | função SQL | `supabase/migrations/20261102010000_desfazer_entrega.sql:28` | Comum | — |
| `desfazer_transferencia` | função SQL | `supabase/migrations/20261105000001_piscicultura_estrutura.sql:579` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `desfazerDespesca` | ação | `src/app/(app)/despescas/actions.ts:59` | Comum | 1 arquivo |
| `desfazerEntradaGrupo` | ação | `src/app/(app)/vendas/actions.ts:325` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `desfazerEntrega` | ação | `src/app/(app)/vendas/actions.ts:242` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `desfazerFaturamento` | ação | `src/app/(app)/vendas/actions.ts:246` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `desfazerTransferencia` | ação | `src/app/(app)/lotes/actions.ts:307` | Produção | 1 arquivo |
| `Desfecho` | tipo | `src/lib/campo/fila.ts:52` | Produção | — |
| `desfecho` | função | `src/lib/campo/fila.ts:60` | Produção | 2 arquivos |
| `desligarConta` | ação | `src/app/(app)/cobrancas/conta-actions.ts:149` | Cobrança | 1 arquivo |
| `desligarConta` | ação | `src/app/(app)/conciliacao/open-finance-actions.ts:117` | Financeiro | 2 arquivos |
| `desligarWhatsApp` | ação | `src/app/(app)/seguranca/whatsapp-actions.ts:36` | Login, segurança, usuários e permissões | 1 arquivo |
| `deslocarMes` | função | `src/lib/formato.ts:52` | Comum | 5 arquivos |
| `despescas` | tabela | `supabase/migrations/20261027123000_apontamento_por_turno.sql:249` | Comum | 2 arquivos |
| `Destaque` | tipo | `src/lib/analise-periodo.ts:261` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `destaques` | função | `src/lib/analise-periodo.ts:281` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `Destinatario` | tipo | `src/lib/focus-mapa.ts:12` | Fiscal | 1 arquivo |
| `destinoSeguro` | função | `src/lib/termos.ts:21` | Login, segurança, usuários e permissões | 6 arquivos |
| `Detalhe` | tipo | `src/lib/historico.ts:112` | Login, segurança, usuários e permissões | — |
| `detalhesAlteracao` | função | `src/lib/historico.ts:114` | Login, segurança, usuários e permissões | 2 arquivos |
| `DetalheTanque` | componente | `src/components/campo/detalhe-tanque.tsx:25` | Produção | 1 arquivo |
| `deveMigrar` | função | `src/lib/db/indexeddb.ts:24` | Comum | 1 arquivo |
| `devolver_estoque` | trigger | `supabase/migrations/20261029073000_medicamentos.sql:119` | Produção | — |
| `dia` | função | `src/lib/planejamento.ts:112` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `diagnosticarNibo` | função | `src/lib/importacao-nibo.ts:75` | Importação | — |
| `DiagnosticoConta` | tipo | `src/lib/importacao-nibo.ts:64` | Importação | — |
| `DialogoAcao` | componente | `src/components/dialogo-acao.tsx:12` | Comum | 2 arquivos |
| `DiaLote` | tipo | `src/lib/analise-periodo.ts:156` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `DiaLote` | tipo | `src/lib/previsao.ts:98` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `DIAS_ALERTA_VALIDADE` | constante | `src/lib/racao-estoque.ts:4` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `DIAS_ANTES` | constante | `src/lib/regua-cobranca.ts:12` | Cobrança | 1 arquivo |
| `DIAS_ATRASO` | constante | `src/lib/regua-cobranca.ts:13` | Cobrança | — |
| `DIAS_COMPRA` | constante | `src/lib/abastecimento.ts:7` | Comum | 1 arquivo |
| `DIAS_CONFIANCA` | constante | `src/lib/mfa.ts:44` | Login, segurança, usuários e permissões | — |
| `DIAS_CONSUMO` | constante | `src/lib/previsao-dados.ts:18` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `DIAS_FILA` | constante | `src/lib/pedido-campo.ts:23` | Produção | — |
| `DIAS_MINIMOS` | constante | `src/lib/zootecnico.ts:52` | Produção | 2 arquivos |
| `DIAS_SIMULACAO` | constante | `src/lib/previsao-racao.ts:46` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `DIAS_SUGESTAO` | constante | `src/lib/sugestao-apontamento-dados.ts:7` | Produção | — |
| `DIAS_TENDENCIA` | constante | `src/lib/previsao-dados.ts:17` | Planejamento, previsões, custo do kg e relatórios | — |
| `DIAS_TRATO` | constante | `src/lib/previsao-racao-dados.ts:14` | Vendas, PDV, estoque, produtos e ração | — |
| `diasAtrasISO` | função | `src/lib/formato.ts:114` | Comum | 10 arquivos |
| `diasEntre` | função | `src/lib/crescimento.ts:57` | Produção | 2 arquivos |
| `diferencaPct` | função | `src/lib/campo/indicadores.ts:28` | Produção | 2 arquivos |
| `dispensarSugestao` | ação | `src/app/(app)/conciliacao/actions.ts:272` | Financeiro | 2 arquivos |
| `dispositivos_confiaveis` | tabela | `supabase/migrations/20261028170000_dispositivos_confiaveis.sql:8` | Login, segurança, usuários e permissões | 1 arquivo |
| `dividirPacote` | função | `src/lib/importacao.ts:88` | Importação | 2 arquivos |
| `documento` | função | `src/lib/importacao.ts:142` | Importação | 2 arquivos |
| `DocumentoLegal` | componente | `src/components/documento-legal.tsx:8` | Login, segurança, usuários e permissões | 3 arquivos |
| `DocumentoLido` | tipo | `src/lib/ia.ts:68` | Comum | 1 arquivo |
| `documentos` | tabela | `supabase/migrations/20261026000001_schema.sql:560` | Comum | — |
| `DOCUMENTOS_LEGAIS` | constante | `src/lib/termos.ts:6` | Login, segurança, usuários e permissões | 2 arquivos |
| `documentos_recebidos` | tabela | `supabase/migrations/20261101180000_documentos_recebidos.sql:51` | Comum | 4 arquivos |
| `doMesmoAssunto` | função | `src/lib/relatorios-catalogo.ts:117` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `DOMINIO_LOGIN_LOCAL` | constante | `src/lib/login-local.ts:4` | Login, segurança, usuários e permissões | — |
| `Dre` | tipo | `src/lib/relatorios.ts:117` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `dreCsvLinhas` | função | `src/lib/dre-exportar.ts:148` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `drePdf` | função | `src/lib/dre-exportar.ts:118` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `dreXlsx` | função | `src/lib/dre-exportar.ts:26` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `duplicar_titulo` | função SQL | `supabase/migrations/20261028190000_acoes_titulos.sql:60` | Financeiro | 1 arquivo |
| `duplicarTitulo` | ação | `src/app/(app)/_titulos/actions.ts:192` | Financeiro | 1 arquivo |
| `Duvida` | tipo | `src/lib/tutoriais.ts:16` | Início, painel, ajuda e configurações | — |
| `DuvidaEncontrada` | tipo | `src/lib/tutoriais.ts:736` | Início, painel, ajuda e configurações | — |
| `editar_lancamento` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:195` | Financeiro | 1 arquivo |
| `editar_lote` | função SQL | `supabase/migrations/20261105000001_piscicultura_estrutura.sql:408` | Produção | 1 arquivo |
| `editar_titulo` | função SQL | `supabase/migrations/20261028190000_acoes_titulos.sql:15` | Financeiro | 1 arquivo |
| `editarLancamento` | ação | `src/app/(app)/apontamentos/actions.ts:131` | Produção | 1 arquivo |
| `EditarLancamento` | componente | `src/app/(app)/apontamentos/editar-lancamento.tsx:27` | Produção | 1 arquivo |
| `editarLote` | ação | `src/app/(app)/lotes/actions.ts:66` | Produção | 1 arquivo |
| `editarTitulo` | ação | `src/app/(app)/_titulos/actions.ts:164` | Financeiro | 1 arquivo |
| `eLoginLocal` | função | `src/lib/login-local.ts:21` | Login, segurança, usuários e permissões | 5 arquivos |
| `emailDeEntrada` | função | `src/lib/login-local.ts:16` | Login, segurança, usuários e permissões | 3 arquivos |
| `emailDoLogin` | função | `src/lib/login-local.ts:11` | Login, segurança, usuários e permissões | 2 arquivos |
| `EmbalagemPescado` | tipo | `src/lib/pescado.ts:75` | Comum | 1 arquivo |
| `embalagemPescado` | função | `src/lib/pescado.ts:85` | Comum | 1 arquivo |
| `EmbalagemPescadoIcone` | componente | `src/components/vendas/embalagem-pescado.tsx:7` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `EMBALAGENS_PESCADO` | constante | `src/lib/pescado.ts:77` | Comum | — |
| `EmitenteFocus` | tipo | `src/lib/focus-mapa.ts:269` | Fiscal | 1 arquivo |
| `emitirCobranca` | ação | `src/app/(app)/cobrancas/actions.ts:44` | Cobrança | 1 arquivo |
| `emitirCobrancaTitulo` | função | `src/lib/cobranca.ts:15` | Cobrança | 2 arquivos |
| `emitirNfce` | ação | `src/app/(app)/notas/actions.ts:93` | Fiscal | 1 arquivo |
| `EmitirNfce` | componente | `src/components/vendas/emitir-nfce.tsx:8` | Fiscal | 1 arquivo |
| `emitirNfe` | ação | `src/app/(app)/notas/actions.ts:39` | Fiscal | 1 arquivo |
| `emKg` | função | `src/lib/pescado.ts:50` | Comum | 1 arquivo |
| `EmLote` | tipo | `src/components/cadastro.tsx:43` | Comum | — |
| `emManutencao` | função | `src/lib/manutencao.ts:30` | Manutenções | 2 arquivos |
| `emOrdem` | função | `src/lib/ordem.ts:46` | Comum | — |
| `Empresa` | tipo | `src/lib/empresa.ts:10` | Início, painel, ajuda e configurações | 2 arquivos |
| `empresa_da_entrada` | função SQL | `supabase/migrations/20261101180000_documentos_recebidos.sql:118` | Início, painel, ajuda e configurações | 1 arquivo |
| `EmpresaApp` | tipo | `src/lib/app-celular/sessao.ts:40` | Comum | — |
| `EmpresaCampo` | tipo | `src/lib/apontamento-campo-servidor.ts:11` | Produção | 3 arquivos |
| `empresaDoApp` | função | `src/lib/app-celular/sessao.ts:44` | Comum | 9 arquivos |
| `empresas` | tabela | `supabase/migrations/20261026000001_schema.sql:15` | Início, painel, ajuda e configurações | 14 arquivos |
| `encerrar_lote` | função SQL | `supabase/migrations/20261105000001_piscicultura_estrutura.sql:615` | Produção | 2 arquivos |
| `encerrar_recorrencia` | função SQL | `supabase/migrations/20261028060000_fuso_da_empresa.sql:62` | Financeiro | 1 arquivo |
| `encerrarLote` | ação | `src/app/(app)/lotes/actions.ts:116` | Produção | 1 arquivo |
| `encerrarRecorrencia` | ação | `src/app/(app)/_titulos/actions.ts:150` | Financeiro | 1 arquivo |
| `encontrarModulo` | função | `src/lib/modulos.ts:94` | Comum | 3 arquivos |
| `Endpoint` | tipo | `src/lib/api/catalogo.ts:2` | API pública, webhooks e rotinas agendadas | — |
| `ENDPOINTS` | constante | `src/lib/api/catalogo.ts:4` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `Entrada` | componente | `src/components/campo/pecas.tsx:158` | Produção | 4 arquivos |
| `EntradaNoGrupo` | componente | `src/components/vendas/entrada-grupo.tsx:11` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `EntradaSaldo` | tipo | `src/lib/previsao-racao.ts:28` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `entrar` | função | `e2e/apoio.ts:104` | Comum | 2 arquivos |
| `entrarComSenha` | função | `e2e/apoio.ts:96` | Comum | 1 arquivo |
| `entregar_pedido` | função SQL | `supabase/migrations/20261026000006_estoque_vendas_sanidade.sql:329` | Vendas, PDV, estoque, produtos e ração | — |
| `entregarPedido` | ação | `src/app/(app)/vendas/actions.ts:238` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `entregarWebhooks` | função | `src/lib/api/webhooks.ts:12` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `Enviado` | tipo | `src/lib/campo/fila.ts:24` | Produção | 1 arquivo |
| `enviarCodigoEmail` | ação | `src/app/auth/mfa/actions.ts:27` | Login, segurança, usuários e permissões | 1 arquivo |
| `EnviarDocumento` | componente | `src/app/(app)/contas-a-pagar/documentos/enviar.tsx:10` | Financeiro | 1 arquivo |
| `enviarLogin` | ação | `src/app/login/actions.ts:108` | Login, segurança, usuários e permissões | 1 arquivo |
| `enviarModelo` | função | `src/lib/whatsapp.ts:47` | Comum | 1 arquivo |
| `enviarTexto` | função | `src/lib/whatsapp.ts:40` | Comum | 1 arquivo |
| `EnviosCampo` | componente | `src/components/campo/envios-campo.tsx:74` | Produção | 1 arquivo |
| `erroApi` | função | `src/lib/api/servidor.ts:32` | API pública, webhooks e rotinas agendadas | 11 arquivos |
| `erroBanco` | função | `src/lib/api/servidor.ts:77` | API pública, webhooks e rotinas agendadas | 15 arquivos |
| `erroCaptcha` | função | `src/lib/login-servidor.ts:8` | Login, segurança, usuários e permissões | 2 arquivos |
| `ErroIa` | classe | `src/lib/ia.ts:20` | Comum | 4 arquivos |
| `ErroOllama` | classe | `src/lib/ai/offline-chat.ts:26` | Comum | 2 arquivos |
| `escala` | função | `src/components/graficos.tsx:36` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `Escolha` | componente | `src/components/campo/pecas.tsx:74` | Produção | 3 arquivos |
| `EscolhaPermissoes` | componente | `src/components/permissoes-visual.tsx:17` | Login, segurança, usuários e permissões | 1 arquivo |
| `escolherPontoPdv` | ação | `src/app/(app)/vendas/actions.ts:183` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `esconderAssistente` | ação | `src/app/(app)/primeiros-passos/actions.ts:22` | Início, painel, ajuda e configurações | 2 arquivos |
| `Escopo` | tipo | `src/lib/api/regras.ts:8` | API pública, webhooks e rotinas agendadas | — |
| `escopoLiberado` | função | `src/lib/api/regras.ts:48` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `ESCOPOS` | constante | `src/lib/api/regras.ts:10` | API pública, webhooks e rotinas agendadas | 3 arquivos |
| `ESCOPOS_VALIDOS` | constante | `src/lib/api/regras.ts:26` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `especies` | tabela | `supabase/migrations/20261026000001_schema.sql:610` | Comum | 7 arquivos |
| `ESPERA_INICIAL_MS` | constante | `src/lib/sync/queue.ts:8` | Comum | — |
| `ESPERA_MAXIMA_MS` | constante | `src/lib/sync/queue.ts:9` | Comum | 1 arquivo |
| `esperaAntes` | função | `src/lib/sync/queue.ts:19` | Comum | 1 arquivo |
| `esquecerDispositivos` | função | `src/lib/mfa.ts:117` | Login, segurança, usuários e permissões | 1 arquivo |
| `esquecerDispositivosConfiaveis` | ação | `src/app/(app)/seguranca/actions.ts:19` | Login, segurança, usuários e permissões | 1 arquivo |
| `estaAtivo` | função | `src/lib/menu.ts:60` | Comum | 1 arquivo |
| `EstadoAcao` | tipo | `src/lib/acao.ts:2` | Comum | 60 arquivos |
| `EstadoAceite` | tipo | `src/app/aceitar-termos/actions.ts:7` | Login, segurança, usuários e permissões | 1 arquivo |
| `EstadoCodigoEmail` | tipo | `src/app/auth/mfa/actions.ts:11` | Login, segurança, usuários e permissões | 1 arquivo |
| `EstadoFila` | tipo | `src/components/campo/fila-cliente.ts:23` | Produção | 1 arquivo |
| `EstadoLogin` | tipo | `src/app/login/actions.ts:11` | Login, segurança, usuários e permissões | 1 arquivo |
| `EstadoModelo` | tipo | `src/app/(app)/configuracoes/importar/actions.ts:219` | Importação | 1 arquivo |
| `EstadoNfce` | tipo | `src/app/(app)/notas/actions.ts:90` | Fiscal | 1 arquivo |
| `EstadoOnboarding` | tipo | `src/app/onboarding/actions.ts:8` | Início, painel, ajuda e configurações | 1 arquivo |
| `EstadoSegredo` | tipo | `src/app/(app)/configuracoes/api/actions.ts:11` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `EstadoSenha` | tipo | `src/app/auth/primeiro-acesso/actions.ts:9` | Login, segurança, usuários e permissões | 1 arquivo |
| `estoque_peixe` | view | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:306` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `estoque_peixe_ponto` | view | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:321` | Vendas, PDV, estoque, produtos e ração | 5 arquivos |
| `estoque_produtos` | view | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:340` | Vendas, PDV, estoque, produtos e ração | 4 arquivos |
| `EstoqueImportado` | tipo | `src/lib/importacao.ts:34` | Importação | — |
| `EstoqueLinha` | tipo | `src/lib/estoque-carrinho.ts:9` | Vendas, PDV, estoque, produtos e ração | — |
| `estoqueNoCarrinho` | função | `src/lib/estoque-carrinho.ts:18` | Vendas, PDV, estoque, produtos e ração | 4 arquivos |
| `estoqueUtil` | função | `src/lib/previsao-racao.ts:312` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `estornar_baixa_racao` | função SQL | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:455` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `estornar_baixas` | função SQL | `supabase/migrations/20261028190000_acoes_titulos.sql:176` | Financeiro | 1 arquivo |
| `estornarBaixa` | ação | `src/app/(app)/_titulos/actions.ts:205` | Financeiro | 1 arquivo |
| `estornarSaidaRacao` | ação | `src/app/(app)/racao/actions.ts:72` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `estudar` | função | `src/lib/planejamento.ts:539` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `Estudo` | tipo | `src/lib/planejamento.ts:499` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `estudosDoPlano` | função | `src/lib/planejamento-dados.ts:119` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `Etapa` | tipo | `src/lib/importacao-modelo.ts:14` | Importação | — |
| `Etapa` | tipo | `src/lib/planejamento.ts:13` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `etapasDoCiclo` | função | `src/lib/planejamento.ts:136` | Planejamento, previsões, custo do kg e relatórios | — |
| `Etiqueta` | componente | `src/components/ui.tsx:150` | Comum | 49 arquivos |
| `Evento` | tipo | `src/lib/api/regras.ts:28` | API pública, webhooks e rotinas agendadas | — |
| `Evento` | tipo | `src/lib/planejamento.ts:91` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `EVENTO_LATERAL` | constante | `src/lib/lateral.ts:7` | Comum | — |
| `EventoAssinatura` | tipo | `src/lib/assinatura-mapa.ts:44` | Cobrança | 1 arquivo |
| `eventoDaAssinatura` | função | `src/lib/assinatura-mapa.ts:76` | Cobrança | 2 arquivos |
| `eventoDoPagamento` | função | `src/lib/assinatura-mapa.ts:70` | Cobrança | 2 arquivos |
| `EVENTOS` | constante | `src/lib/api/regras.ts:30` | API pública, webhooks e rotinas agendadas | 3 arquivos |
| `eventos_sanitarios` | tabela | `supabase/migrations/20261026000001_schema.sql:718` | Produção | 4 arquivos |
| `eventos_seguranca` | tabela | `supabase/migrations/20261030140000_alarmes_seguranca.sql:8` | Login, segurança, usuários e permissões | — |
| `EVENTOS_VALIDOS` | constante | `src/lib/api/regras.ts:42` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `EVENTOS_WEBHOOK_PISCICULTURA` | constante | `src/lib/asaas-mapa.ts:155` | Cobrança | — |
| `excluir_entrada_racao` | função SQL | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:594` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `excluir_lancamento` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:239` | Financeiro | 1 arquivo |
| `excluir_titulos` | função SQL | `supabase/migrations/20261028190000_acoes_titulos.sql:120` | Financeiro | 1 arquivo |
| `excluirBiometria` | ação | `src/app/(app)/lotes/actions.ts:215` | Produção | 1 arquivo |
| `excluirCategoria` | ação | `src/app/(app)/categorias/actions.ts:57` | Financeiro | 1 arquivo |
| `excluirCentroCusto` | ação | `src/app/(app)/centros-de-custo/actions.ts:36` | Financeiro | 1 arquivo |
| `excluirConta` | ação | `src/app/(app)/contas/actions.ts:63` | Financeiro | 1 arquivo |
| `excluirContato` | ação | `src/app/(app)/contatos/actions.ts:58` | Financeiro | 1 arquivo |
| `excluirCusto` | ação | `src/app/(app)/planejamento/actions.ts:146` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `excluirEntradaRacao` | ação | `src/app/(app)/racao/actions.ts:44` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `excluirItemChecklist` | ação | `src/app/(app)/apontamentos/actions.ts:219` | Produção | 1 arquivo |
| `excluirLancamento` | ação | `src/app/(app)/apontamentos/actions.ts:118` | Produção | 1 arquivo |
| `ExcluirLancamento` | componente | `src/app/(app)/apontamentos/excluir-lancamento.tsx:11` | Produção | 1 arquivo |
| `ExcluirLinha` | componente | `src/components/excluir-linha.tsx:8` | Comum | 5 arquivos |
| `excluirLote` | ação | `src/app/(app)/lotes/actions.ts:105` | Produção | 1 arquivo |
| `excluirLotePlanejado` | ação | `src/app/(app)/planejamento/actions.ts:102` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `excluirMedicamento` | ação | `src/app/(app)/medicamentos/actions.ts:59` | Produção | 1 arquivo |
| `excluirPedidoFixo` | ação | `src/app/(app)/vendas/fixos/actions.ts:49` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `excluirProduto` | ação | `src/app/(app)/produtos/actions.ts:123` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `excluirRegra` | ação | `src/app/(app)/conciliacao/actions.ts:334` | Financeiro | 1 arquivo |
| `excluirRegraFiscal` | ação | `src/app/(app)/notas/actions.ts:395` | Fiscal | 1 arquivo |
| `excluirSetor` | ação | `src/app/(app)/piscicultura/actions.ts:51` | Produção | 1 arquivo |
| `excluirTabelaPreco` | ação | `src/app/(app)/tabelas-de-preco/actions.ts:53` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `excluirViveiro` | ação | `src/app/(app)/piscicultura/actions.ts:104` | Produção | 1 arquivo |
| `exigir_troca_senha` | função SQL | `supabase/migrations/20261029223000_login_local.sql:152` | Comum | 1 arquivo |
| `exigirAceiteTermos` | função | `src/lib/aceite-termos.ts:26` | Login, segurança, usuários e permissões | 5 arquivos |
| `exigirAcesso` | função | `src/lib/permissoes.ts:22` | Login, segurança, usuários e permissões | 58 arquivos |
| `exigirMaster` | função | `src/lib/permissoes.ts:27` | Login, segurança, usuários e permissões | 6 arquivos |
| `exigirSegundoFator` | função | `src/lib/mfa.ts:11` | Login, segurança, usuários e permissões | 3 arquivos |
| `Existente` | tipo | `src/lib/campo/fila.ts:10` | Produção | 1 arquivo |
| `Extrato` | tipo | `src/lib/ofx.ts:12` | Financeiro | — |
| `extratoComSinal` | função | `src/lib/importacao-nibo.ts:107` | Importação | — |
| `Faixa` | componente | `src/components/ui.tsx:348` | Comum | 8 arquivos |
| `Faixa` | tipo | `src/lib/regua-cobranca.ts:5` | Cobrança | 1 arquivo |
| `FaixaArracoamento` | tipo | `src/lib/previsao-racao.ts:20` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `faixaClasse` | função | `src/lib/pescado.ts:100` | Comum | 5 arquivos |
| `FaixaCobranca` | tipo | `src/lib/whatsapp-texto.ts:87` | Comum | 1 arquivo |
| `faixaDaRegua` | função | `src/lib/regua-cobranca.ts:15` | Cobrança | 2 arquivos |
| `faixaDoPeso` | função | `src/lib/previsao-racao.ts:56` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `FAIXAS` | constante | `src/lib/regua-cobranca.ts:6` | Cobrança | 1 arquivo |
| `FAIXAS_AGING` | constante | `src/lib/relatorios.ts:71` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `faixaTitulo` | função | `src/lib/planilha.ts:24` | Comum | 1 arquivo |
| `FalarApontamento` | componente | `src/components/assistentes-apontamento.tsx:29` | Produção | 1 arquivo |
| `falha` | função | `src/lib/acao.ts:4` | Comum | 43 arquivos |
| `falhaTemporaria` | função | `src/lib/supabase/falha-auth.ts:5` | Login, segurança, usuários e permissões | 2 arquivos |
| `faltasLcdpr` | função | `src/lib/lcdpr.ts:77` | Comum | 3 arquivos |
| `FaseCusto` | tipo | `src/lib/planejamento.ts:469` | Planejamento, previsões, custo do kg e relatórios | — |
| `FASES` | constante | `src/lib/rotulos.ts:2` | Comum | 7 arquivos |
| `FASES_CUSTO` | constante | `src/app/(app)/planejamento/parametros/custos.tsx:11` | Planejamento, previsões, custo do kg e relatórios | — |
| `FATOR_MAX` | constante | `src/lib/crescimento.ts:98` | Produção | — |
| `FATOR_MIN` | constante | `src/lib/crescimento.ts:97` | Produção | — |
| `fatorCrescimento` | função | `src/lib/crescimento.ts:100` | Produção | 3 arquivos |
| `faturar_pedido` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:893` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `faturarPedido` | ação | `src/app/(app)/vendas/actions.ts:211` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `faturas_cartao` | view | `supabase/migrations/20261028060000_fuso_da_empresa.sql:1161` | Financeiro | 1 arquivo |
| `fazerPedido` | ação | `src/app/pedido/[token]/actions.ts:12` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `fechar_mes` | função SQL | `supabase/migrations/20261026000005_conciliacao_relatorios.sql:224` | Comum | — |
| `fecharLoteCampo` | função | `src/lib/campo/servidor.ts:182` | Produção | 1 arquivo |
| `FecharLoteCampo` | tipo | `src/lib/campo/validar.ts:124` | Produção | — |
| `fecharMes` | ação | `src/app/(app)/relatorios/dre/actions.ts:19` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `fecharPagamento` | função | `src/lib/vendas.ts:134` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `Ficha` | componente | `src/components/ui.tsx:278` | Comum | 3 arquivos |
| `filaDeConsumo` | função | `src/lib/previsao-racao.ts:394` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `filaGuardada` | função | `e2e/apoio.ts:37` | Comum | 2 arquivos |
| `Finalidade` | tipo | `src/lib/planejamento.ts:12` | Planejamento, previsões, custo do kg e relatórios | — |
| `FINALIDADES_VIVEIRO` | constante | `src/lib/rotulos.ts:29` | Comum | 3 arquivos |
| `FinalidadeViveiro` | tipo | `src/lib/importacao.ts:24` | Importação | 1 arquivo |
| `Financeiro` | tipo | `src/lib/analise-periodo.ts:256` | Planejamento, previsões, custo do kg e relatórios | — |
| `fixar_saldos_importacao` | função SQL | `supabase/migrations/20261029020000_nibo_sincronizar.sql:111` | Importação | 1 arquivo |
| `fluxo_previsto` | view | `supabase/migrations/20261028060000_fuso_da_empresa.sql:1107` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `fluxoMensal` | função | `src/lib/planejamento.ts:637` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `fmt` | função | `src/components/campo/pecas.tsx:20` | Produção | 11 arquivos |
| `FMT_DATA` | constante | `src/lib/planilha.ts:17` | Comum | — |
| `FMT_PCT` | constante | `src/lib/planilha.ts:16` | Comum | 1 arquivo |
| `FMT_REAIS` | constante | `src/lib/planilha.ts:15` | Comum | 1 arquivo |
| `focus` | função | `src/lib/focus.ts:51` | Fiscal | 3 arquivos |
| `focus_emitentes` | tabela | `supabase/migrations/20261029140000_nfe_completa.sql:6` | Fiscal | 3 arquivos |
| `focus_emitentes_segredos` | tabela | `supabase/migrations/20261029140000_nfe_completa.sql:18` | Fiscal | 2 arquivos |
| `focusBase` | função | `src/lib/focus.ts:8` | Fiscal | — |
| `focusEmpresas` | função | `src/lib/focus.ts:56` | Fiscal | 2 arquivos |
| `Folha` | componente | `src/components/campo/folha.tsx:24` | Produção | 1 arquivo |
| `FolhasCampo` | componente | `src/components/campo/folhas-campo.tsx:20` | Produção | 1 arquivo |
| `FONTE` | constante | `src/lib/planilha.ts:13` | Comum | 2 arquivos |
| `FonteManejo` | tipo | `src/lib/campo/conhecimento-tambaqui.ts:9` | Produção | — |
| `FONTES` | constante | `src/lib/campo/conhecimento-tambaqui.ts:11` | Produção | 1 arquivo |
| `FONTES_REFERENCIA` | constante | `src/lib/zootecnico.ts:217` | Produção | 1 arquivo |
| `foraDoEsperado` | função | `src/lib/sugestao-apontamento.ts:48` | Produção | 3 arquivos |
| `foraDoPlano` | função | `src/lib/permissoes.ts:34` | Login, segurança, usuários e permissões | 7 arquivos |
| `FormAbrirLote` | componente | `src/components/campo/form-lote.tsx:20` | Produção | 1 arquivo |
| `FormAcao` | componente | `src/components/form-acao.tsx:17` | Comum | 27 arquivos |
| `FormAceite` | componente | `src/app/aceitar-termos/form.tsx:9` | Login, segurança, usuários e permissões | 1 arquivo |
| `FormaPdv` | tipo | `src/lib/vendas.ts:130` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `FORMAS_PAGAMENTO` | constante | `src/lib/titulos.ts:55` | Financeiro | 7 arquivos |
| `FORMAS_PDV` | constante | `src/lib/vendas.ts:129` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `formatarCelular` | função | `src/lib/whatsapp-texto.ts:19` | Comum | 2 arquivos |
| `formatarData` | função | `src/lib/formato.ts:26` | Comum | 63 arquivos |
| `formatarDataHora` | função | `src/lib/historico.ts:124` | Login, segurança, usuários e permissões | 2 arquivos |
| `formatarDocumento` | função | `src/lib/documento.ts:21` | Comum | 2 arquivos |
| `formatarInteiro` | função | `src/lib/formato.ts:21` | Comum | 25 arquivos |
| `formatarLinha` | função | `src/lib/boleto.ts:84` | Comum | 3 arquivos |
| `formatarMoeda` | função | `src/lib/formato.ts:6` | Comum | 59 arquivos |
| `formatarNumero` | função | `src/lib/formato.ts:10` | Comum | 27 arquivos |
| `formatarQuantidade` | função | `src/lib/formato.ts:16` | Comum | 7 arquivos |
| `formatarValorCampo` | função | `src/lib/historico.ts:96` | Login, segurança, usuários e permissões | 2 arquivos |
| `Formato` | tipo | `src/lib/relatorios-catalogo.ts:7` | Planejamento, previsões, custo do kg e relatórios | — |
| `FORMATO_LOGIN` | constante | `src/lib/login-local.ts:5` | Login, segurança, usuários e permissões | 2 arquivos |
| `FormBiometria` | componente | `src/components/campo/form-biometria.tsx:31` | Produção | 1 arquivo |
| `FormEmpresa` | componente | `src/app/onboarding/form.tsx:7` | Início, painel, ajuda e configurações | 1 arquivo |
| `FormFecharLote` | componente | `src/components/campo/form-lote.tsx:93` | Produção | 1 arquivo |
| `FormInsumo` | componente | `src/components/campo/form-insumo.tsx:20` | Produção | 1 arquivo |
| `FormLogin` | componente | `src/app/login/form.tsx:14` | Login, segurança, usuários e permissões | 1 arquivo |
| `FormMfa` | componente | `src/app/auth/mfa/form.tsx:15` | Login, segurança, usuários e permissões | 1 arquivo |
| `FormMovimento` | componente | `src/components/movimento-estoque.tsx:34` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `FormNovaSenha` | componente | `src/components/nova-senha.tsx:8` | Comum | 2 arquivos |
| `FormPainel` | componente | `src/components/cadastro.tsx:439` | Comum | 15 arquivos |
| `FormPrimeiroAcesso` | componente | `src/app/auth/primeiro-acesso/form.tsx:7` | Login, segurança, usuários e permissões | 1 arquivo |
| `FormRacao` | componente | `src/components/campo/form-racao.tsx:41` | Produção | 1 arquivo |
| `FormRecuperacao` | componente | `src/app/auth/nova-senha/form.tsx:13` | Login, segurança, usuários e permissões | 1 arquivo |
| `FormSegredo` | componente | `src/app/(app)/configuracoes/api/form-segredo.tsx:9` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `FormSenhaConvite` | componente | `src/app/auth/convite/form.tsx:12` | Login, segurança, usuários e permissões | 1 arquivo |
| `formula_itens` | tabela | `supabase/migrations/20261026000001_schema.sql:812` | Vendas, PDV, estoque, produtos e ração | — |
| `FormularioPedido` | componente | `src/app/pedido/[token]/formulario.tsx:11` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `formulas_racao` | tabela | `supabase/migrations/20261026000001_schema.sql:800` | Vendas, PDV, estoque, produtos e ração | — |
| `FormZerar` | componente | `src/app/(app)/configuracoes/zerar-financeiro/form.tsx:12` | Financeiro | 1 arquivo |
| `FormZerarSistema` | componente | `src/app/(app)/configuracoes/zerar-sistema/form.tsx:13` | Financeiro | 1 arquivo |
| `FORNECEDOR` | constante | `src/lib/termos.ts:13` | Login, segurança, usuários e permissões | 3 arquivos |
| `FotoMortes` | componente | `src/components/assistentes-apontamento.tsx:84` | Produção | 1 arquivo |
| `Frase` | tipo | `src/lib/zootecnico.ts:229` | Produção | — |
| `frasesLote` | função | `src/lib/zootecnico.ts:231` | Produção | 3 arquivos |
| `FREQUENCIAS` | constante | `src/lib/titulos.ts:45` | Financeiro | 2 arquivos |
| `fretePorUnidade` | função | `src/lib/pontos.ts:18` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `FUSO_PADRAO` | constante | `src/lib/formato.ts:91` | Comum | — |
| `FUSOS_BRASIL` | constante | `src/lib/formato.ts:94` | Comum | 2 arquivos |
| `generateViewport` | função | `src/app/(app)/layout.tsx:26` | Início, painel, ajuda e configurações | — |
| `gerar_pedidos_fixos` | função SQL | `supabase/migrations/20261101170000_automacoes_vendas.sql:93` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `gerar_recorrencias` | função SQL | `supabase/migrations/20261026000011_usuarios_permissoes.sql:423` | Financeiro | — |
| `gerarLcdpr` | função | `src/lib/lcdpr.ts:35` | Comum | 2 arquivos |
| `gerarSegredoWebhook` | função | `src/lib/api/regras.ts:316` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `gerarToken` | função | `src/lib/api/regras.ts:60` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `gerarTokenConexao` | ação | `src/app/(app)/conciliacao/open-finance-actions.ts:28` | Financeiro | 1 arquivo |
| `GET` | função | `src/app/(app)/configuracoes/importar/modelo/route.ts:8` | Importação | — |
| `GET` | função | `src/app/(app)/configuracoes/zerar-financeiro/backup/route.ts:24` | Financeiro | — |
| `GET` | função | `src/app/(app)/configuracoes/zerar-sistema/backup/route.ts:61` | Financeiro | — |
| `GET` | função | `src/app/(app)/notas/recebidas/[id]/xml/route.ts:6` | Fiscal | — |
| `GET` | função | `src/app/(app)/relatorios/apresentacao/route.ts:12` | Planejamento, previsões, custo do kg e relatórios | — |
| `GET` | função | `src/app/(app)/relatorios/contador/baixar/route.ts:9` | Planejamento, previsões, custo do kg e relatórios | — |
| `GET` | função | `src/app/(app)/relatorios/contador/lcdpr/route.ts:7` | Planejamento, previsões, custo do kg e relatórios | — |
| `GET` | função | `src/app/(app)/relatorios/exportar/route.ts:26` | Planejamento, previsões, custo do kg e relatórios | — |
| `GET` | função | `src/app/api/chat/route.ts:8` | Comum | — |
| `GET` | função | `src/app/api/cron/automacoes/route.ts:20` | API pública, webhooks e rotinas agendadas | — |
| `GET` | função | `src/app/api/cron/open-finance/route.ts:9` | API pública, webhooks e rotinas agendadas | — |
| `GET` | função | `src/app/api/cron/webhooks/route.ts:9` | API pública, webhooks e rotinas agendadas | — |
| `GET` | função | `src/app/api/entrada/whatsapp/route.ts:17` | Comum | — |
| `GET` | função | `src/app/api/notas/[id]/[tipo]/route.ts:16` | Fiscal | — |
| `GET` | constante | `src/app/api/v1/categorias/route.ts:4` | API pública, webhooks e rotinas agendadas | — |
| `GET` | constante | `src/app/api/v1/centros-de-custo/route.ts:3` | Financeiro | — |
| `GET` | constante | `src/app/api/v1/contas/route.ts:4` | API pública, webhooks e rotinas agendadas | — |
| `GET` | constante | `src/app/api/v1/contatos/[id]/route.ts:7` | API pública, webhooks e rotinas agendadas | — |
| `GET` | constante | `src/app/api/v1/contatos/route.ts:7` | API pública, webhooks e rotinas agendadas | — |
| `GET` | constante | `src/app/api/v1/estoque/route.ts:7` | API pública, webhooks e rotinas agendadas | — |
| `GET` | constante | `src/app/api/v1/lancamentos/[id]/route.ts:6` | API pública, webhooks e rotinas agendadas | — |
| `GET` | constante | `src/app/api/v1/lancamentos/route.ts:9` | API pública, webhooks e rotinas agendadas | — |
| `GET` | constante | `src/app/api/v1/me/route.ts:5` | API pública, webhooks e rotinas agendadas | — |
| `GET` | constante | `src/app/api/v1/movimentos/route.ts:5` | API pública, webhooks e rotinas agendadas | — |
| `GET` | constante | `src/app/api/v1/produtos/[id]/route.ts:7` | API pública, webhooks e rotinas agendadas | — |
| `GET` | constante | `src/app/api/v1/produtos/route.ts:8` | API pública, webhooks e rotinas agendadas | — |
| `GET` | função | `src/app/api/v1/route.ts:4` | API pública, webhooks e rotinas agendadas | — |
| `GET` | constante | `src/app/api/v1/vendas/[id]/route.ts:5` | API pública, webhooks e rotinas agendadas | — |
| `GET` | constante | `src/app/api/v1/vendas/route.ts:8` | API pública, webhooks e rotinas agendadas | — |
| `GET` | função | `src/app/auth/confirmar/route.ts:6` | Login, segurança, usuários e permissões | — |
| `getAssinatura` | função | `src/lib/assinatura.ts:9` | Cobrança | 5 arquivos |
| `getAssistente` | função | `src/lib/assistente-dados.ts:8` | Início, painel, ajuda e configurações | 2 arquivos |
| `getClaimsDaSessao` | função | `src/lib/auth.ts:10` | Login, segurança, usuários e permissões | 1 arquivo |
| `getEmpresaAtual` | função | `src/lib/empresa.ts:35` | Início, painel, ajuda e configurações | 123 arquivos |
| `getPermissoes` | função | `src/lib/permissoes.ts:12` | Login, segurança, usuários e permissões | 74 arquivos |
| `getUsuario` | função | `src/lib/auth.ts:16` | Login, segurança, usuários e permissões | 10 arquivos |
| `GraficoColunas` | componente | `src/components/graficos.tsx:85` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `GraficoCrescimento` | componente | `src/components/campo/grafico-crescimento.tsx:16` | Produção | 1 arquivo |
| `GraficoLinha` | componente | `src/components/graficos.tsx:148` | Planejamento, previsões, custo do kg e relatórios | 4 arquivos |
| `gravarApontamentoCampo` | função | `src/lib/apontamento-campo-servidor.ts:43` | Produção | 2 arquivos |
| `gravarBiometriaCampo` | função | `src/lib/campo/servidor.ts:133` | Produção | 1 arquivo |
| `gravarDados` | função | `e2e/apoio.ts:80` | Comum | 1 arquivo |
| `gravarItem` | função | `src/lib/db/indexeddb.ts:187` | Comum | 5 arquivos |
| `gravarJson` | função | `src/lib/db/indexeddb.ts:223` | Comum | 2 arquivos |
| `gravarPedidoCampo` | função | `src/lib/pedido-campo-servidor.ts:9` | Produção | 2 arquivos |
| `gravarVendaBalcao` | função | `src/lib/pdv-servidor.ts:12` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `Grupo` | tipo | `src/lib/importacao.ts:7` | Importação | 1 arquivo |
| `Grupo` | tipo | `src/lib/menu.ts:8` | Comum | 1 arquivo |
| `grupoAtivo` | função | `src/lib/menu.ts:69` | Comum | 2 arquivos |
| `GrupoBiometria` | tipo | `src/lib/biometria-grupos.ts:5` | Comum | 4 arquivos |
| `GrupoModulos` | tipo | `src/lib/modulos.ts:13` | Comum | — |
| `grupoPeloNome` | função | `src/lib/importacao.ts:121` | Importação | 2 arquivos |
| `GrupoProduto` | tipo | `src/app/(app)/produtos/lista.tsx:40` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `GRUPOS` | constante | `src/lib/modulos.ts:15` | Comum | 6 arquivos |
| `GRUPOS_CATALOGO` | constante | `src/lib/permissoes-regras.ts:39` | Login, segurança, usuários e permissões | 2 arquivos |
| `GRUPOS_CATEGORIA` | constante | `src/lib/titulos.ts:65` | Financeiro | 8 arquivos |
| `GRUPOS_DRE` | constante | `src/lib/relatorios.ts:107` | Planejamento, previsões, custo do kg e relatórios | — |
| `GruposBiometria` | componente | `src/components/grupos-biometria.tsx:20` | Comum | 1 arquivo |
| `hashToken` | função | `src/lib/cripto.ts:26` | Login, segurança, usuários e permissões | 5 arquivos |
| `historico` | trigger | `supabase/migrations/20261028201500_historico_alteracoes.sql:137` | Comum | — |
| `hojeISO` | função | `src/lib/formato.ts:109` | Comum | 78 arquivos |
| `hojeManaus` | função | `e2e/apoio.ts:126` | Comum | 2 arquivos |
| `hora` | função | `src/components/campo/pecas.tsx:207` | Produção | — |
| `Horizonte` | tipo | `src/lib/previsao-racao.ts:84` | Vendas, PDV, estoque, produtos e ração | — |
| `HORIZONTES` | constante | `src/lib/previsao-racao.ts:45` | Vendas, PDV, estoque, produtos e ração | — |
| `hrefAtivo` | função | `src/lib/menu.ts:65` | Comum | 1 arquivo |
| `HUB_CADASTROS` | constante | `src/lib/menu.ts:22` | Comum | — |
| `ia_uso` | tabela | `supabase/migrations/20261101180000_documentos_recebidos.sql:14` | Comum | 1 arquivo |
| `iaConfigurada` | função | `src/lib/ia.ts:16` | Comum | 6 arquivos |
| `ICONES` | constante | `src/components/menu-lateral.tsx:47` | Comum | 1 arquivo |
| `idadeEquivalente` | função | `src/lib/crescimento.ts:33` | Produção | 3 arquivos |
| `idAsaas` | função | `src/lib/asaas-mapa.ts:137` | Cobrança | 5 arquivos |
| `ignorar_movimento` | função SQL | `supabase/migrations/20261026000005_conciliacao_relatorios.sql:157` | Financeiro | 1 arquivo |
| `ignorarMovimento` | ação | `src/app/(app)/conciliacao/actions.ts:164` | Financeiro | 1 arquivo |
| `imovelDe` | função | `src/lib/lcdpr-dados.ts:17` | Comum | 1 arquivo |
| `ImovelLcdpr` | tipo | `src/lib/lcdpr.ts:11` | Comum | 1 arquivo |
| `Importacao` | tipo | `src/app/(app)/conciliacao/importacoes.tsx:9` | Importação | 1 arquivo |
| `importacao_vinculos` | tabela | `supabase/migrations/20261027140000_importacao.sql:6` | Importação | 3 arquivos |
| `Importacoes` | componente | `src/app/(app)/conciliacao/importacoes.tsx:75` | Importação | 1 arquivo |
| `importacoes_extrato` | tabela | `supabase/migrations/20261026000001_schema.sql:377` | Importação | 1 arquivo |
| `importar_conciliacao` | função SQL | `supabase/migrations/20261028230000_nibo_saldos_conciliacao.sql:315` | Importação | 1 arquivo |
| `importar_extrato` | função SQL | `supabase/migrations/20261103180000_saldo_so_ao_lancar.sql:12` | Importação | 2 arquivos |
| `importar_pacote` | função SQL | `supabase/migrations/20261029050000_importacao_planilha_modelo.sql:10` | Importação | 1 arquivo |
| `importar_piscicultura` | função SQL | `supabase/migrations/20261105000005_piscicultura_cadastros.sql:243` | Importação | 1 arquivo |
| `importarModelo` | ação | `src/app/(app)/configuracoes/importar/actions.ts:289` | Importação | 1 arquivo |
| `ImportarModelo` | componente | `src/app/(app)/configuracoes/importar/importar-modelo.tsx:11` | Importação | 1 arquivo |
| `importarNibo` | ação | `src/app/(app)/configuracoes/importar/actions.ts:119` | Importação | 1 arquivo |
| `importarOfx` | ação | `src/app/(app)/conciliacao/actions.ts:37` | Financeiro | 1 arquivo |
| `ImportarOfx` | componente | `src/app/(app)/conciliacao/importar-ofx.tsx:17` | Importação | 1 arquivo |
| `importarPlanilha` | ação | `src/app/(app)/configuracoes/importar/actions.ts:175` | Importação | 1 arquivo |
| `impressao` | função | `src/lib/planilha.ts:53` | Comum | 1 arquivo |
| `incluirCustosModelo` | ação | `src/app/(app)/planejamento/actions.ts:156` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `Indicador` | componente | `src/components/ui.tsx:317` | Comum | 8 arquivos |
| `INDICADORES` | constante | `src/lib/zootecnico.ts:102` | Produção | 1 arquivo |
| `indicadores_lote_dia` | view | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:236` | Produção | 3 arquivos |
| `indicadores_lote_semana` | view | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:256` | Produção | 4 arquivos |
| `InfoPasso` | tipo | `src/lib/assistente.ts:7` | Início, painel, ajuda e configurações | — |
| `Inicio` | componente | `src/app/page.tsx:3` | Início, painel, ajuda e configurações | — |
| `inicioDoDia` | função | `src/lib/historico.ts:133` | Login, segurança, usuários e permissões | 2 arquivos |
| `inscricoes_com_permissao` | função SQL | `supabase/migrations/20261101130000_automacoes_resumo.sql:35` | Login, segurança, usuários e permissões | 1 arquivo |
| `instanteValido` | função | `src/lib/api/regras.ts:99` | API pública, webhooks e rotinas agendadas | 4 arquivos |
| `INSTRUCOES_MANEJO` | constante | `src/lib/campo/manejo-ia.ts:11` | Produção | 2 arquivos |
| `InsumoCampo` | tipo | `src/lib/campo/validar.ts:160` | Produção | — |
| `InsumoOpcao` | tipo | `src/lib/campo/tipos.ts:57` | Produção | 1 arquivo |
| `integracoes_empresa` | tabela | `supabase/migrations/20261028230000_nibo_saldos_conciliacao.sql:12` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `interpretarFala` | função | `src/lib/fala-apontamento.ts:97` | Produção | 4 arquivos |
| `interpretarPlanilha` | função | `src/lib/importacao-modelo.ts:530` | Importação | 2 arquivos |
| `InterruptorTema` | componente | `src/components/tema.tsx:93` | Comum | 1 arquivo |
| `INTERVALO_SYNC_MS` | constante | `src/lib/sync/worker.ts:9` | Comum | 1 arquivo |
| `inutilizacoes_nfe` | tabela | `supabase/migrations/20261029140000_nfe_completa.sql:98` | Fiscal | 3 arquivos |
| `inutilizarNumeracao` | ação | `src/app/(app)/notas/actions.ts:215` | Fiscal | 1 arquivo |
| `inventariar_ponto` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:651` | RH e cartão de ponto | 1 arquivo |
| `ipDaRequisicao` | função | `src/lib/login-servidor.ts:35` | Login, segurança, usuários e permissões | 2 arquivos |
| `ipPrivado` | função | `src/lib/api/regras.ts:321` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `iso` | função | `src/lib/planejamento.ts:116` | Planejamento, previsões, custo do kg e relatórios | — |
| `item_so_de_venda` | trigger | `supabase/migrations/20261102170000_produtos_para_venda.sql:48` | Vendas, PDV, estoque, produtos e ração | — |
| `ItemBalcao` | tipo | `src/lib/pdv.ts:6` | Vendas, PDV, estoque, produtos e ração | — |
| `ItemCentral` | tipo | `src/app/(app)/relatorios/central.tsx:17` | Planejamento, previsões, custo do kg e relatórios | — |
| `ItemChecklist` | tipo | `src/lib/apontamento-racao.ts:28` | Produção | — |
| `ItemChecklistCampo` | tipo | `src/components/campo/contexto.tsx:10` | Produção | 1 arquivo |
| `ItemChecklistTela` | tipo | `src/app/(app)/apontamentos/campos-lancamento.tsx:17` | Produção | — |
| `ItemCusto` | tipo | `src/lib/planejamento.ts:472` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `itemDoCartao` | função | `src/lib/campo/propostas.ts:166` | Produção | 2 arquivos |
| `ItemEstoque` | tipo | `src/lib/previsao.ts:188` | Planejamento, previsões, custo do kg e relatórios | — |
| `ItemFila` | tipo | `src/lib/campo/fila.ts:12` | Produção | 10 arquivos |
| `ItemFluxo` | tipo | `src/lib/fluxo.ts:4` | Financeiro | — |
| `ItemNfe` | tipo | `src/lib/focus-mapa.ts:17` | Fiscal | 1 arquivo |
| `ItemOrdenavel` | tipo | `src/lib/ordem.ts:4` | Comum | 1 arquivo |
| `ItemPedidoCampo` | tipo | `src/lib/pedido-campo.ts:7` | Produção | — |
| `ItemPeriodo` | tipo | `src/lib/analise-periodo.ts:227` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `ItemPluggy` | tipo | `src/lib/open-finance.ts:52` | Financeiro | — |
| `ItemVenda` | tipo | `src/app/(app)/vendas/actions.ts:71` | Vendas, PDV, estoque, produtos e ração | — |
| `ItemVendido` | tipo | `src/lib/vendas.ts:21` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `itensDoCadastro` | função | `src/lib/menu.ts:25` | Comum | 2 arquivos |
| `itensVigentes` | função | `src/lib/planejamento.ts:525` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `janelaDeLeitura` | função | `src/lib/analise-periodo.ts:70` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `janelaReserva` | função | `src/lib/previsao-racao.ts:307` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `justificativaValida` | função | `src/lib/focus-mapa.ts:257` | Fiscal | 2 arquivos |
| `KG_CAIXA` | constante | `src/lib/pescado.ts:5` | Comum | 2 arquivos |
| `KpiSlide` | tipo | `src/lib/apresentacao.ts:17` | Planejamento, previsões, custo do kg e relatórios | — |
| `LancamentoHistorico` | tipo | `src/lib/sugestao-apontamento.ts:5` | Produção | 2 arquivos |
| `LancamentoLcdpr` | tipo | `src/lib/lcdpr.ts:18` | Comum | 1 arquivo |
| `LANCAMENTOS_BASE` | constante | `src/lib/sugestao-apontamento.ts:17` | Produção | — |
| `lancamentos_cartao` | view | `supabase/migrations/20261026000009_racao_cartao_comercial.sql:208` | Financeiro | 1 arquivo |
| `lancar_documento_recebido` | função SQL | `supabase/migrations/20261101180000_documentos_recebidos.sql:79` | Comum | 1 arquivo |
| `lancar_nfe_recebida` | função SQL | `supabase/migrations/20261101160000_nfes_recebidas.sql:106` | Fiscal | 1 arquivo |
| `lancar_pelo_historico` | função SQL | `supabase/migrations/20261101110000_automacoes_financeiro.sql:74` | Login, segurança, usuários e permissões | 1 arquivo |
| `lancarDocumento` | ação | `src/app/(app)/contas-a-pagar/documentos/actions.ts:34` | Financeiro | 1 arquivo |
| `lancarEntradaGrupo` | ação | `src/app/(app)/vendas/actions.ts:314` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `lancarEntradaRacao` | ação | `src/app/(app)/racao/actions.ts:21` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `lancarInsumoCampo` | função | `src/lib/campo/servidor.ts:209` | Produção | 1 arquivo |
| `lancarNfeRecebida` | ação | `src/app/(app)/notas/recebidas/actions.ts:23` | Fiscal | 1 arquivo |
| `lancarPeloHistorico` | ação | `src/app/(app)/conciliacao/actions.ts:246` | Financeiro | 1 arquivo |
| `LARGURA_COMPLETA` | constante | `src/lib/versao.ts:6` | Início, painel, ajuda e configurações | 1 arquivo |
| `lateralRecolhida` | função | `src/lib/lateral.ts:11` | Comum | 1 arquivo |
| `LayoutApp` | componente | `src/app/(app)/layout.tsx:31` | Início, painel, ajuda e configurações | — |
| `lcdpr_config` | tabela | `supabase/migrations/20261101190000_lcdpr_portal_cliente.sql:11` | Comum | 3 arquivos |
| `lcdpr_lancamentos` | função SQL | `supabase/migrations/20261101190000_lcdpr_portal_cliente.sql:39` | Financeiro | 1 arquivo |
| `Legenda` | componente | `src/components/graficos.tsx:46` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `leituras_sonda` | tabela | `supabase/migrations/20261106000001_sondas_iot.sql:31` | Comum | 1 arquivo |
| `lembretes_apontamento_devidos` | função SQL | `supabase/migrations/20261101100000_automacoes.sql:69` | Produção | 1 arquivo |
| `lembretes_enviados` | tabela | `supabase/migrations/20261101100000_automacoes.sql:42` | Comum | — |
| `lerAguaForm` | função | `src/lib/agua.ts:46` | Comum | 1 arquivo |
| `lerAno` | função | `src/lib/consultas-relatorio.ts:11` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `lerCausasForm` | função | `src/lib/causas-morte.ts:34` | Produção | 2 arquivos |
| `lerCentavos` | função | `src/lib/formato.ts:68` | Comum | 21 arquivos |
| `lerChecklist` | função | `src/lib/apontamento-racao.ts:32` | Produção | 2 arquivos |
| `lerCompetencia` | função | `src/lib/importacao-modelo.ts:390` | Importação | 1 arquivo |
| `lerCorpo` | função | `src/lib/api/servidor.ts:105` | API pública, webhooks e rotinas agendadas | 6 arquivos |
| `lerCsv` | função | `src/lib/importacao-planilha.ts:7` | Importação | 2 arquivos |
| `lerDados` | função | `e2e/apoio.ts:76` | Comum | 6 arquivos |
| `lerData` | função | `src/lib/importacao-modelo.ts:373` | Importação | 1 arquivo |
| `lerDecimal` | função | `src/lib/formato.ts:77` | Comum | 20 arquivos |
| `lerDocumento` | função | `src/lib/ia.ts:70` | Comum | 1 arquivo |
| `lerDocumento` | função | `src/lib/pontos.ts:30` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `lerDocumentoEnviado` | ação | `src/app/(app)/contas-a-pagar/documentos/actions.ts:20` | Financeiro | 1 arquivo |
| `lerEventoAssinatura` | função | `src/lib/assinatura-mapa.ts:47` | Cobrança | 2 arquivos |
| `lerFila` | função | `src/lib/campo/fila.ts:89` | Produção | 2 arquivos |
| `lerIdsLote` | função | `src/lib/selecao-lote.ts:24` | Produção | 1 arquivo |
| `lerInteiro` | função | `src/lib/formato.ts:85` | Comum | 10 arquivos |
| `lerInutilizacao` | função | `src/lib/focus-mapa.ts:251` | Fiscal | 2 arquivos |
| `lerItem` | função | `src/lib/db/indexeddb.ts:174` | Comum | 5 arquivos |
| `lerJson` | função | `src/lib/db/indexeddb.ts:213` | Comum | 2 arquivos |
| `lerKg` | função | `src/lib/pescado.ts:33` | Comum | 5 arquivos |
| `lerLinhaDigitavel` | função | `src/lib/boleto.ts:59` | Comum | 3 arquivos |
| `lerMedida` | função | `src/lib/agua.ts:21` | Comum | 2 arquivos |
| `lerNibo` | função | `src/lib/importacao-nibo.ts:528` | Importação | 1 arquivo |
| `lerNumero` | função | `src/components/campo/pecas.tsx:12` | Produção | 5 arquivos |
| `lerOfx` | função | `src/lib/ofx.ts:47` | Financeiro | 2 arquivos |
| `lerPagamento` | função | `src/lib/asaas-mapa.ts:118` | Cobrança | 2 arquivos |
| `lerPaginacao` | função | `src/lib/api/regras.ts:80` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `lerPeixes` | função | `src/lib/pescado.ts:43` | Comum | 2 arquivos |
| `lerRacoes` | função | `src/lib/apontamento-racao.ts:12` | Produção | 2 arquivos |
| `lerRateio` | função | `src/lib/rateio.ts:10` | Financeiro | 3 arquivos |
| `lerRateioTitulo` | ação | `src/app/(app)/_titulos/actions.ts:259` | Financeiro | 1 arquivo |
| `lerRegime` | função | `src/lib/consultas-relatorio.ts:7` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `lerRetorno` | função | `src/lib/focus-mapa.ts:156` | Fiscal | 3 arquivos |
| `lerTipo` | função | `src/lib/titulos.ts:41` | Financeiro | 1 arquivo |
| `lerTodas` | função | `src/lib/supabase/todas.ts:11` | Comum | 14 arquivos |
| `lerToken` | função | `src/lib/api/regras.ts:69` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `lerUf` | função | `src/lib/pontos.ts:37` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `lerValor` | função | `src/lib/importacao-modelo.ts:348` | Importação | 1 arquivo |
| `lerWebhook` | função | `src/lib/asaas-mapa.ts:94` | Cobrança | 2 arquivos |
| `lerWebhook` | função | `src/lib/whatsapp-texto.ts:50` | Comum | 2 arquivos |
| `lerXlsx` | função | `src/lib/importacao-modelo-xlsx.ts:89` | Importação | 2 arquivos |
| `lerXmlNfe` | função | `src/lib/nfe-xml.ts:18` | Fiscal | 3 arquivos |
| `liberar` | função | `src/lib/sync/queue.ts:41` | Comum | 3 arquivos |
| `liberarPorDispositivo` | função | `src/lib/mfa.ts:93` | Login, segurança, usuários e permissões | 1 arquivo |
| `LIMITE_LINHAS_RATEIO` | constante | `src/lib/rateio.ts:7` | Financeiro | — |
| `limiteNibo` | constante | `src/lib/importacao-nibo.ts:417` | Importação | 1 arquivo |
| `LIMITES` | constante | `src/lib/previsao.ts:114` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `limpa_regra_ao_voltar` | trigger | `supabase/migrations/20261029150000_regra_ignorar.sql:115` | Financeiro | — |
| `LINHA_CABECALHO` | constante | `src/lib/planilha.ts:18` | Comum | 2 arquivos |
| `LinhaAging` | tipo | `src/lib/relatorios.ts:79` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `LinhaCadastro` | tipo | `src/components/cadastro.tsx:25` | Comum | 1 arquivo |
| `LinhaCaixa` | tipo | `src/lib/painel.ts:4` | Início, painel, ajuda e configurações | 2 arquivos |
| `linhaDaTransacao` | função | `src/lib/open-finance-mapa.ts:43` | Financeiro | 3 arquivos |
| `LinhaDoTempo` | componente | `src/app/(app)/planejamento/linha-do-tempo.tsx:38` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `LinhaDre` | tipo | `src/lib/relatorios.ts:116` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `LinhaExtrato` | tipo | `src/lib/ofx.ts:3` | Financeiro | 1 arquivo |
| `LinhaInicial` | tipo | `src/components/rateio.tsx:9` | Financeiro | 1 arquivo |
| `LinhaLida` | tipo | `src/lib/importacao-modelo.ts:279` | Importação | — |
| `LinhaLoteDia` | tipo | `src/lib/painel.ts:39` | Início, painel, ajuda e configurações | 1 arquivo |
| `LinhaParametros` | tipo | `src/lib/planejamento-dados.ts:8` | Planejamento, previsões, custo do kg e relatórios | — |
| `LinhaPlano` | tipo | `src/app/(app)/planejamento/lotes-planejados.tsx:8` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `LinhaRateio` | tipo | `src/lib/rateio.ts:5` | Financeiro | — |
| `LinhaResultado` | tipo | `src/lib/relatorios.ts:5` | Planejamento, previsões, custo do kg e relatórios | 6 arquivos |
| `LINHAS_RACAO` | constante | `src/lib/apontamento-racao.ts:4` | Produção | 2 arquivos |
| `LinhaTitulo` | tipo | `src/app/(app)/_titulos/lista.tsx:19` | Financeiro | 1 arquivo |
| `Link` | tipo | `src/lib/menu.ts:7` | Comum | 1 arquivo |
| `LinkBotao` | componente | `src/components/ui.tsx:41` | Comum | 24 arquivos |
| `LinkEmail` | componente | `src/app/auth/mfa/email/link.tsx:9` | Login, segurança, usuários e permissões | 1 arquivo |
| `LinkRapido` | tipo | `src/lib/relatorios-catalogo.ts:85` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `linksRapidos` | função | `src/lib/relatorios-catalogo.ts:89` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `linkWhatsApp` | função | `src/lib/regua-cobranca.ts:33` | Cobrança | 2 arquivos |
| `linkWhatsapp` | função | `src/lib/vendas.ts:156` | Vendas, PDV, estoque, produtos e ração | 4 arquivos |
| `lista_preco_inicial` | trigger | `supabase/migrations/20261027133000_tabelas_de_preco.sql:73` | Início, painel, ajuda e configurações | — |
| `ListaCadastro` | componente | `src/components/cadastro.tsx:53` | Comum | 14 arquivos |
| `ListaCadastros` | componente | `src/app/(app)/cadastros/lista.tsx:7` | Comum | 1 arquivo |
| `ListaCargos` | componente | `src/app/(app)/configuracoes/usuarios/lista.tsx:332` | Login, segurança, usuários e permissões | 1 arquivo |
| `ListaCategorias` | componente | `src/app/(app)/categorias/lista.tsx:95` | Financeiro | 1 arquivo |
| `ListaCentros` | componente | `src/app/(app)/centros-de-custo/lista.tsx:65` | Financeiro | 1 arquivo |
| `ListaContas` | componente | `src/app/(app)/contas/lista.tsx:107` | Financeiro | 1 arquivo |
| `ListaContatos` | componente | `src/app/(app)/contatos/lista.tsx:151` | Financeiro | 1 arquivo |
| `ListaEstoque` | componente | `src/components/movimento-estoque.tsx:119` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `ListaMedicamentos` | componente | `src/app/(app)/medicamentos/lista.tsx:96` | Produção | 1 arquivo |
| `ListaPreco` | tipo | `src/lib/vendas.ts:94` | Vendas, PDV, estoque, produtos e ração | 5 arquivos |
| `ListaProdutos` | componente | `src/app/(app)/produtos/lista.tsx:212` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `listarEmpresas` | função | `src/lib/empresa.ts:17` | Início, painel, ajuda e configurações | 1 arquivo |
| `listas_preco` | tabela | `supabase/migrations/20261027133000_tabelas_de_preco.sql:14` | Vendas, PDV, estoque, produtos e ração | 5 arquivos |
| `ListaTabelas` | componente | `src/app/(app)/tabelas-de-preco/lista.tsx:104` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `ListaTitulos` | componente | `src/app/(app)/_titulos/lista.tsx:126` | Financeiro | 1 arquivo |
| `ListaUsuarios` | componente | `src/app/(app)/configuracoes/usuarios/lista.tsx:201` | Login, segurança, usuários e permissões | 1 arquivo |
| `login_bloqueado_ate` | função SQL | `supabase/migrations/20261030230000_bloqueio_login.sql:6` | Login, segurança, usuários e permissões | 1 arquivo |
| `login_local_da_empresa` | função SQL | `supabase/migrations/20261029223000_login_local.sql:141` | Login, segurança, usuários e permissões | 1 arquivo |
| `login_local_uma_empresa` | trigger | `supabase/migrations/20261029223000_login_local.sql:90` | Login, segurança, usuários e permissões | — |
| `loginDoEmail` | função | `src/lib/login-local.ts:25` | Login, segurança, usuários e permissões | 1 arquivo |
| `LoginLocal` | tipo | `src/app/(app)/configuracoes/usuarios/lista.tsx:20` | Login, segurança, usuários e permissões | 1 arquivo |
| `logins_locais` | tabela | `supabase/migrations/20261029223000_login_local.sql:21` | Login, segurança, usuários e permissões | 3 arquivos |
| `LOJA` | constante | `src/lib/db/indexeddb.ts:17` | Comum | 1 arquivo |
| `Lote` | tipo | `src/app/(app)/lotes/lista.tsx:13` | Produção | 1 arquivo |
| `lote_alocacoes` | tabela | `supabase/migrations/20261026000001_schema.sql:656` | Produção | 2 arquivos |
| `lote_cc` | trigger | `supabase/migrations/20261026000003_producao_e_titulos.sql:34` | Produção | — |
| `lote_cc_nome` | trigger | `supabase/migrations/20261027010000_cadastros.sql:157` | Produção | — |
| `lote_cc_sai` | trigger | `supabase/migrations/20261027010000_cadastros.sql:171` | Produção | — |
| `lote_sem_historico` | trigger | `supabase/migrations/20261027010000_cadastros.sql:185` | Produção | — |
| `lote_transferencias` | tabela | `supabase/migrations/20261027235000_transferencia_lotes.sql:9` | Produção | 1 arquivo |
| `LoteEntrada` | tipo | `src/lib/planejamento.ts:64` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `LoteImportado` | tipo | `src/lib/importacao.ts:30` | Importação | — |
| `LotePlanejadoLinha` | tipo | `src/lib/planejamento-dados.ts:17` | Planejamento, previsões, custo do kg e relatórios | — |
| `LotePrevisto` | tipo | `src/lib/previsao-dados.ts:21` | Planejamento, previsões, custo do kg e relatórios | — |
| `LoteProjetado` | tipo | `src/lib/planejamento.ts:101` | Planejamento, previsões, custo do kg e relatórios | — |
| `lotes` | tabela | `supabase/migrations/20261026000001_schema.sql:630` | Produção | 11 arquivos |
| `lotes_planejados` | tabela | `supabase/migrations/20261027193500_planejamento.sql:88` | Produção | 2 arquivos |
| `LotesPlanejados` | componente | `src/app/(app)/planejamento/lotes-planejados.tsx:77` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `LoteTanque` | tipo | `src/lib/campo/tipos.ts:18` | Produção | 2 arquivos |
| `manchete` | função | `src/lib/analise-periodo.ts:355` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `manifest` | função | `src/app/manifest.ts:3` | Início, painel, ajuda e configurações | — |
| `manifestarNfe` | ação | `src/app/(app)/notas/recebidas/actions.ts:50` | Fiscal | 1 arquivo |
| `manterSessaoAoDesativarApp` | ação | `src/app/(app)/seguranca/actions.ts:11` | Login, segurança, usuários e permissões | 1 arquivo |
| `mapearColunas` | função | `src/lib/importacao-modelo.ts:313` | Importação | — |
| `MarcaBalbina` | componente | `src/components/marca.tsx:4` | Comum | 5 arquivos |
| `marcaDoItem` | função | `src/lib/campo/fila.ts:30` | Produção | 2 arquivos |
| `Marcar` | componente | `src/components/cadastro.tsx:509` | Comum | 10 arquivos |
| `marcar_categoria_sistema` | trigger | `supabase/migrations/20261027010000_cadastros.sql:72` | Financeiro | — |
| `marcar_cobranca_whatsapp` | função SQL | `supabase/migrations/20261101200000_whatsapp.sql:165` | Cobrança | 1 arquivo |
| `marcar_componente_custo` | trigger | `supabase/migrations/20261026000007_custo_do_ovo.sql:36` | Financeiro | — |
| `marcar_perda` | função SQL | `supabase/migrations/20261028190000_acoes_titulos.sql:158` | Comum | 1 arquivo |
| `marcarComRede` | função | `src/lib/sync/detector.ts:84` | Comum | — |
| `marcarSemRede` | função | `src/lib/sync/detector.ts:79` | Comum | 2 arquivos |
| `marcarSessaoVerificada` | função | `src/lib/mfa.ts:26` | Login, segurança, usuários e permissões | 2 arquivos |
| `marcarTutoriais` | ação | `src/lib/tutoriais-acoes.ts:8` | Início, painel, ajuda e configurações | 1 arquivo |
| `margem_cliente_mes` | view | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:324` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `margemProjetada` | função | `src/lib/previsao.ts:244` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `Matriz` | tipo | `src/lib/relatorios.ts:6` | Planejamento, previsões, custo do kg e relatórios | — |
| `MatrizPermissoes` | componente | `src/components/permissoes-visual.tsx:150` | Login, segurança, usuários e permissões | — |
| `MAX_DIAS_LISTA` | constante | `src/lib/apontamento-excluir.ts:5` | Produção | — |
| `MAX_ENVIADOS` | constante | `src/lib/campo/fila.ts:38` | Produção | 1 arquivo |
| `MAX_GRUPOS` | constante | `src/lib/biometria-grupos.ts:7` | Comum | — |
| `MAX_LOTE` | constante | `src/lib/selecao-lote.ts:3` | Produção | — |
| `MAX_MENSAGENS` | constante | `src/lib/campo/contexto-chat.ts:10` | Produção | 2 arquivos |
| `MAX_MESES` | constante | `src/lib/analise-periodo.ts:21` | Planejamento, previsões, custo do kg e relatórios | — |
| `MAX_TENTATIVAS` | constante | `src/lib/sync/queue.ts:7` | Comum | 1 arquivo |
| `MAX_TEXTO` | constante | `src/lib/campo/contexto-chat.ts:11` | Produção | 1 arquivo |
| `maxDuration` | constante | `src/app/(app)/conciliacao/page.tsx:50` | Financeiro | — |
| `maxDuration` | constante | `src/app/(app)/configuracoes/importar/page.tsx:14` | Importação | — |
| `maxDuration` | constante | `src/app/(app)/relatorios/contador/baixar/route.ts:6` | Planejamento, previsões, custo do kg e relatórios | — |
| `maxDuration` | constante | `src/app/api/chat/manejo/route.ts:9` | Comum | — |
| `maxDuration` | constante | `src/app/api/cron/automacoes/route.ts:16` | API pública, webhooks e rotinas agendadas | — |
| `maxDuration` | constante | `src/app/api/cron/open-finance/route.ts:5` | API pública, webhooks e rotinas agendadas | — |
| `maxDuration` | constante | `src/app/api/cron/webhooks/route.ts:5` | API pública, webhooks e rotinas agendadas | — |
| `maxDuration` | constante | `src/app/api/entrada/email/route.ts:8` | Comum | — |
| `maxDuration` | constante | `src/app/api/entrada/whatsapp/route.ts:11` | Comum | — |
| `maxDuration` | constante | `src/app/api/webhooks/pluggy/route.ts:7` | API pública, webhooks e rotinas agendadas | — |
| `mde_empresas_ligadas` | função SQL | `supabase/migrations/20261101160000_nfes_recebidas.sql:45` | Início, painel, ajuda e configurações | 1 arquivo |
| `Medicacao` | tipo | `src/lib/apontamento-campo.ts:25` | Produção | — |
| `medicacoes` | view | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:339` | Produção | 1 arquivo |
| `Medicamento` | tipo | `src/app/(app)/medicamentos/lista.tsx:10` | Produção | 1 arquivo |
| `MedicamentoOpcao` | tipo | `src/lib/campo/tipos.ts:58` | Produção | 4 arquivos |
| `medicamentos` | tabela | `supabase/migrations/20261029073000_medicamentos.sql:22` | Produção | 6 arquivos |
| `Meio` | tipo | `src/lib/asaas-mapa.ts:4` | Cobrança | 3 arquivos |
| `MEIOS_COBRANCA` | constante | `src/lib/asaas-mapa.ts:6` | Cobrança | 3 arquivos |
| `Membro` | tipo | `src/app/(app)/configuracoes/usuarios/lista.tsx:18` | Login, segurança, usuários e permissões | 1 arquivo |
| `mensagemAtivacao` | função | `src/lib/selecao-lote.ts:34` | Produção | 1 arquivo |
| `mensagemBanco` | função | `src/lib/acao.ts:13` | Comum | 45 arquivos |
| `mensagemBloqueio` | função | `src/lib/login-bloqueio.ts:4` | Login, segurança, usuários e permissões | 2 arquivos |
| `MensagemChat` | tipo | `src/lib/campo/contexto-chat.ts:8` | Produção | 2 arquivos |
| `mensagemErroAsaas` | função | `src/lib/asaas-mapa.ts:44` | Cobrança | 2 arquivos |
| `mensagemErroVoz` | função | `src/lib/reconhecimento-voz.ts:16` | Comum | 2 arquivos |
| `MensagemRecebida` | tipo | `src/lib/whatsapp-texto.ts:38` | Comum | 1 arquivo |
| `MESES_CURTOS` | constante | `src/lib/formato.ts:43` | Comum | 2 arquivos |
| `MESES_LONGOS` | constante | `src/lib/formato.ts:44` | Comum | 3 arquivos |
| `mesesDoAno` | função | `src/lib/relatorios.ts:120` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `mesesEntre` | função | `src/lib/analise-periodo.ts:25` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `mesesEntre` | função | `src/lib/importacao-nibo.ts:487` | Importação | — |
| `mesmaConta` | função | `src/lib/open-finance-mapa.ts:65` | Financeiro | 2 arquivos |
| `Meta` | tipo | `src/lib/analise-periodo.ts:105` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `metadata` | constante | `src/app/aceitar-termos/page.tsx:8` | Login, segurança, usuários e permissões | — |
| `metadata` | constante | `src/app/app-captcha/page.tsx:4` | Login, segurança, usuários e permissões | — |
| `metadata` | constante | `src/app/assinatura/page.tsx:19` | Cobrança | — |
| `metadata` | constante | `src/app/campo/page.tsx:18` | Produção | — |
| `metadata` | constante | `src/app/cookies/page.tsx:7` | Login, segurança, usuários e permissões | — |
| `metadata` | constante | `src/app/layout.tsx:24` | Início, painel, ajuda e configurações | — |
| `metadata` | constante | `src/app/pedido/[token]/page.tsx:8` | Vendas, PDV, estoque, produtos e ração | — |
| `metadata` | constante | `src/app/privacidade/page.tsx:7` | Login, segurança, usuários e permissões | — |
| `metadata` | constante | `src/app/termos/page.tsx:7` | Login, segurança, usuários e permissões | — |
| `metadata` | constante | `src/app/vendedor/page.tsx:12` | Vendas, PDV, estoque, produtos e ração | — |
| `meu_login_local` | função SQL | `supabase/migrations/20261102180000_desligar_manutencao.sql:130` | Login, segurança, usuários e permissões | 4 arquivos |
| `mfa_pendente` | função SQL | `supabase/migrations/20261027154700_mfa.sql:39` | Login, segurança, usuários e permissões | 4 arquivos |
| `minha_assinatura` | função SQL | `supabase/migrations/20261027224100_planos_balbina.sql:107` | Cobrança | 2 arquivos |
| `minhas_permissoes` | função SQL | `supabase/migrations/20261029213000_cargos.sql:112` | Login, segurança, usuários e permissões | 2 arquivos |
| `Mini` | componente | `src/components/graficos.tsx:245` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `MINIMO_BASE` | constante | `src/lib/sugestao-apontamento.ts:18` | Produção | — |
| `MODELO` | constante | `src/lib/ia.ts:11` | Comum | 1 arquivo |
| `Modelo` | tipo | `src/lib/importacao-modelo.ts:27` | Importação | — |
| `modelo` | função | `src/lib/importacao-modelo.ts:267` | Importação | — |
| `modeloCsv` | função | `src/lib/importacao-modelo.ts:817` | Importação | 2 arquivos |
| `MODELOS` | constante | `src/lib/importacao-modelo.ts:40` | Importação | 4 arquivos |
| `modeloXlsx` | função | `src/lib/importacao-modelo-xlsx.ts:10` | Importação | 2 arquivos |
| `ModoOffline` | componente | `src/components/offline.tsx:65` | Comum | 1 arquivo |
| `Modulo` | tipo | `src/lib/modulos.ts:2` | Comum | — |
| `modulo10` | função | `src/lib/boleto.ts:13` | Comum | 1 arquivo |
| `modulo11Arrecadacao` | função | `src/lib/boleto.ts:41` | Comum | 1 arquivo |
| `modulo11Banco` | função | `src/lib/boleto.ts:35` | Comum | 1 arquivo |
| `ModuloPermissao` | tipo | `src/lib/permissoes-regras.ts:11` | Login, segurança, usuários e permissões | 1 arquivo |
| `MODULOS_CELULAR` | constante | `src/lib/menu.ts:12` | Comum | — |
| `moedaCurta` | função | `src/components/graficos.tsx:13` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `montarAging` | função | `src/lib/relatorios.ts:82` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `montarAssinatura` | função | `src/lib/assinatura-mapa.ts:25` | Cobrança | 2 arquivos |
| `montarCliente` | função | `src/lib/asaas-mapa.ts:56` | Cobrança | 2 arquivos |
| `montarCobranca` | função | `src/lib/asaas-mapa.ts:68` | Cobrança | 2 arquivos |
| `montarDre` | função | `src/lib/relatorios.ts:128` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `montarEmpresaFocus` | função | `src/lib/focus-mapa.ts:273` | Fiscal | 2 arquivos |
| `montarLcdpr` | função | `src/lib/lcdpr-dados.ts:29` | Comum | 1 arquivo |
| `montarMatriz` | função | `src/lib/relatorios.ts:20` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `montarMenu` | função | `src/lib/menu.ts:30` | Comum | 3 arquivos |
| `montarNfce` | função | `src/lib/focus-mapa.ts:213` | Fiscal | 2 arquivos |
| `montarNfe` | função | `src/lib/focus-mapa.ts:77` | Fiscal | 2 arquivos |
| `montarPacote` | função | `src/lib/pacote-contador.ts:29` | Financeiro | 1 arquivo |
| `montarRoteiro` | função | `src/lib/apresentacao.ts:55` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `montarSubconta` | função | `src/lib/asaas-mapa.ts:179` | Cobrança | 2 arquivos |
| `montarWebhook` | função | `src/lib/asaas-mapa.ts:161` | Cobrança | 2 arquivos |
| `mortalidade_causas` | view | `supabase/migrations/20261031010000_causas_mortalidade.sql:61` | Produção | 1 arquivo |
| `MORTALIDADE_SEMANA_MAX` | constante | `src/lib/previsao.ts:38` | Planejamento, previsões, custo do kg e relatórios | — |
| `MortalidadeLida` | tipo | `src/lib/ia.ts:85` | Comum | 1 arquivo |
| `mortalidadeSemanal` | função | `src/lib/previsao.ts:41` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `mostrarNoPainel` | função | `src/lib/assistente.ts:54` | Início, painel, ajuda e configurações | 2 arquivos |
| `motivoFalha` | função | `src/lib/pagamentos-asaas.ts:26` | Cobrança | 1 arquivo |
| `mover_regra` | função SQL | `supabase/migrations/20261026000008_regras_aging_orcamento.sql:129` | Comum | — |
| `moverPara` | função | `src/lib/ordem.ts:51` | Comum | 1 arquivo |
| `moverRegra` | ação | `src/app/(app)/conciliacao/actions.ts:330` | Financeiro | 1 arquivo |
| `movimentar_estoque` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:686` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `movimentarEstoque` | ação | `src/app/(app)/estoque/actions.ts:10` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `MovimentoConciliacao` | tipo | `src/lib/importacao-nibo.ts:338` | Importação | — |
| `movimentos_apagados` | tabela | `supabase/migrations/20261029080000_desconciliar_e_apagar_extrato.sql:24` | Financeiro | — |
| `movimentos_bancarios` | tabela | `supabase/migrations/20261026000001_schema.sql:392` | Financeiro | 5 arquivos |
| `movimentos_caixa` | view | `supabase/migrations/20261026000004_financeiro_base.sql:7` | Financeiro | 3 arquivos |
| `movimentos_estoque` | tabela | `supabase/migrations/20261026000001_schema.sql:774` | Vendas, PDV, estoque, produtos e ração | 5 arquivos |
| `movimentosNibo` | função | `src/lib/importacao-nibo.ts:123` | Importação | — |
| `mudarLinkPedido` | ação | `src/app/(app)/vendas/links/actions.ts:10` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `mudarSituacaoDocumento` | ação | `src/app/(app)/contas-a-pagar/documentos/actions.ts:54` | Financeiro | 1 arquivo |
| `mudarSituacaoNfe` | ação | `src/app/(app)/notas/recebidas/actions.ts:37` | Fiscal | 1 arquivo |
| `NaoEncontrado` | componente | `src/app/not-found.tsx:4` | Início, painel, ajuda e configurações | — |
| `NavegacaoMovel` | componente | `src/components/menu-lateral.tsx:87` | Comum | 1 arquivo |
| `nfe_itens` | view | `supabase/migrations/20261101170000_automacoes_vendas.sql:45` | Fiscal | 1 arquivo |
| `NfeDoXml` | tipo | `src/lib/nfe-xml.ts:3` | Fiscal | — |
| `NfeRecebidaFocus` | tipo | `src/lib/focus.ts:70` | Fiscal | — |
| `nfes_recebidas` | tabela | `supabase/migrations/20261101160000_nfes_recebidas.sql:12` | Fiscal | 4 arquivos |
| `NiboAgendamento` | tipo | `src/lib/importacao-nibo.ts:26` | Importação | — |
| `NiboCategoria` | tipo | `src/lib/importacao-nibo.ts:12` | Importação | — |
| `NiboCentro` | tipo | `src/lib/importacao-nibo.ts:13` | Importação | — |
| `NiboConta` | tipo | `src/lib/importacao-nibo.ts:14` | Importação | — |
| `NiboExtrato` | tipo | `src/lib/importacao-nibo.ts:41` | Importação | 1 arquivo |
| `NiboLancamento` | tipo | `src/lib/importacao-nibo.ts:32` | Importação | — |
| `niboLiberado` | função | `src/lib/integracoes.ts:5` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `NiboPendente` | tipo | `src/lib/importacao-nibo.ts:47` | Importação | — |
| `NiboPessoa` | tipo | `src/lib/importacao-nibo.ts:18` | Importação | — |
| `NiboSaldo` | tipo | `src/lib/importacao-nibo.ts:39` | Importação | — |
| `niveis_plano` | tabela | `supabase/migrations/20261027224100_planos_balbina.sql:10` | Cobrança | 2 arquivos |
| `NivelAgua` | tipo | `src/lib/agua.ts:59` | Comum | — |
| `nivelDoModulo` | função | `src/components/permissoes-visual.tsx:123` | Login, segurança, usuários e permissões | — |
| `NivelPlano` | tipo | `src/lib/assinatura-mapa.ts:97` | Cobrança | 2 arquivos |
| `nivelQueLibera` | função | `src/lib/assinatura-mapa.ts:100` | Cobrança | 2 arquivos |
| `NOME_BANCO` | constante | `src/lib/db/indexeddb.ts:16` | Comum | 1 arquivo |
| `NOME_ETAPA` | constante | `src/lib/planejamento.ts:198` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `NOME_FINALIDADE` | constante | `src/lib/planejamento.ts:199` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `nomeCampo` | função | `src/lib/historico.ts:90` | Login, segurança, usuários e permissões | 2 arquivos |
| `nomeChave` | função | `src/lib/importacao-modelo.ts:275` | Importação | — |
| `nomeDaContraparte` | função | `src/lib/contraparte.ts:14` | Comum | 2 arquivos |
| `nomeDoCargo` | função | `src/components/permissoes-cargos.tsx:27` | Login, segurança, usuários e permissões | 1 arquivo |
| `nomeEmpresa` | função | `src/lib/empresa.ts:12` | Início, painel, ajuda e configurações | 13 arquivos |
| `nomePeriodo` | função | `src/lib/analise-periodo.ts:32` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `nomeTabela` | função | `src/lib/historico.ts:84` | Login, segurança, usuários e permissões | 2 arquivos |
| `normalizar` | função | `src/lib/fala-apontamento.ts:29` | Produção | 1 arquivo |
| `normalizarLogin` | função | `src/lib/login-local.ts:7` | Login, segurança, usuários e permissões | 1 arquivo |
| `normalizarPergunta` | função | `src/lib/campo/conhecimento-tambaqui.ts:149` | Produção | 1 arquivo |
| `notaRodape` | função | `src/lib/planilha.ts:63` | Comum | — |
| `notas_fiscais` | tabela | `supabase/migrations/20261026000001_schema.sql:512` | Fiscal | 6 arquivos |
| `notasSugeridas` | função | `src/lib/vendas.ts:144` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `novaSenhaLoginLocal` | ação | `src/app/(app)/configuracoes/usuarios/actions.ts:114` | Login, segurança, usuários e permissões | 1 arquivo |
| `NovaVenda` | componente | `src/components/vendas/nova-venda.tsx:39` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `novoEnderecoEntrada` | ação | `src/app/(app)/configuracoes/automacoes/actions.ts:111` | Início, painel, ajuda e configurações | 1 arquivo |
| `novoId` | função | `src/components/campo/contexto.tsx:56` | Produção | 5 arquivos |
| `novoToken` | função | `src/lib/cripto.ts:37` | Login, segurança, usuários e permissões | 2 arquivos |
| `Numero` | componente | `src/components/campo/pecas.tsx:95` | Produção | 5 arquivos |
| `numeroDoBalbina` | função | `src/lib/whatsapp.ts:22` | Comum | 1 arquivo |
| `numeroEntrada` | função | `src/lib/racao-estoque.ts:6` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `numeroKg` | função | `src/lib/pescado.ts:12` | Comum | 6 arquivos |
| `numerosPorExtenso` | função | `src/lib/fala-apontamento.ts:34` | Produção | 1 arquivo |
| `numeroWhatsApp` | função | `src/lib/whatsapp-texto.ts:7` | Comum | 4 arquivos |
| `Observacoes` | componente | `src/components/campo/pecas.tsx:166` | Produção | 4 arquivos |
| `Ocupacao` | tipo | `src/lib/planejamento.ts:80` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `OLLAMA_MODELO_PADRAO` | constante | `src/lib/ai/offline-chat.ts:21` | Comum | 1 arquivo |
| `Opcao` | tipo | `src/components/movimento-estoque.tsx:22` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `Opcao` | componente | `src/components/vendas/controles.tsx:46` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `Opcao` | tipo | `src/lib/campo/tipos.ts:56` | Produção | 3 arquivos |
| `OPCOES_TABELA` | constante | `src/lib/historico.ts:80` | Login, segurança, usuários e permissões | 1 arquivo |
| `OpcoesCargo` | componente | `src/components/permissoes-cargos.tsx:11` | Login, segurança, usuários e permissões | 1 arquivo |
| `OpcoesViveiro` | componente | `src/components/opcoes-viveiro.tsx:8` | Comum | 2 arquivos |
| `openFinanceConfigurado` | função | `src/lib/open-finance.ts:11` | Financeiro | 4 arquivos |
| `OPERADORES_REGRA` | constante | `src/lib/regras.ts:15` | Financeiro | 2 arquivos |
| `orcado_realizado` | view | `supabase/migrations/20261026000008_regras_aging_orcamento.sql:248` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `orcamento_do_realizado` | função SQL | `supabase/migrations/20261026000008_regras_aging_orcamento.sql:231` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `orcamentoDoRealizado` | ação | `src/app/(app)/relatorios/orcamento/actions.ts:33` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `orcamentos` | tabela | `supabase/migrations/20261026000001_schema.sql:549` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `ordenado` | função | `src/lib/ordem.ts:59` | Comum | 9 arquivos |
| `ordenarArvore` | função | `src/lib/ordem.ts:21` | Comum | 1 arquivo |
| `ordens_producao_racao` | tabela | `supabase/migrations/20261026000001_schema.sql:819` | Vendas, PDV, estoque, produtos e ração | — |
| `organizarRotina` | função | `src/lib/pendencias.ts:26` | Comum | 2 arquivos |
| `Origem` | tipo | `src/lib/planejamento.ts:14` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `Origem` | tipo | `src/lib/previsao-racao.ts:16` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `origemDoPedido` | função | `src/lib/aceite-termos.ts:10` | Login, segurança, usuários e permissões | — |
| `origensDoAviso` | função | `src/lib/focus-mapa.ts:148` | Fiscal | 2 arquivos |
| `ovos_para_estoque` | trigger | `supabase/migrations/20261026000006_estoque_vendas_sanidade.sql:92` | Produção | — |
| `Pacote` | tipo | `src/lib/importacao.ts:49` | Importação | 4 arquivos |
| `pacoteNibo` | função | `src/lib/importacao-nibo.ts:187` | Importação | 2 arquivos |
| `pacotePlanilhaContatos` | função | `src/lib/importacao-planilha.ts:54` | Importação | 2 arquivos |
| `Pagamento` | tipo | `src/lib/asaas-mapa.ts:116` | Cobrança | 1 arquivo |
| `PagamentoAsaas` | tipo | `src/lib/assinatura-mapa.ts:60` | Cobrança | 1 arquivo |
| `PagamentoBalcao` | tipo | `src/lib/pdv.ts:7` | Vendas, PDV, estoque, produtos e ração | — |
| `PagamentoNota` | tipo | `src/lib/focus-mapa.ts:210` | Fiscal | 1 arquivo |
| `PagamentoPdv` | tipo | `src/lib/vendas.ts:131` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `pagamentos_do_pedido` | função SQL | `supabase/migrations/20261029140000_nfe_completa.sql:83` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `pagamentos_para_conferir` | função SQL | `supabase/migrations/20261101230000_pagamentos_asaas.sql:167` | Fiscal | 1 arquivo |
| `pagamentos_saida` | tabela | `supabase/migrations/20261101230000_pagamentos_asaas.sql:33` | Comum | 1 arquivo |
| `pagamentos_so_master` | trigger | `supabase/migrations/20261101230000_pagamentos_asaas.sql:30` | Início, painel, ajuda e configurações | — |
| `pagar_fatura` | função SQL | `supabase/migrations/20261026000009_racao_cartao_comercial.sql:272` | Comum | 1 arquivo |
| `pagarBoleto` | função | `src/lib/pagamentos-asaas.ts:9` | Cobrança | 1 arquivo |
| `pagarFatura` | ação | `src/app/(app)/cartoes/actions.ts:58` | Financeiro | 1 arquivo |
| `pagina` | função | `src/lib/api/servidor.ts:94` | API pública, webhooks e rotinas agendadas | 6 arquivos |
| `PAGINA_SUPABASE` | constante | `src/lib/supabase/todas.ts:5` | Comum | 1 arquivo |
| `PaginaAceitarTermos` | componente | `src/app/aceitar-termos/page.tsx:11` | Login, segurança, usuários e permissões | — |
| `PaginaAging` | componente | `src/app/(app)/relatorios/aging/page.tsx:11` | Planejamento, previsões, custo do kg e relatórios | — |
| `PaginaApi` | componente | `src/app/(app)/configuracoes/api/page.tsx:25` | API pública, webhooks e rotinas agendadas | — |
| `PaginaApontamentos` | componente | `src/app/(app)/apontamentos/page.tsx:19` | Produção | — |
| `PaginaAssinatura` | componente | `src/app/assinatura/page.tsx:22` | Cobrança | — |
| `PaginaAutomacoes` | componente | `src/app/(app)/configuracoes/automacoes/page.tsx:15` | Início, painel, ajuda e configurações | — |
| `PaginaBancos` | componente | `src/app/(app)/conciliacao/bancos/page.tsx:25` | Financeiro | — |
| `PaginaCadastros` | componente | `src/app/(app)/cadastros/page.tsx:8` | Início, painel, ajuda e configurações | — |
| `PaginaCaixaPdv` | componente | `src/app/(app)/vendas/pdv/caixa/page.tsx:10` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaCampo` | componente | `src/app/campo/page.tsx:31` | Produção | — |
| `Paginacao` | tipo | `src/lib/api/regras.ts:78` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `paginacao` | função | `src/lib/api/servidor.ts:89` | API pública, webhooks e rotinas agendadas | 6 arquivos |
| `PaginaCaptchaApp` | componente | `src/app/app-captcha/page.tsx:8` | Login, segurança, usuários e permissões | — |
| `PaginaCartoes` | componente | `src/app/(app)/cartoes/page.tsx:15` | Financeiro | — |
| `PaginaCategorias` | componente | `src/app/(app)/categorias/page.tsx:7` | Financeiro | — |
| `PaginaCentralRelatorios` | componente | `src/app/(app)/relatorios/page.tsx:11` | Planejamento, previsões, custo do kg e relatórios | — |
| `PaginaCentrosCusto` | componente | `src/app/(app)/centros-de-custo/page.tsx:7` | Financeiro | — |
| `PaginaChecklist` | componente | `src/app/(app)/apontamentos/checklist/page.tsx:13` | Produção | — |
| `PaginaCobrancas` | componente | `src/app/(app)/cobrancas/page.tsx:16` | Cobrança | — |
| `PaginaConciliacao` | componente | `src/app/(app)/conciliacao/page.tsx:52` | Financeiro | — |
| `PaginaConfiguracoes` | componente | `src/app/(app)/configuracoes/page.tsx:22` | Início, painel, ajuda e configurações | — |
| `PaginaContas` | componente | `src/app/(app)/contas/page.tsx:11` | Financeiro | — |
| `PaginaContasAPagar` | componente | `src/app/(app)/contas-a-pagar/page.tsx:4` | Financeiro | — |
| `PaginaContasAReceber` | componente | `src/app/(app)/contas-a-receber/page.tsx:4` | Financeiro | — |
| `PaginaContatos` | componente | `src/app/(app)/contatos/page.tsx:10` | Financeiro | — |
| `PaginaConvite` | componente | `src/app/auth/convite/page.tsx:5` | Login, segurança, usuários e permissões | — |
| `PaginaCookies` | componente | `src/app/cookies/page.tsx:10` | Login, segurança, usuários e permissões | — |
| `PaginaCustoKg` | componente | `src/app/(app)/custo-do-kg/page.tsx:29` | Planejamento, previsões, custo do kg e relatórios | — |
| `PaginaDespescas` | componente | `src/app/(app)/despescas/page.tsx:15` | Início, painel, ajuda e configurações | — |
| `PaginaDocumentos` | componente | `src/app/(app)/contas-a-pagar/documentos/page.tsx:23` | Financeiro | — |
| `PaginaDre` | componente | `src/app/(app)/relatorios/dre/page.tsx:30` | Planejamento, previsões, custo do kg e relatórios | — |
| `PaginaEspecies` | componente | `src/app/(app)/lotes/especies/page.tsx:10` | Produção | — |
| `PaginaEstoque` | componente | `src/app/(app)/estoque/page.tsx:19` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaFluxo` | componente | `src/app/(app)/fluxo-de-caixa/page.tsx:15` | Financeiro | — |
| `PaginaHistorico` | componente | `src/app/(app)/historico/page.tsx:55` | Login, segurança, usuários e permissões | — |
| `PaginaImportar` | componente | `src/app/(app)/configuracoes/importar/page.tsx:16` | Importação | — |
| `PaginaIndicadores` | componente | `src/app/(app)/relatorios/indicadores/page.tsx:29` | Produção | — |
| `PaginaInsumos` | componente | `src/app/(app)/insumos/page.tsx:3` | Início, painel, ajuda e configurações | — |
| `PaginaLinkEmail` | componente | `src/app/auth/mfa/email/page.tsx:5` | Login, segurança, usuários e permissões | — |
| `PaginaLinksPedido` | componente | `src/app/(app)/vendas/links/page.tsx:10` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaLogin` | componente | `src/app/login/page.tsx:11` | Login, segurança, usuários e permissões | — |
| `PaginaLote` | componente | `src/app/(app)/lotes/[id]/page.tsx:33` | Produção | — |
| `PaginaLotes` | componente | `src/app/(app)/lotes/page.tsx:8` | Produção | — |
| `PaginaMedicamentos` | componente | `src/app/(app)/medicamentos/page.tsx:7` | Produção | — |
| `PaginaMfa` | componente | `src/app/auth/mfa/page.tsx:15` | Login, segurança, usuários e permissões | — |
| `PaginaNotas` | componente | `src/app/(app)/notas/page.tsx:17` | Fiscal | — |
| `PaginaNotasRecebidas` | componente | `src/app/(app)/notas/recebidas/page.tsx:27` | Fiscal | — |
| `PaginaNovaSenha` | componente | `src/app/auth/nova-senha/page.tsx:5` | Login, segurança, usuários e permissões | — |
| `PaginaNovaVenda` | componente | `src/app/(app)/vendas/nova/page.tsx:9` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaOnboarding` | componente | `src/app/onboarding/page.tsx:6` | Início, painel, ajuda e configurações | — |
| `PaginaOrcamento` | componente | `src/app/(app)/relatorios/orcamento/page.tsx:17` | Planejamento, previsões, custo do kg e relatórios | — |
| `PaginaPacoteContador` | componente | `src/app/(app)/relatorios/contador/page.tsx:15` | Planejamento, previsões, custo do kg e relatórios | — |
| `PaginaPagamentos` | componente | `src/app/(app)/contas-a-pagar/pagamentos/page.tsx:21` | Financeiro | — |
| `PaginaParametros` | componente | `src/app/(app)/planejamento/parametros/page.tsx:36` | Planejamento, previsões, custo do kg e relatórios | — |
| `PaginaPdv` | componente | `src/app/(app)/vendas/pdv/page.tsx:11` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaPedido` | componente | `src/app/(app)/vendas/[id]/page.tsx:30` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaPedidoCliente` | componente | `src/app/pedido/[token]/page.tsx:18` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaPedidosFixos` | componente | `src/app/(app)/vendas/fixos/page.tsx:18` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaPiscicultura` | componente | `src/app/(app)/piscicultura/page.tsx:8` | Produção | — |
| `PaginaPlanejamento` | componente | `src/app/(app)/planejamento/page.tsx:31` | Planejamento, previsões, custo do kg e relatórios | — |
| `PaginaPontosVenda` | componente | `src/app/(app)/pontos-de-venda/page.tsx:16` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaPontoVenda` | componente | `src/app/(app)/pontos-de-venda/[id]/page.tsx:14` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaPrecos` | componente | `src/app/(app)/vendas/precos/page.tsx:11` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaPrevisoes` | componente | `src/app/(app)/previsoes/page.tsx:21` | Planejamento, previsões, custo do kg e relatórios | — |
| `PaginaPrimeiroAcesso` | componente | `src/app/auth/primeiro-acesso/page.tsx:9` | Login, segurança, usuários e permissões | — |
| `PaginaPrivacidade` | componente | `src/app/privacidade/page.tsx:10` | Login, segurança, usuários e permissões | — |
| `PaginaProdutos` | componente | `src/app/(app)/produtos/page.tsx:3` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaRacao` | componente | `src/app/(app)/racao/page.tsx:26` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaRegras` | componente | `src/app/(app)/conciliacao/regras/page.tsx:19` | Financeiro | — |
| `PaginaReguaCobranca` | componente | `src/app/(app)/contas-a-receber/regua/page.tsx:13` | Financeiro | — |
| `PaginaRelatorioContas` | componente | `src/app/(app)/relatorios/contas/page.tsx:13` | Planejamento, previsões, custo do kg e relatórios | — |
| `PaginaRotina` | componente | `src/app/(app)/pendencias/page.tsx:20` | Início, painel, ajuda e configurações | — |
| `PaginaSanidade` | componente | `src/app/(app)/sanidade/page.tsx:18` | Produção | — |
| `PaginaSeguranca` | componente | `src/app/(app)/seguranca/page.tsx:10` | Login, segurança, usuários e permissões | — |
| `PaginaSemAcesso` | componente | `src/app/(app)/sem-acesso/page.tsx:8` | Login, segurança, usuários e permissões | — |
| `PaginaSondas` | componente | `src/app/(app)/sondas/page.tsx:44` | Início, painel, ajuda e configurações | — |
| `PaginaTabelasDePreco` | componente | `src/app/(app)/tabelas-de-preco/page.tsx:10` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaTermos` | componente | `src/app/termos/page.tsx:10` | Login, segurança, usuários e permissões | — |
| `PaginaTitulos` | componente | `src/app/(app)/_titulos/pagina.tsx:44` | Financeiro | 2 arquivos |
| `PaginaTransferencias` | componente | `src/app/(app)/pontos-de-venda/transferencias/page.tsx:17` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaUsuarios` | componente | `src/app/(app)/configuracoes/usuarios/page.tsx:12` | Login, segurança, usuários e permissões | — |
| `PaginaVendas` | componente | `src/app/(app)/vendas/page.tsx:37` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaVendedor` | componente | `src/app/vendedor/page.tsx:16` | Vendas, PDV, estoque, produtos e ração | — |
| `PaginaViabilidade` | componente | `src/app/(app)/planejamento/viabilidade/page.tsx:18` | Planejamento, previsões, custo do kg e relatórios | — |
| `PaginaZerarFinanceiro` | componente | `src/app/(app)/configuracoes/zerar-financeiro/page.tsx:9` | Financeiro | — |
| `PaginaZerarSistema` | componente | `src/app/(app)/configuracoes/zerar-sistema/page.tsx:9` | Financeiro | — |
| `Painel` | componente | `src/app/(app)/painel/page.tsx:117` | Início, painel, ajuda e configurações | — |
| `painel_conciliacao` | função SQL | `supabase/migrations/20261104020000_conciliacao_multipla.sql:123` | Financeiro | 1 arquivo |
| `painelCampo` | função | `src/lib/campo/servidor.ts:34` | Produção | 2 arquivos |
| `PainelCampo` | tipo | `src/lib/campo/tipos.ts:60` | Produção | 5 arquivos |
| `PainelContexto` | constante | `src/components/cadastro.tsx:18` | Comum | 1 arquivo |
| `PainelLateral` | componente | `src/components/cadastro.tsx:381` | Comum | 2 arquivos |
| `palpite_lancamento` | função SQL | `supabase/migrations/20261026210000_open_finance_conciliacao.sql:47` | Financeiro | — |
| `palpites_firmes` | função SQL | `supabase/migrations/20261104020000_conciliacao_multipla.sql:156` | Comum | 1 arquivo |
| `papelViveiro` | função | `src/lib/planejamento.ts:124` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `paraCsv` | função | `src/lib/relatorios.ts:43` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `parametroModelo` | função | `src/lib/whatsapp-texto.ts:25` | Comum | 2 arquivos |
| `Parametros` | tipo | `src/lib/planejamento.ts:16` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `PARAMETROS_PADRAO` | constante | `src/lib/previsao-racao.ts:389` | Vendas, PDV, estoque, produtos e ração | 4 arquivos |
| `parametrosCobranca` | função | `src/lib/whatsapp-texto.ts:91` | Comum | 2 arquivos |
| `paraParametros` | função | `src/lib/planejamento-dados.ts:28` | Planejamento, previsões, custo do kg e relatórios | — |
| `Parte` | tipo | `src/lib/regras-em-partes.ts:6` | Financeiro | 3 arquivos |
| `Passo` | componente | `src/components/campo/pecas.tsx:48` | Produção | 3 arquivos |
| `Passo` | tipo | `src/lib/tutoriais.ts:8` | Início, painel, ajuda e configurações | — |
| `PassoBanco` | tipo | `src/lib/assistente.ts:4` | Início, painel, ajuda e configurações | — |
| `PASSOS` | constante | `src/lib/assistente.ts:9` | Início, painel, ajuda e configurações | — |
| `passosConhecidos` | função | `src/lib/assistente.ts:49` | Início, painel, ajuda e configurações | 2 arquivos |
| `passosPermitidos` | função | `src/lib/tutoriais.ts:726` | Início, painel, ajuda e configurações | 2 arquivos |
| `passoTotp` | função | `e2e/totp.ts:21` | Comum | 2 arquivos |
| `PASTA_ESTADO` | constante | `e2e/apoio.ts:64` | Comum | 1 arquivo |
| `PATCH` | constante | `src/app/api/v1/contatos/[id]/route.ts:18` | API pública, webhooks e rotinas agendadas | — |
| `PATCH` | constante | `src/app/api/v1/produtos/[id]/route.ts:17` | API pública, webhooks e rotinas agendadas | — |
| `pctPerda` | função | `src/lib/pontos.ts:24` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `Pdv` | componente | `src/components/vendas/pdv.tsx:32` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `pedido_itens` | tabela | `supabase/migrations/20261026000001_schema.sql:855` | Vendas, PDV, estoque, produtos e ração | — |
| `PedidoCampo` | tipo | `src/lib/pedido-campo.ts:8` | Produção | — |
| `pedidos` | view | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:361` | Vendas, PDV, estoque, produtos e ração | 5 arquivos |
| `pedidos_fixos` | tabela | `supabase/migrations/20261101170000_automacoes_vendas.sql:55` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `pedidos_fixos_gerados` | tabela | `supabase/migrations/20261101170000_automacoes_vendas.sql:77` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `pedidos_venda` | tabela | `supabase/migrations/20261026000001_schema.sql:832` | Vendas, PDV, estoque, produtos e ração | 10 arquivos |
| `PedidoVendedor` | tipo | `src/components/vendas/vendedor.tsx:21` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `pedirCodigoWhatsApp` | ação | `src/app/(app)/seguranca/whatsapp-actions.ts:15` | Login, segurança, usuários e permissões | 1 arquivo |
| `peixesPorMes` | função | `src/lib/planejamento.ts:654` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `Pendencia` | tipo | `src/lib/pendencias.ts:13` | Comum | 1 arquivo |
| `pendenciaDoCartao` | função | `src/lib/campo/propostas.ts:115` | Produção | 3 arquivos |
| `Perfil` | tipo | `src/lib/asaas-mapa.ts:3` | Cobrança | — |
| `perfil_da_cobranca` | trigger | `supabase/migrations/20261027123500_termos_e_seguranca.sql:88` | Cobrança | — |
| `PERFIS` | constante | `src/lib/permissoes-regras.ts:45` | Login, segurança, usuários e permissões | 3 arquivos |
| `perfis_cobranca` | tabela | `supabase/migrations/20261026000001_schema.sql:457` | Cobrança | 10 arquivos |
| `Periodo` | tipo | `src/lib/analise-periodo.ts:18` | Planejamento, previsões, custo do kg e relatórios | — |
| `periodoLancamentos` | função | `src/lib/apontamento-excluir.ts:21` | Produção | 2 arquivos |
| `periodoMes` | função | `src/lib/pacote-contador.ts:20` | Financeiro | 1 arquivo |
| `PERIODOS` | constante | `src/lib/analise-periodo.ts:8` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `Periodos` | tipo | `src/lib/analise-periodo.ts:19` | Planejamento, previsões, custo do kg e relatórios | — |
| `periodos_fechados` | tabela | `supabase/migrations/20261026000001_schema.sql:289` | Financeiro | 2 arquivos |
| `Permissoes` | tipo | `src/lib/pacote-contador.ts:18` | Financeiro | — |
| `Permissoes` | tipo | `src/lib/permissoes.ts:9` | Login, segurança, usuários e permissões | — |
| `permissoes_dos_perfis` | função SQL | `supabase/migrations/20261029213000_cargos.sql:57` | Login, segurança, usuários e permissões | 2 arquivos |
| `PERMISSOES_RELATORIOS` | constante | `src/lib/relatorios-catalogo.ts:72` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `permissoesDoApp` | função | `src/lib/app-celular/sessao.ts:54` | Comum | 7 arquivos |
| `PESO_BIOMETRIA_QUINZENAL_G` | constante | `src/lib/campo/indicadores.ts:6` | Produção | — |
| `pesoCurva` | função | `src/lib/crescimento.ts:21` | Produção | 1 arquivo |
| `pesoEsperado` | função | `src/lib/crescimento.ts:47` | Produção | 5 arquivos |
| `pesoMedioAmostra` | função | `src/lib/campo/indicadores.ts:22` | Produção | 2 arquivos |
| `planejamento_custos` | tabela | `supabase/migrations/20261027193500_planejamento.sql:64` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `planejamento_parametros` | tabela | `supabase/migrations/20261027193500_planejamento.sql:32` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `PlanejamentoRacao` | componente | `src/app/(app)/lotes/[id]/planejamento-racao.tsx:40` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `planejarReserva` | função | `src/lib/previsao-racao.ts:331` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `PLANILHA` | constante | `src/lib/planilha.ts:8` | Comum | 2 arquivos |
| `planilhaXlsx` | função | `src/lib/planilha.ts:170` | Comum | 3 arquivos |
| `Plano` | tipo | `src/lib/assinatura-mapa.ts:5` | Cobrança | 2 arquivos |
| `planoAbastecimento` | função | `src/lib/abastecimento.ts:11` | Comum | 2 arquivos |
| `planoInclui` | função | `src/lib/permissoes-regras.ts:72` | Login, segurança, usuários e permissões | 3 arquivos |
| `PlanoRacao` | tipo | `src/lib/previsao-racao-dados.ts:17` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `planos` | tabela | `supabase/migrations/20261027050000_assinaturas.sql:8` | Cobrança | 2 arquivos |
| `plural` | função | `src/lib/formato.ts:63` | Comum | 3 arquivos |
| `podeDispensar2fa` | função | `src/lib/permissoes-regras.ts:92` | Login, segurança, usuários e permissões | 2 arquivos |
| `podeEspiar` | função | `src/lib/lateral.ts:41` | Comum | 2 arquivos |
| `podeExcluirLancamento` | função | `src/lib/apontamento-excluir.ts:8` | Produção | 2 arquivos |
| `podeVerModulo` | função | `src/lib/modulos.ts:90` | Comum | 2 arquivos |
| `podeVerTutorial` | função | `src/lib/tutoriais.ts:722` | Início, painel, ajuda e configurações | 2 arquivos |
| `Ponto` | tipo | `src/lib/regras-em-partes.ts:5` | Financeiro | 3 arquivos |
| `PontoCrescimento` | tipo | `src/lib/campo/tipos.ts:15` | Produção | — |
| `PontoCrescimento` | tipo | `src/lib/crescimento.ts:66` | Produção | — |
| `PontoCurva` | tipo | `src/lib/crescimento.ts:11` | Produção | 2 arquivos |
| `pontoDoPdv` | função | `src/lib/pontos-dados.ts:33` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `PontoProjecao` | tipo | `src/lib/previsao.ts:22` | Planejamento, previsões, custo do kg e relatórios | — |
| `pontos_venda` | tabela | `supabase/migrations/20261029173000_pontos_de_venda.sql:19` | Vendas, PDV, estoque, produtos e ração | 4 arquivos |
| `PontoVenda` | tipo | `src/lib/pontos-dados.ts:6` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `portal_cliente` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:960` | Comum | 1 arquivo |
| `POST` | função | `src/app/api/abrir-lote/route.ts:5` | Produção | — |
| `POST` | função | `src/app/api/apontamentos/route.ts:7` | Produção | — |
| `POST` | função | `src/app/api/app/apontamentos/route.ts:6` | Produção | — |
| `POST` | função | `src/app/api/app/campo/route.ts:6` | Produção | — |
| `POST` | função | `src/app/api/app/estoque/movimentar/route.ts:18` | Vendas, PDV, estoque, produtos e ração | — |
| `POST` | função | `src/app/api/app/estoque/route.ts:8` | Vendas, PDV, estoque, produtos e ração | — |
| `POST` | função | `src/app/api/app/login/route.ts:9` | Login, segurança, usuários e permissões | — |
| `POST` | função | `src/app/api/app/mfa/route.ts:28` | Login, segurança, usuários e permissões | — |
| `POST` | função | `src/app/api/app/painel/route.ts:7` | Início, painel, ajuda e configurações | — |
| `POST` | função | `src/app/api/app/pdv/route.ts:9` | Vendas, PDV, estoque, produtos e ração | — |
| `POST` | função | `src/app/api/app/pdv/vender/route.ts:7` | Vendas, PDV, estoque, produtos e ração | — |
| `POST` | função | `src/app/api/app/pedidos/route.ts:6` | Vendas, PDV, estoque, produtos e ração | — |
| `POST` | função | `src/app/api/app/vendas/route.ts:7` | Vendas, PDV, estoque, produtos e ração | — |
| `POST` | função | `src/app/api/biometrias/route.ts:5` | Comum | — |
| `POST` | função | `src/app/api/chat/manejo/route.ts:14` | Comum | — |
| `POST` | função | `src/app/api/entrada/email/route.ts:21` | Comum | — |
| `POST` | função | `src/app/api/entrada/whatsapp/route.ts:26` | Comum | — |
| `POST` | função | `src/app/api/lancar-insumos/route.ts:5` | Comum | — |
| `POST` | função | `src/app/api/lotes/[id]/fechar/route.ts:5` | Produção | — |
| `POST` | função | `src/app/api/pedidos/route.ts:8` | Vendas, PDV, estoque, produtos e ração | — |
| `POST` | função | `src/app/api/push/route.ts:9` | Comum | — |
| `POST` | constante | `src/app/api/v1/contatos/route.ts:38` | API pública, webhooks e rotinas agendadas | — |
| `POST` | constante | `src/app/api/v1/lancamentos/[id]/baixas/route.ts:7` | API pública, webhooks e rotinas agendadas | — |
| `POST` | constante | `src/app/api/v1/lancamentos/route.ts:49` | API pública, webhooks e rotinas agendadas | — |
| `POST` | constante | `src/app/api/v1/produtos/route.ts:40` | API pública, webhooks e rotinas agendadas | — |
| `POST` | função | `src/app/api/v1/sondas/leituras/route.ts:16` | API pública, webhooks e rotinas agendadas | — |
| `POST` | função | `src/app/api/webhooks/asaas/route.ts:13` | API pública, webhooks e rotinas agendadas | — |
| `POST` | função | `src/app/api/webhooks/assinatura/route.ts:9` | API pública, webhooks e rotinas agendadas | — |
| `POST` | função | `src/app/api/webhooks/focus/route.ts:10` | API pública, webhooks e rotinas agendadas | — |
| `POST` | função | `src/app/api/webhooks/pluggy/route.ts:12` | API pública, webhooks e rotinas agendadas | — |
| `povoar_lote` | função SQL | `supabase/migrations/20261105000001_piscicultura_estrutura.sql:360` | Produção | 3 arquivos |
| `povoarLote` | ação | `src/app/(app)/lotes/actions.ts:24` | Produção | 1 arquivo |
| `preco_na_lista` | trigger | `supabase/migrations/20261027133000_tabelas_de_preco.sql:120` | Vendas, PDV, estoque, produtos e ração | — |
| `preco_so_de_venda` | trigger | `supabase/migrations/20261102170000_produtos_para_venda.sql:46` | Vendas, PDV, estoque, produtos e ração | — |
| `preco_vigente` | função SQL | `supabase/migrations/20261028060000_fuso_da_empresa.sql:475` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `precoKg` | função | `src/lib/pescado.ts:68` | Comum | 1 arquivo |
| `precoRacaoKg` | função | `src/lib/previsao.ts:236` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `PrecoTabela` | tipo | `src/lib/vendas.ts:93` | Vendas, PDV, estoque, produtos e ração | 4 arquivos |
| `precoVigente` | função | `src/lib/vendas.ts:110` | Vendas, PDV, estoque, produtos e ração | 4 arquivos |
| `preenche` | função | `src/lib/planilha.ts:20` | Comum | 2 arquivos |
| `preencherChecklist` | função | `e2e/apoio.ts:119` | Comum | 2 arquivos |
| `PREFIXOS_MIGRADOS` | constante | `src/lib/db/indexeddb.ts:22` | Comum | — |
| `prefixoToken` | função | `src/lib/api/regras.ts:64` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `PREMISSAS_INICIAIS` | constante | `src/lib/planejamento.ts:42` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `preparar` | função | `e2e/preparar.ts:70` | Comum | — |
| `preparar_cobranca` | função SQL | `supabase/migrations/20261028060000_fuso_da_empresa.sql:246` | Cobrança | 1 arquivo |
| `preparar_nfce` | função SQL | `supabase/migrations/20261029140000_nfe_completa.sql:53` | Fiscal | 1 arquivo |
| `preparar_nfe` | função SQL | `supabase/migrations/20261026220000_nfe.sql:41` | Fiscal | 1 arquivo |
| `prever` | função | `src/lib/planejamento.ts:326` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `preverLote` | função | `src/lib/previsao-racao.ts:116` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `Previa` | tipo | `src/lib/importacao-modelo.ts:299` | Importação | 2 arquivos |
| `previaModelo` | ação | `src/app/(app)/configuracoes/importar/actions.ts:279` | Importação | 1 arquivo |
| `Previsao` | tipo | `src/lib/planejamento.ts:299` | Planejamento, previsões, custo do kg e relatórios | — |
| `PrevisaoDoLote` | tipo | `src/lib/previsao-racao-dados.ts:16` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `PrevisaoLote` | tipo | `src/lib/previsao-racao.ts:86` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `primeiroSaldoNegativo` | função | `src/lib/previsao.ts:213` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `PrimeirosPassos` | componente | `src/app/(app)/primeiros-passos/page.tsx:12` | Início, painel, ajuda e configurações | — |
| `primeiroVencimento` | função | `src/lib/assinatura-mapa.ts:21` | Cobrança | 2 arquivos |
| `Problema` | tipo | `src/lib/importacao-modelo.ts:294` | Importação | — |
| `Producao` | tipo | `src/lib/analise-periodo.ts:257` | Planejamento, previsões, custo do kg e relatórios | — |
| `producaoPorDia` | função | `src/lib/painel.ts:44` | Início, painel, ajuda e configurações | 2 arquivos |
| `Produto` | tipo | `src/app/(app)/produtos/lista.tsx:12` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `produto_embalagens` | tabela | `supabase/migrations/20261101120500_automacoes_estoque.sql:13` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `produto_para_venda_padrao` | trigger | `supabase/migrations/20261102170000_produtos_para_venda.sql:27` | Vendas, PDV, estoque, produtos e ração | — |
| `ProdutoApi` | tipo | `src/lib/api/regras.ts:263` | API pública, webhooks e rotinas agendadas | — |
| `ProdutoEstoque` | tipo | `src/app/(app)/conciliacao/campos-novo.tsx:10` | Produção | — |
| `ProdutoEstoque` | tipo | `src/components/movimento-estoque.tsx:10` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `ProdutoEstoque` | tipo | `src/lib/estoque-carrinho.ts:5` | Vendas, PDV, estoque, produtos e ração | — |
| `ProdutoImportado` | tipo | `src/lib/importacao.ts:21` | Importação | 1 arquivo |
| `produtoNaAba` | função | `src/lib/estoque.ts:35` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `ProdutoPreco` | tipo | `src/app/(app)/tabelas-de-preco/lista.tsx:11` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `produtorDe` | função | `src/lib/lcdpr-dados.ts:10` | Comum | 1 arquivo |
| `ProdutorLcdpr` | tipo | `src/lib/lcdpr.ts:6` | Comum | 1 arquivo |
| `produtos` | tabela | `supabase/migrations/20261026000001_schema.sql:752` | Vendas, PDV, estoque, produtos e ração | 25 arquivos |
| `produtos_da_classe` | trigger | `supabase/migrations/20261105000005_piscicultura_cadastros.sql:404` | Produção | — |
| `ProdutoVenda` | tipo | `src/lib/vendas-dados.ts:9` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `produzir_racao` | função SQL | `supabase/migrations/20261111000002_remover_fabrica_racao.sql:17` | Vendas, PDV, estoque, produtos e ração | — |
| `progresso` | função | `src/lib/assistente.ts:69` | Início, painel, ajuda e configurações | 3 arquivos |
| `Projecao` | tipo | `src/lib/previsao.ts:27` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `projetarLote` | função | `src/lib/previsao.ts:60` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `prontoAgora` | função | `src/lib/sync/queue.ts:24` | Comum | 3 arquivos |
| `prontosParaEnvio` | função | `src/lib/campo/fila.ts:73` | Produção | 2 arquivos |
| `propor_pagamentos` | função SQL | `supabase/migrations/20261101230000_pagamentos_asaas.sql:71` | Comum | 1 arquivo |
| `proporPagamentos` | ação | `src/app/(app)/contas-a-pagar/pagamentos/actions.ts:18` | Financeiro | 1 arquivo |
| `PropostaIa` | tipo | `src/lib/campo/propostas.ts:28` | Produção | 1 arquivo |
| `protege_asaas_cliente` | trigger | `supabase/migrations/20261027123500_termos_e_seguranca.sql:71` | Financeiro | — |
| `protege_categoria_sistema` | trigger | `supabase/migrations/20261027010000_cadastros.sql:99` | Financeiro | — |
| `protege_conta_open_finance` | trigger | `supabase/migrations/20261027123500_termos_e_seguranca.sql:75` | Financeiro | — |
| `protege_credenciais` | trigger | `supabase/migrations/20261027130000_contas_asaas.sql:47` | Cobrança | — |
| `protege_exclusao` | trigger | `supabase/migrations/20261029040000_excluir_conta.sql:28` | Financeiro | — |
| `protege_id_externo` | trigger | `supabase/migrations/20261027123500_termos_e_seguranca.sql:67` | Cobrança | — |
| `protege_item_open_finance` | trigger | `supabase/migrations/20261027123500_termos_e_seguranca.sql:73` | Financeiro | — |
| `protege_lista_preco` | trigger | `supabase/migrations/20261027133000_tabelas_de_preco.sql:63` | Vendas, PDV, estoque, produtos e ração | — |
| `protege_produto` | trigger | `supabase/migrations/20261027010000_cadastros.sql:128` | Vendas, PDV, estoque, produtos e ração | — |
| `protege_provedor_ref` | trigger | `supabase/migrations/20261027123500_termos_e_seguranca.sql:69` | Fiscal | — |
| `protege_sem_classificacao` | trigger | `supabase/migrations/20261027123000_apontamento_por_turno.sql:57` | Produção | — |
| `proteger` | trigger | `supabase/migrations/20261029231000_rh_ponto.sql:354` | RH e cartão de ponto | — |
| `ProvedorCampo` | constante | `src/components/campo/contexto.tsx:47` | Produção | 1 arquivo |
| `proximaBiometria` | função | `src/lib/campo/indicadores.ts:8` | Produção | 4 arquivos |
| `proximaJanela` | função | `src/lib/planejamento.ts:276` | Planejamento, previsões, custo do kg e relatórios | — |
| `proximaRodada` | função | `src/lib/sync/queue.ts:46` | Comum | 1 arquivo |
| `proximoPasso` | função | `src/lib/assistente.ts:59` | Início, painel, ajuda e configurações | 3 arquivos |
| `proxy` | função | `src/proxy.ts:45` | Login, segurança, usuários e permissões | — |
| `pula_movimento_apagado` | trigger | `supabase/migrations/20261029080000_desconciliar_e_apagar_extrato.sql:52` | Financeiro | — |
| `pularPasso` | ação | `src/app/(app)/primeiros-passos/actions.ts:14` | Início, painel, ajuda e configurações | 1 arquivo |
| `push_inscricoes` | tabela | `supabase/migrations/20261101100000_automacoes.sql:23` | Comum | 3 arquivos |
| `pushConfigurado` | função | `src/lib/push.ts:8` | Comum | 1 arquivo |
| `quando` | função | `src/components/campo/pecas.tsx:210` | Produção | 2 arquivos |
| `quantidadeQueCabe` | função | `src/lib/estoque-carrinho.ts:12` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `racao_ajustes` | tabela | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:496` | Vendas, PDV, estoque, produtos e ração | — |
| `racao_apontamento_estoque` | trigger | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:302` | Produção | — |
| `racao_entrada_conferir` | trigger | `supabase/migrations/20261111000001_racao_entradas.sql:101` | Vendas, PDV, estoque, produtos e ração | — |
| `racao_entrada_estoque` | trigger | `supabase/migrations/20261111000001_racao_entradas.sql:127` | Vendas, PDV, estoque, produtos e ração | — |
| `racao_entradas` | tabela | `supabase/migrations/20261111000001_racao_entradas.sql:34` | Vendas, PDV, estoque, produtos e ração | — |
| `racao_estornos` | tabela | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:436` | Vendas, PDV, estoque, produtos e ração | — |
| `racao_movimento_conferir` | trigger | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:148` | Vendas, PDV, estoque, produtos e ração | — |
| `racao_movimento_sem_apagar` | trigger | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:181` | Vendas, PDV, estoque, produtos e ração | — |
| `racao_movimentos` | view | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:619` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `racao_parametros` | tabela | `supabase/migrations/20261111000004_biometria_grupos.sql:158` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `racao_saldo_conferir` | trigger | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:168` | Vendas, PDV, estoque, produtos e ração | — |
| `racao_saldos` | view | `supabase/migrations/20261111000003_racao_baixa_por_entrada.sql:105` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `racao_sugerida` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:704` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `RacaoApontamento` | tipo | `src/app/(app)/apontamentos/campos-lancamento.tsx:16` | Produção | — |
| `RacaoCampo` | componente | `src/components/campo/racao-campo.tsx:13` | Produção | 1 arquivo |
| `racaoDaFaixa` | função | `src/lib/previsao-racao.ts:74` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `RacaoFicha` | tipo | `src/lib/previsao-racao.ts:24` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `RacaoLancada` | tipo | `src/lib/apontamento-racao.ts:9` | Produção | 1 arquivo |
| `racaoPorTurno` | função | `src/lib/campo/indicadores.ts:16` | Produção | 4 arquivos |
| `RacaoSugerida` | tipo | `src/lib/campo/tipos.ts:3` | Produção | 1 arquivo |
| `RacaoTabela` | tipo | `src/app/(app)/apontamentos/campos-lancamento.tsx:14` | Produção | — |
| `ranking` | função | `src/lib/painel.ts:24` | Início, painel, ajuda e configurações | 2 arquivos |
| `ratear_titulo` | função SQL | `supabase/migrations/20261102031000_rateio_conciliacao.sql:179` | Financeiro | 1 arquivo |
| `ratearTitulo` | ação | `src/app/(app)/_titulos/actions.ts:267` | Financeiro | 1 arquivo |
| `Rateio` | componente | `src/components/rateio.tsx:25` | Financeiro | 3 arquivos |
| `rateio_fecha` | trigger | `supabase/migrations/20261026000001_schema.sql:267` | Financeiro | — |
| `RateioImportado` | tipo | `src/lib/importacao.ts:35` | Importação | — |
| `reabrir_lote` | função SQL | `supabase/migrations/20261105000001_piscicultura_estrutura.sql:651` | Produção | 1 arquivo |
| `reabrir_mes` | função SQL | `supabase/migrations/20261026000005_conciliacao_relatorios.sql:239` | Comum | — |
| `reabrirLote` | ação | `src/app/(app)/lotes/actions.ts:127` | Produção | 1 arquivo |
| `reabrirMes` | ação | `src/app/(app)/relatorios/dre/actions.ts:23` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `recalcularCustos` | ação | `src/app/(app)/custo-do-kg/actions.ts:10` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `receber_compra_do_grupo` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:1266` | Comum | 1 arquivo |
| `receber_transferencia_peixe` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:1186` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `receberDaFila` | função | `src/lib/campo/rota.ts:12` | Produção | 4 arquivos |
| `receberDocumento` | função | `src/lib/documento-recebido.ts:35` | Comum | 3 arquivos |
| `receberPedido` | ação | `src/app/(app)/vendas/actions.ts:265` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `receberTransferencia` | ação | `src/app/(app)/pontos-de-venda/actions.ts:136` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `receitasDespesas` | função | `src/lib/painel.ts:12` | Início, painel, ajuda e configurações | 2 arquivos |
| `reconhecerAba` | função | `src/lib/importacao-modelo.ts:333` | Importação | 1 arquivo |
| `Reconhecimento` | tipo | `src/lib/reconhecimento-voz.ts:4` | Comum | 2 arquivos |
| `recorrencia_reajustes` | tabela | `supabase/migrations/20261026000001_schema.sql:182` | Financeiro | — |
| `recorrencias` | tabela | `supabase/migrations/20261026000001_schema.sql:158` | Financeiro | 1 arquivo |
| `recorrencias_sugeridas` | função SQL | `supabase/migrations/20261101110000_automacoes_financeiro.sql:130` | Financeiro | 2 arquivos |
| `reduzirImagem` | função | `src/lib/imagem-cliente.ts:3` | Comum | 2 arquivos |
| `refazerTutoriais` | ação | `src/lib/tutoriais-acoes.ts:16` | Início, painel, ajuda e configurações | 1 arquivo |
| `refDaNota` | função | `src/lib/focus-mapa.ts:192` | Fiscal | 3 arquivos |
| `REFERENCIA_MERCADO` | constante | `src/lib/planejamento.ts:54` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `ReferenciaEspecie` | tipo | `src/lib/zootecnico.ts:191` | Produção | — |
| `referenciaEspecie` | função | `src/lib/zootecnico.ts:212` | Produção | 3 arquivos |
| `REFERENCIAS_ESPECIE` | constante | `src/lib/zootecnico.ts:206` | Produção | — |
| `Regime` | tipo | `src/lib/consultas-relatorio.ts:5` | Planejamento, previsões, custo do kg e relatórios | — |
| `registrar_apontamento` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:133` | Produção | 1 arquivo |
| `registrar_biometria` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:571` | Comum | 2 arquivos |
| `registrar_biometria_grupos` | função SQL | `supabase/migrations/20261111000004_biometria_grupos.sql:87` | Comum | 2 arquivos |
| `registrar_despesca` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:445` | Comum | 2 arquivos |
| `registrar_entrada` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:775` | Comum | — |
| `registrar_entrada_racao` | função SQL | `supabase/migrations/20261111000001_racao_entradas.sql:134` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `registrar_envio_pagamento` | função SQL | `supabase/migrations/20261101230000_pagamentos_asaas.sql:156` | Comum | 1 arquivo |
| `registrar_evento_assinatura` | função SQL | `supabase/migrations/20261027050000_assinaturas.sql:125` | Cobrança | 1 arquivo |
| `registrar_falha_login` | função SQL | `supabase/migrations/20261030140000_alarmes_seguranca.sql:30` | Login, segurança, usuários e permissões | 1 arquivo |
| `registrar_insumo_viveiro` | função SQL | `supabase/migrations/20261105000006_campo_insumos.sql:28` | Comum | 1 arquivo |
| `registrar_lancamento_campo` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:322` | Produção | 1 arquivo |
| `registrar_login_local` | função SQL | `supabase/migrations/20261029223000_login_local.sql:106` | Login, segurança, usuários e permissões | 1 arquivo |
| `registrar_medicacao` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:421` | Produção | 2 arquivos |
| `registrar_nfes_recebidas` | função SQL | `supabase/migrations/20261101160000_nfes_recebidas.sql:57` | Fiscal | 3 arquivos |
| `registrar_saida` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:798` | Comum | — |
| `registrar_uso_ia` | função SQL | `supabase/migrations/20261105000007_chat_campo_uso_ia.sql:16` | Comum | 3 arquivos |
| `registrarAceite` | função | `src/lib/aceite-termos.ts:18` | Login, segurança, usuários e permissões | 2 arquivos |
| `registrarApontamento` | ação | `src/app/(app)/apontamentos/actions.ts:21` | Produção | 1 arquivo |
| `registrarBiometria` | ação | `src/app/(app)/lotes/actions.ts:144` | Produção | 1 arquivo |
| `registrarConexao` | ação | `src/app/(app)/conciliacao/open-finance-actions.ts:48` | Financeiro | 1 arquivo |
| `registrarDespesca` | ação | `src/app/(app)/despescas/actions.ts:16` | Comum | 1 arquivo |
| `registrarEnviado` | função | `src/lib/campo/fila.ts:83` | Produção | 2 arquivos |
| `registrarEvento` | ação | `src/app/(app)/sanidade/actions.ts:19` | Produção | 1 arquivo |
| `registrarFalha` | função | `src/lib/sync/queue.ts:32` | Comum | 3 arquivos |
| `registrarFalhaLogin` | função | `src/lib/login-servidor.ts:16` | Login, segurança, usuários e permissões | 2 arquivos |
| `registrarMedicacao` | ação | `src/app/(app)/sanidade/actions.ts:51` | Produção | 1 arquivo |
| `registrarSessaoVerificada` | função | `src/lib/mfa.ts:33` | Login, segurança, usuários e permissões | 1 arquivo |
| `registrarVenda` | ação | `src/app/(app)/vendas/actions.ts:121` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `registrarWebhookFocus` | ação | `src/app/(app)/notas/actions.ts:350` | Fiscal | 1 arquivo |
| `Registro` | tipo | `src/lib/historico.ts:111` | Login, segurança, usuários e permissões | 1 arquivo |
| `RegraFiscal` | tipo | `src/lib/focus-mapa.ts:20` | Fiscal | 2 arquivos |
| `regras_conciliacao` | tabela | `supabase/migrations/20261026000001_schema.sql:428` | Financeiro | 2 arquivos |
| `regras_fiscais` | tabela | `supabase/migrations/20261101170000_automacoes_vendas.sql:18` | Financeiro | 2 arquivos |
| `regras_sugeridas` | função SQL | `supabase/migrations/20261101110000_automacoes_financeiro.sql:90` | Financeiro | 2 arquivos |
| `Relatorio` | tipo | `src/lib/relatorios-catalogo.ts:17` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `RELATORIOS` | constante | `src/lib/relatorios-catalogo.ts:28` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `RelatoriosVendas` | componente | `src/app/(app)/relatorios/vendas/page.tsx:19` | Vendas, PDV, estoque, produtos e ração | — |
| `relatoriosVisiveis` | função | `src/lib/relatorios-catalogo.ts:74` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `remessas_cnab` | tabela | `supabase/migrations/20261026000001_schema.sql:537` | Cobrança | — |
| `remover_preco` | função SQL | `supabase/migrations/20261028060000_fuso_da_empresa.sql:533` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `remover_usuario` | função SQL | `supabase/migrations/20261026000011_usuarios_permissoes.sql:226` | Login, segurança, usuários e permissões | 1 arquivo |
| `removerItem` | função | `src/lib/open-finance.ts:93` | Financeiro | 1 arquivo |
| `removerPrecoCliente` | ação | `src/app/(app)/vendas/actions.ts:298` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `removerUsuario` | ação | `src/app/(app)/configuracoes/usuarios/actions.ts:65` | Login, segurança, usuários e permissões | 1 arquivo |
| `Renovacao` | tipo | `src/lib/planejamento.ts:309` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `reordenar_categorias` | função SQL | `supabase/migrations/20261101153000_ordem_categorias_centros.sql:72` | Financeiro | 1 arquivo |
| `reordenar_centros_custo` | função SQL | `supabase/migrations/20261101153000_ordem_categorias_centros.sql:88` | Financeiro | 1 arquivo |
| `reordenarCategorias` | ação | `src/app/(app)/categorias/actions.ts:73` | Financeiro | 1 arquivo |
| `reordenarCentrosCusto` | ação | `src/app/(app)/centros-de-custo/actions.ts:52` | Financeiro | 1 arquivo |
| `reprogramar_titulos` | função SQL | `supabase/migrations/20261028190000_acoes_titulos.sql:106` | Financeiro | 1 arquivo |
| `ReservaRacao` | tipo | `src/lib/previsao-racao.ts:292` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `resolverPeriodo` | função | `src/lib/analise-periodo.ts:43` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `responderManejo` | função | `src/lib/campo/chat.ts:48` | Produção | 1 arquivo |
| `responderManejoLocal` | função | `src/lib/campo/chat.ts:43` | Produção | 1 arquivo |
| `responderManejoOllama` | função | `src/lib/ai/offline-chat.ts:100` | Comum | 3 arquivos |
| `respostaApi` | função | `src/lib/api/servidor.ts:28` | API pública, webhooks e rotinas agendadas | 12 arquivos |
| `RespostaChat` | tipo | `src/lib/campo/manejo-ia.ts:67` | Produção | 2 arquivos |
| `RespostaChecklist` | tipo | `src/lib/apontamento-racao.ts:29` | Produção | 2 arquivos |
| `respostaDaSaida` | função | `src/lib/campo/manejo-ia.ts:77` | Produção | 2 arquivos |
| `RespostaManejo` | constante | `src/lib/campo/manejo-ia.ts:61` | Produção | 2 arquivos |
| `respostaManutencao` | função | `src/lib/manutencao.ts:34` | Manutenções | 2 arquivos |
| `restanteDoRateio` | função | `src/lib/rateio.ts:32` | Financeiro | 2 arquivos |
| `restaurar_centros_custo` | função SQL | `supabase/migrations/20261103010000_padroes_e_estoque_na_conciliacao.sql:194` | Financeiro | 1 arquivo |
| `restaurar_lancamento` | função SQL | `supabase/migrations/20261105000002_piscicultura_apontamento.sql:277` | Financeiro | 1 arquivo |
| `restaurar_plano_categorias` | função SQL | `supabase/migrations/20261103010000_padroes_e_estoque_na_conciliacao.sql:97` | Cobrança | 1 arquivo |
| `restaurar_titulos` | função SQL | `supabase/migrations/20261028190000_acoes_titulos.sql:142` | Financeiro | 1 arquivo |
| `restaurarLancamento` | ação | `src/app/(app)/apontamentos/actions.ts:178` | Produção | 1 arquivo |
| `RestaurarLancamento` | componente | `src/app/(app)/apontamentos/excluir-lancamento.tsx:29` | Produção | 1 arquivo |
| `resultado_caixa` | view | `supabase/migrations/20261026000005_conciliacao_relatorios.sql:202` | Financeiro | 1 arquivo |
| `resultado_competencia` | view | `supabase/migrations/20261026000005_conciliacao_relatorios.sql:192` | Financeiro | 1 arquivo |
| `resultadoCiclo` | função | `src/lib/previsao.ts:283` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `ResultadoFala` | tipo | `src/lib/fala-apontamento.ts:10` | Produção | 1 arquivo |
| `ResultadoImportacao` | tipo | `src/lib/importacao.ts:64` | Importação | 1 arquivo |
| `ResultadoRapido` | tipo | `src/app/(app)/_cadastro-rapido/actions.ts:12` | Comum | — |
| `ResultadoRegras` | tipo | `src/lib/regras-em-partes.ts:7` | Financeiro | — |
| `ResultadoSincronizacao` | tipo | `src/lib/open-finance.ts:97` | Financeiro | — |
| `resultadoVazio` | função | `src/lib/importacao.ts:70` | Importação | 1 arquivo |
| `Resumo` | tipo | `src/lib/lembretes.ts:16` | Comum | 1 arquivo |
| `resumo_pontos_venda` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:1241` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `ResumoAba` | tipo | `src/lib/importacao-modelo.ts:295` | Importação | — |
| `resumoAgua` | função | `src/lib/agua.ts:85` | Comum | 3 arquivos |
| `resumoCausas` | função | `src/lib/causas-morte.ts:45` | Produção | 2 arquivos |
| `resumoCusto` | função | `src/lib/analise-periodo.ts:199` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `ResumoEspecie` | tipo | `src/lib/zootecnico.ts:140` | Produção | — |
| `resumoFala` | função | `src/lib/fala-apontamento.ts:171` | Produção | 3 arquivos |
| `resumoFila` | função | `src/lib/campo/fila.ts:77` | Produção | 3 arquivos |
| `resumoFinanceiro` | função | `src/lib/analise-periodo.ts:107` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `resumoLote` | função | `src/lib/zootecnico.ts:60` | Produção | 4 arquivos |
| `resumoPorEspecie` | função | `src/lib/zootecnico.ts:146` | Produção | 2 arquivos |
| `resumoProducao` | função | `src/lib/analise-periodo.ts:158` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `resumos_diarios_devidos` | função SQL | `supabase/migrations/20261105000004_piscicultura_custos_indicadores.sql:515` | Comum | 1 arquivo |
| `resumoVendas` | função | `src/lib/vendas.ts:43` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `resumoVendasPeriodo` | função | `src/lib/analise-periodo.ts:229` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `resumoWhatsapp` | função | `src/lib/pedido-campo.ts:62` | Produção | 2 arquivos |
| `resumoWhatsApp` | função | `src/lib/pendencias.ts:41` | Comum | 2 arquivos |
| `ResumoZootecnico` | tipo | `src/lib/zootecnico.ts:20` | Produção | 1 arquivo |
| `retomarAssistente` | ação | `src/app/(app)/primeiros-passos/actions.ts:31` | Início, painel, ajuda e configurações | 2 arquivos |
| `RetornoBalcao` | tipo | `src/lib/pdv-servidor.ts:7` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `RetornoFocus` | tipo | `src/lib/focus-mapa.ts:132` | Fiscal | 2 arquivos |
| `RetornoVenda` | tipo | `src/app/(app)/vendas/actions.ts:85` | Vendas, PDV, estoque, produtos e ração | — |
| `revoga_chaves_api` | trigger | `supabase/migrations/20261028235500_api_chave_7_dias.sql:54` | Login, segurança, usuários e permissões | — |
| `revogar_chave_api` | função SQL | `supabase/migrations/20261028233000_api_publica.sql:146` | Comum | 1 arquivo |
| `revogarChave` | ação | `src/app/(app)/configuracoes/api/actions.ts:32` | API pública, webhooks e rotinas agendadas | 1 arquivo |
| `RodapeFolha` | componente | `src/components/campo/folha.tsx:14` | Produção | — |
| `RodapeLegal` | componente | `src/components/documento-legal.tsx:26` | Login, segurança, usuários e permissões | 1 arquivo |
| `RootLayout` | componente | `src/app/layout.tsx:29` | Início, painel, ajuda e configurações | — |
| `rotaApi` | função | `src/lib/api/servidor.ts:117` | API pública, webhooks e rotinas agendadas | 15 arquivos |
| `rotaDoItem` | função | `src/lib/campo/fila.ts:47` | Produção | 2 arquivos |
| `rotaFocus` | função | `src/lib/focus-mapa.ts:188` | Fiscal | 3 arquivos |
| `Roteiro` | tipo | `src/lib/apresentacao.ts:27` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `Rotulo` | componente | `src/components/campo/pecas.tsx:25` | Produção | — |
| `rotuloCartao` | função | `src/lib/campo/propostas.ts:143` | Produção | 5 arquivos |
| `rotuloMes` | função | `src/lib/formato.ts:47` | Comum | 8 arquivos |
| `rotuloMes` | função | `src/lib/painel.ts:7` | Início, painel, ajuda e configurações | 2 arquivos |
| `RotulosCelular` | componente | `src/components/tabela-celular.tsx:9` | Comum | 3 arquivos |
| `rotulosSituacao` | função | `src/lib/planilha.ts:186` | Comum | 1 arquivo |
| `sacosDoSaldo` | função | `src/lib/racao-estoque.ts:34` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `sacosParaKg` | função | `src/lib/campo/indicadores.ts:34` | Produção | 3 arquivos |
| `SaidaManejo` | tipo | `src/lib/campo/manejo-ia.ts:66` | Produção | — |
| `sair` | ação | `src/app/login/actions.ts:115` | Login, segurança, usuários e permissões | 3 arquivos |
| `SaldoDeposito` | tipo | `src/components/movimento-estoque.tsx:24` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `saldoInicial` | função | `src/lib/open-finance-mapa.ts:73` | Financeiro | 2 arquivos |
| `saldos_contas` | view | `supabase/migrations/20261026000004_financeiro_base.sql:20` | Financeiro | 10 arquivos |
| `saldos_estoque` | view | `supabase/migrations/20261026000001_schema.sql:796` | Vendas, PDV, estoque, produtos e ração | — |
| `saldos_produtos` | view | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:349` | Vendas, PDV, estoque, produtos e ração | 7 arquivos |
| `salvar_cargo` | função SQL | `supabase/migrations/20261029213000_cargos.sql:152` | Login, segurança, usuários e permissões | 1 arquivo |
| `salvar_formula` | função SQL | `supabase/migrations/20261111000002_remover_fabrica_racao.sql:11` | Vendas, PDV, estoque, produtos e ração | — |
| `salvar_orcamento` | função SQL | `supabase/migrations/20261026000008_regras_aging_orcamento.sql:206` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `salvar_tabela_preco` | função SQL | `supabase/migrations/20261028060000_fuso_da_empresa.sql:550` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `salvarAbastecimento` | ação | `src/app/(app)/configuracoes/automacoes/actions.ts:36` | Início, painel, ajuda e configurações | 1 arquivo |
| `salvarApontarAgua` | ação | `src/app/(app)/configuracoes/actions.ts:12` | Início, painel, ajuda e configurações | 1 arquivo |
| `salvarAvisosRotina` | ação | `src/app/(app)/configuracoes/automacoes/actions.ts:48` | Início, painel, ajuda e configurações | 1 arquivo |
| `salvarBuscaNfe` | ação | `src/app/(app)/configuracoes/automacoes/actions.ts:61` | Início, painel, ajuda e configurações | 1 arquivo |
| `salvarCargo` | ação | `src/app/(app)/configuracoes/usuarios/actions.ts:159` | Login, segurança, usuários e permissões | 1 arquivo |
| `salvarCategoria` | ação | `src/app/(app)/categorias/actions.ts:9` | Financeiro | 1 arquivo |
| `salvarCentroCusto` | ação | `src/app/(app)/centros-de-custo/actions.ts:11` | Financeiro | 1 arquivo |
| `salvarChatIa` | ação | `src/app/(app)/configuracoes/automacoes/actions.ts:105` | Início, painel, ajuda e configurações | 1 arquivo |
| `salvarClasse` | ação | `src/app/(app)/piscicultura/actions.ts:118` | Produção | 1 arquivo |
| `salvarCobrancaWhatsApp` | ação | `src/app/(app)/configuracoes/automacoes/actions.ts:118` | Início, painel, ajuda e configurações | 1 arquivo |
| `salvarConfigFiscal` | ação | `src/app/(app)/notas/actions.ts:252` | Fiscal | 1 arquivo |
| `salvarConta` | ação | `src/app/(app)/contas/actions.ts:18` | Financeiro | 1 arquivo |
| `salvarContato` | ação | `src/app/(app)/contatos/actions.ts:11` | Financeiro | 1 arquivo |
| `salvarCurva` | ação | `src/app/(app)/lotes/actions.ts:238` | Produção | 1 arquivo |
| `salvarCusto` | ação | `src/app/(app)/planejamento/actions.ts:115` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `salvarFuso` | ação | `src/app/(app)/configuracoes/actions.ts:25` | Início, painel, ajuda e configurações | 1 arquivo |
| `salvarLcdpr` | ação | `src/app/(app)/relatorios/contador/actions.ts:18` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `salvarLeituraIa` | ação | `src/app/(app)/configuracoes/automacoes/actions.ts:98` | Início, painel, ajuda e configurações | 1 arquivo |
| `salvarLembreteApontamento` | ação | `src/app/(app)/configuracoes/automacoes/actions.ts:26` | Início, painel, ajuda e configurações | 1 arquivo |
| `salvarLotePlanejado` | ação | `src/app/(app)/planejamento/actions.ts:66` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `salvarMedicamento` | ação | `src/app/(app)/medicamentos/actions.ts:16` | Produção | 1 arquivo |
| `salvarOrcamento` | ação | `src/app/(app)/relatorios/orcamento/actions.ts:14` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `salvarPagamentos` | ação | `src/app/(app)/configuracoes/automacoes/actions.ts:131` | Início, painel, ajuda e configurações | 1 arquivo |
| `salvarParametros` | ação | `src/app/(app)/planejamento/actions.ts:15` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `salvarParametrosRacao` | ação | `src/app/(app)/racao/actions.ts:84` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `salvarPedidoFixo` | ação | `src/app/(app)/vendas/fixos/actions.ts:11` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `salvarPerfil` | ação | `src/app/(app)/cobrancas/actions.ts:19` | Cobrança | 1 arquivo |
| `salvarPonto` | ação | `src/app/(app)/pontos-de-venda/actions.ts:59` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `salvarProduto` | ação | `src/app/(app)/produtos/actions.ts:18` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `salvarRegraFiscal` | ação | `src/app/(app)/notas/actions.ts:374` | Fiscal | 1 arquivo |
| `salvarSetor` | ação | `src/app/(app)/piscicultura/actions.ts:24` | Produção | 1 arquivo |
| `salvarTabelaPreco` | ação | `src/app/(app)/tabelas-de-preco/actions.ts:23` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `salvarVendas` | ação | `src/app/(app)/configuracoes/automacoes/actions.ts:85` | Início, painel, ajuda e configurações | 1 arquivo |
| `salvarViveiro` | ação | `src/app/(app)/piscicultura/actions.ts:63` | Produção | 1 arquivo |
| `SCRIPT_LATERAL` | constante | `src/lib/lateral.ts:9` | Comum | 1 arquivo |
| `SCRIPT_TEMA` | constante | `src/components/tema.tsx:17` | Comum | 1 arquivo |
| `SCRIPT_VERSAO` | constante | `src/lib/versao.ts:12` | Início, painel, ajuda e configurações | 1 arquivo |
| `Secao` | componente | `src/components/ui.tsx:228` | Comum | 2 arquivos |
| `Secao` | tipo | `src/lib/menu.ts:9` | Comum | 1 arquivo |
| `SecaoForm` | componente | `src/components/cadastro.tsx:500` | Comum | 15 arquivos |
| `sede_ponto_venda` | trigger | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:245` | Vendas, PDV, estoque, produtos e ração | — |
| `Segmentado` | componente | `src/components/campo/pecas.tsx:221` | Produção | 5 arquivos |
| `Segmentos` | componente | `src/components/ui.tsx:244` | Comum | 12 arquivos |
| `segundoFatorPendente` | função | `src/lib/mfa.ts:15` | Login, segurança, usuários e permissões | 2 arquivos |
| `Selecao` | componente | `src/components/campo/pecas.tsx:146` | Produção | 4 arquivos |
| `Selecao` | componente | `src/components/ui.tsx:75` | Comum | 53 arquivos |
| `SelecaoComNovo` | componente | `src/components/selecao-com-novo.tsx:13` | Produção | 4 arquivos |
| `SeletorEmpresa` | componente | `src/components/seletor-empresa.tsx:17` | Início, painel, ajuda e configurações | 1 arquivo |
| `SeletorTema` | componente | `src/components/tema.tsx:65` | Comum | 3 arquivos |
| `SeletorVersao` | componente | `src/components/versao.tsx:29` | Início, painel, ajuda e configurações | 2 arquivos |
| `SEM_ACESSO` | constante | `src/lib/permissoes-regras.ts:8` | Login, segurança, usuários e permissões | 2 arquivos |
| `semAcento` | função | `src/lib/formato.ts:58` | Comum | 9 arquivos |
| `Semana` | tipo | `src/lib/planejamento.ts:486` | Planejamento, previsões, custo do kg e relatórios | — |
| `semanaCultivo` | função | `src/lib/crescimento.ts:60` | Produção | 3 arquivos |
| `SemanaFluxo` | tipo | `src/lib/fluxo.ts:5` | Financeiro | 2 arquivos |
| `SemanaIndicadores` | tipo | `src/lib/zootecnico.ts:162` | Produção | — |
| `SemanaLote` | tipo | `src/lib/zootecnico.ts:12` | Produção | 7 arquivos |
| `SEMANAS_MORTALIDADE` | constante | `src/lib/previsao.ts:37` | Planejamento, previsões, custo do kg e relatórios | — |
| `SEMANAS_PROJECAO` | constante | `src/lib/previsao-dados.ts:19` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `semanasFluxo` | função | `src/lib/fluxo.ts:14` | Financeiro | 4 arquivos |
| `semanasPorIndicador` | função | `src/lib/zootecnico.ts:164` | Produção | 2 arquivos |
| `semEscopo` | função | `src/lib/api/servidor.ts:36` | API pública, webhooks e rotinas agendadas | 14 arquivos |
| `SemManejo` | componente | `src/app/(app)/planejamento/linha-do-tempo.tsx:20` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `Sentido` | tipo | `src/lib/importacao.ts:6` | Importação | 1 arquivo |
| `Serie` | tipo | `src/components/graficos.tsx:10` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `serieIndicador` | função | `src/lib/zootecnico.ts:134` | Produção | 1 arquivo |
| `SerieSlide` | tipo | `src/lib/apresentacao.ts:18` | Planejamento, previsões, custo do kg e relatórios | — |
| `SESSAO_DONO` | constante | `e2e/apoio.ts:66` | Comum | 14 arquivos |
| `SessaoApp` | tipo | `src/lib/app-celular/sessao.ts:19` | Comum | 1 arquivo |
| `sessaoDoApp` | função | `src/lib/app-celular/sessao.ts:26` | Comum | 10 arquivos |
| `sessoes_2fa` | tabela | `supabase/migrations/20261028034500_mfa_obrigatorio.sql:20` | Login, segurança, usuários e permissões | 1 arquivo |
| `Setor` | tipo | `src/app/(app)/piscicultura/lista.tsx:11` | Produção | 1 arquivo |
| `setor_cc` | trigger | `supabase/migrations/20261026000003_producao_e_titulos.sql:32` | Produção | — |
| `setor_cc_nome` | trigger | `supabase/migrations/20261027010000_cadastros.sql:155` | Produção | — |
| `setor_cc_sai` | trigger | `supabase/migrations/20261027010000_cadastros.sql:169` | Produção | — |
| `setores` | tabela | `supabase/migrations/20261026000001_schema.sql:582` | Produção | 3 arquivos |
| `SimuladorCiclo` | componente | `src/app/(app)/lotes/[id]/simulador.tsx:11` | Produção | 1 arquivo |
| `Sinal` | tipo | `src/lib/previsao.ts:105` | Planejamento, previsões, custo do kg e relatórios | — |
| `sinalExtrato` | função | `src/lib/importacao-nibo.ts:95` | Importação | — |
| `sinalPct` | função | `src/lib/analise-periodo.ts:272` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `sinalPontos` | função | `src/lib/analise-periodo.ts:274` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `sincronizador` | função | `src/lib/sync/navegador.ts:21` | Comum | — |
| `Sincronizador` | tipo | `src/lib/sync/worker.ts:84` | Comum | 1 arquivo |
| `sincronizar_importacao` | função SQL | `supabase/migrations/20261029020000_nibo_sincronizar.sql:16` | Importação | 1 arquivo |
| `sincronizarAgora` | ação | `src/app/(app)/conciliacao/open-finance-actions.ts:97` | Financeiro | 2 arquivos |
| `sincronizarConexao` | função | `src/lib/open-finance.ts:104` | Financeiro | 3 arquivos |
| `sincronizarGruposAbertos` | função | `src/lib/menu.ts:74` | Comum | 2 arquivos |
| `SISTEMAS_VIVEIRO` | constante | `src/lib/rotulos.ts:34` | Comum | 2 arquivos |
| `SistemaViveiro` | tipo | `src/lib/importacao.ts:25` | Importação | 1 arquivo |
| `situacao` | função | `src/lib/assinatura-mapa.ts:82` | Cobrança | 3 arquivos |
| `Situacao` | tipo | `src/lib/racao-estoque.ts:8` | Vendas, PDV, estoque, produtos e ração | — |
| `SITUACAO_CONTA` | constante | `src/lib/asaas-mapa.ts:145` | Cobrança | 1 arquivo |
| `SituacaoAssistente` | tipo | `src/lib/assistente.ts:5` | Início, painel, ajuda e configurações | 3 arquivos |
| `SituacaoConta` | tipo | `src/lib/asaas-mapa.ts:143` | Cobrança | 2 arquivos |
| `situacaoDoEvento` | função | `src/lib/asaas-mapa.ts:168` | Cobrança | 2 arquivos |
| `situacaoOllama` | função | `src/lib/ai/offline-chat.ts:110` | Comum | 2 arquivos |
| `situacaoRenovacao` | função | `src/lib/planejamento.ts:320` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `situacaoValidade` | função | `src/lib/racao-estoque.ts:11` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `Slide` | tipo | `src/lib/apresentacao.ts:19` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `somarDias` | função | `src/lib/formato.ts:38` | Comum | 25 arquivos |
| `somarMeses` | função | `src/lib/planejamento.ts:119` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `somarResultados` | função | `src/lib/importacao.ts:77` | Importação | 1 arquivo |
| `sondas` | tabela | `supabase/migrations/20261106000001_sondas_iot.sql:8` | Comum | 1 arquivo |
| `STATUS_COBRANCA` | constante | `src/lib/cobranca.ts:7` | Cobrança | 2 arquivos |
| `STATUS_PEDIDO` | constante | `src/lib/vendas.ts:12` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `STATUS_TRANSFERENCIA` | constante | `src/lib/pontos.ts:11` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `StatusConexao` | tipo | `src/lib/open-finance-mapa.ts:83` | Financeiro | — |
| `statusDoItem` | função | `src/lib/open-finance-mapa.ts:85` | Financeiro | 3 arquivos |
| `Subtitulo` | componente | `src/components/campo/pecas.tsx:198` | Produção | 4 arquivos |
| `SUBTOTAIS_DRE` | constante | `src/lib/relatorios.ts:52` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `subtotal` | função | `src/lib/relatorios.ts:57` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `sucesso` | função | `src/lib/acao.ts:8` | Comum | 43 arquivos |
| `sugerirApontamentos` | função | `src/lib/sugestao-apontamento.ts:29` | Produção | 2 arquivos |
| `sugerirPelaMeta` | função | `src/lib/planejamento.ts:418` | Planejamento, previsões, custo do kg e relatórios | 2 arquivos |
| `Sugestao` | tipo | `src/lib/sugestao-apontamento.ts:14` | Produção | 1 arquivo |
| `SugestaoMeta` | tipo | `src/lib/planejamento.ts:405` | Planejamento, previsões, custo do kg e relatórios | — |
| `Sugestoes` | tipo | `src/lib/sugestao-apontamento.ts:15` | Produção | 3 arquivos |
| `sugestoes_conciliacao` | função SQL | `supabase/migrations/20261026000005_conciliacao_relatorios.sql:47` | Financeiro | — |
| `sugestoes_dispensadas` | tabela | `supabase/migrations/20261101110000_automacoes_financeiro.sql:12` | Comum | 1 arquivo |
| `SugestoesMultipla` | componente | `src/app/(app)/conciliacao/multipla.tsx:20` | Financeiro | 1 arquivo |
| `supabaseEnv` | função | `src/lib/env.ts:1` | Comum | 8 arquivos |
| `Tabela` | tipo | `src/app/(app)/tabelas-de-preco/lista.tsx:12` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `Tabela` | componente | `src/components/ui.tsx:165` | Comum | 27 arquivos |
| `TABELA_ARRACOAMENTO` | constante | `src/lib/campo/conhecimento-tambaqui.ts:28` | Produção | 1 arquivo |
| `tabela_arracoamento` | tabela | `supabase/migrations/20261105000001_piscicultura_estrutura.sql:178` | Comum | 2 arquivos |
| `tabelas_preco` | tabela | `supabase/migrations/20261026000001_schema.sql:870` | Vendas, PDV, estoque, produtos e ração | 4 arquivos |
| `TAG_SYNC` | constante | `src/lib/sync/worker.ts:10` | Comum | 1 arquivo |
| `TAMANHO_MAXIMO` | constante | `src/lib/ia.ts:14` | Comum | 3 arquivos |
| `Tanque` | tipo | `src/lib/campo/tipos.ts:45` | Produção | 8 arquivos |
| `Tarefa` | tipo | `src/lib/sync/worker.ts:12` | Comum | — |
| `taxaDoPeso` | função | `src/lib/previsao-racao.ts:63` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `taxaNaCurva` | função | `src/lib/previsao.ts:49` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `taxaSemana` | função | `src/lib/zootecnico.ts:55` | Produção | 2 arquivos |
| `Tela` | tipo | `src/lib/menu.ts:82` | Comum | — |
| `TelaAcesso` | componente | `src/components/tela-acesso.tsx:8` | Comum | 8 arquivos |
| `telaDeToque` | função | `src/components/area-visivel.ts:53` | Comum | 1 arquivo |
| `telasVistas` | função | `src/lib/tutoriais-dados.ts:6` | Início, painel, ajuda e configurações | 2 arquivos |
| `Tema` | tipo | `src/components/tema.tsx:10` | Comum | — |
| `temPermissao` | função | `src/lib/permissoes-regras.ts:78` | Login, segurança, usuários e permissões | 6 arquivos |
| `test` | constante | `e2e/apoio.ts:7` | Comum | 15 arquivos |
| `textoBaseConhecimento` | função | `src/lib/campo/conhecimento-tambaqui.ts:165` | Produção | 3 arquivos |
| `textoDadosPiscicultura` | função | `src/lib/campo/contexto-chat.ts:35` | Produção | 3 arquivos |
| `textoFaltam` | função | `src/lib/assistente.ts:63` | Início, painel, ajuda e configurações | 3 arquivos |
| `textoKg` | função | `src/lib/pescado.ts:19` | Comum | 26 arquivos |
| `textoLembrete` | função | `src/lib/lembretes.ts:7` | Comum | 2 arquivos |
| `textoLembreteCobranca` | função | `src/lib/regua-cobranca.ts:23` | Cobrança | 2 arquivos |
| `textoListaCompra` | função | `src/lib/abastecimento.ts:26` | Comum | 2 arquivos |
| `textoPacoteContador` | função | `src/lib/lembretes.ts:44` | Comum | 2 arquivos |
| `textoPdf` | função | `src/lib/apresentacao-pdf.ts:12` | Planejamento, previsões, custo do kg e relatórios | 1 arquivo |
| `textoPeso` | função | `src/lib/pescado.ts:25` | Comum | 11 arquivos |
| `textoPlanoRacao` | função | `src/lib/campo/contexto-chat.ts:80` | Produção | — |
| `textoQuantidade` | função | `src/lib/pescado.ts:60` | Comum | 4 arquivos |
| `textoResumo` | função | `src/lib/lembretes.ts:25` | Comum | 2 arquivos |
| `textoSacos` | função | `src/lib/racao-estoque.ts:20` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `tipoAceito` | função | `src/lib/documento-recebido.ts:10` | Comum | 2 arquivos |
| `TipoArquivo` | tipo | `src/lib/ia.ts:13` | Comum | 1 arquivo |
| `TipoColuna` | tipo | `src/lib/planilha.ts:72` | Comum | — |
| `TipoConta` | tipo | `src/lib/importacao.ts:8` | Importação | 1 arquivo |
| `tipoContaDe` | função | `src/lib/open-finance-mapa.ts:59` | Financeiro | 2 arquivos |
| `tipoContaPeloNome` | função | `src/lib/importacao.ts:133` | Importação | 2 arquivos |
| `TipoContato` | tipo | `src/lib/importacao.ts:9` | Importação | 3 arquivos |
| `TipoEnvio` | tipo | `src/lib/campo/fila.ts:7` | Produção | 1 arquivo |
| `TipoInsumo` | tipo | `src/lib/campo/validar.ts:158` | Produção | 3 arquivos |
| `TipoLinhaDre` | tipo | `src/lib/relatorios.ts:115` | Planejamento, previsões, custo do kg e relatórios | — |
| `TipoModelo` | tipo | `src/lib/importacao-modelo.ts:12` | Importação | 3 arquivos |
| `TipoProduto` | tipo | `src/lib/importacao.ts:20` | Importação | 1 arquivo |
| `TipoRapido` | tipo | `src/app/(app)/_cadastro-rapido/actions.ts:11` | Comum | 1 arquivo |
| `TIPOS_ARQUIVO` | constante | `src/lib/ia.ts:12` | Comum | 1 arquivo |
| `TIPOS_CONTA` | constante | `src/app/(app)/contas/lista.tsx:10` | Financeiro | — |
| `TIPOS_DEPOSITO` | constante | `src/lib/estoque.ts:11` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `TIPOS_EMPRESA_ASAAS` | constante | `src/lib/asaas-mapa.ts:152` | Cobrança | 1 arquivo |
| `TIPOS_EVENTO` | constante | `src/lib/rotulos.ts:7` | Comum | 2 arquivos |
| `TIPOS_INSUMO` | constante | `src/lib/campo/validar.ts:150` | Produção | 3 arquivos |
| `TIPOS_MEDICAMENTO` | constante | `src/lib/rotulos.ts:13` | Comum | 4 arquivos |
| `TIPOS_PONTO` | constante | `src/lib/pontos.ts:3` | Vendas, PDV, estoque, produtos e ração | 4 arquivos |
| `TIPOS_PRODUTO` | constante | `src/lib/estoque.ts:2` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `TIPOS_PRODUTO_TODOS` | constante | `src/lib/estoque.ts:19` | Vendas, PDV, estoque, produtos e ração | 6 arquivos |
| `TIPOS_REGRA` | constante | `src/lib/regras.ts:2` | Financeiro | 2 arquivos |
| `TipoSinal` | tipo | `src/lib/previsao.ts:104` | Planejamento, previsões, custo do kg e relatórios | — |
| `TipoTitulo` | tipo | `src/lib/titulos.ts:2` | Financeiro | 2 arquivos |
| `Titulo` | componente | `src/components/ui.tsx:215` | Comum | 70 arquivos |
| `titulo_autor_fixo` | trigger | `supabase/migrations/20261029224500_titulos_por_modulo.sql:60` | Financeiro | — |
| `titulo_tem_rateio` | trigger | `supabase/migrations/20261026000001_schema.sql:283` | Financeiro | — |
| `TituloApi` | tipo | `src/lib/api/regras.ts:132` | API pública, webhooks e rotinas agendadas | — |
| `TituloImportado` | tipo | `src/lib/importacao.ts:37` | Importação | 2 arquivos |
| `TituloPlanilha` | tipo | `src/lib/planilha.ts:180` | Comum | 1 arquivo |
| `titulos` | view | `supabase/migrations/20261028190000_acoes_titulos.sql:190` | Financeiro | 9 arquivos |
| `tokenConfere` | função | `src/lib/asaas-mapa.ts:129` | Cobrança | 9 arquivos |
| `tokenConfereHash` | função | `src/lib/cripto.ts:30` | Login, segurança, usuários e permissões | 2 arquivos |
| `tokenDoCabecalho` | função | `src/lib/app-celular/token.ts:2` | Comum | 2 arquivos |
| `tokenFocus` | função | `src/lib/focus.ts:17` | Fiscal | — |
| `TOLERANCIA` | constante | `src/lib/sugestao-apontamento.ts:19` | Produção | — |
| `Tom` | tipo | `src/lib/analise-periodo.ts:260` | Planejamento, previsões, custo do kg e relatórios | — |
| `TOM_STATUS_PEDIDO` | constante | `src/lib/vendas.ts:17` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `TomEtiqueta` | tipo | `src/components/ui.tsx:148` | Comum | 9 arquivos |
| `TomSlide` | tipo | `src/lib/apresentacao.ts:16` | Planejamento, previsões, custo do kg e relatórios | — |
| `TopicoManejo` | tipo | `src/lib/campo/conhecimento-tambaqui.ts:17` | Produção | — |
| `TOPICOS_MANEJO` | constante | `src/lib/campo/conhecimento-tambaqui.ts:45` | Produção | — |
| `totaisGrupos` | função | `src/lib/biometria-grupos.ts:9` | Comum | 4 arquivos |
| `totalizar_lancamento` | trigger | `supabase/migrations/20261027123000_apontamento_por_turno.sql:167` | Produção | — |
| `TOUR_GERAL` | constante | `src/lib/tutoriais.ts:34` | Início, painel, ajuda e configurações | 2 arquivos |
| `TransacaoPluggy` | tipo | `src/lib/open-finance-mapa.ts:5` | Financeiro | 2 arquivos |
| `Transferencia` | tipo | `src/app/(app)/lotes/[id]/viveiros.tsx:12` | Produção | 1 arquivo |
| `transferencia_peixe_itens` | tabela | `supabase/migrations/20261029173000_pontos_de_venda.sql:331` | Vendas, PDV, estoque, produtos e ração | — |
| `transferencia_periodo` | trigger | `supabase/migrations/20261026000001_schema.sql:370` | Vendas, PDV, estoque, produtos e ração | — |
| `TransferenciaImportada` | tipo | `src/lib/importacao.ts:42` | Importação | 2 arquivos |
| `transferencias` | tabela | `supabase/migrations/20261026000001_schema.sql:354` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `transferencias_peixe` | tabela | `supabase/migrations/20261029173000_pontos_de_venda.sql:304` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `transferir` | ação | `src/app/(app)/contas/actions.ts:74` | Financeiro | 1 arquivo |
| `transferir_lote` | função SQL | `supabase/migrations/20261105000001_piscicultura_estrutura.sql:470` | Produção | 1 arquivo |
| `transferir_peixe` | função SQL | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:1081` | Comum | 1 arquivo |
| `transferirLote` | ação | `src/app/(app)/lotes/actions.ts:273` | Produção | 1 arquivo |
| `transferirPeixe` | ação | `src/app/(app)/pontos-de-venda/actions.ts:100` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `trocarEmpresa` | ação | `src/app/(app)/actions.ts:7` | Comum | 2 arquivos |
| `trocarSenhaInicial` | ação | `src/app/auth/primeiro-acesso/actions.ts:13` | Login, segurança, usuários e permissões | 1 arquivo |
| `Turno` | tipo | `src/lib/campo/propostas.ts:11` | Produção | 4 arquivos |
| `turnoAgora` | função | `src/lib/rotulos.ts:23` | Comum | 2 arquivos |
| `TURNOS` | constante | `src/lib/rotulos.ts:20` | Comum | 8 arquivos |
| `TUTORIAIS` | constante | `src/lib/tutoriais.ts:83` | Início, painel, ajuda e configurações | 1 arquivo |
| `TUTORIAIS_DESLIGADOS` | constante | `src/lib/tutoriais.ts:752` | Início, painel, ajuda e configurações | 1 arquivo |
| `tutoriais_vistos` | tabela | `supabase/migrations/20261029233000_tutoriais.sql:8` | Início, painel, ajuda e configurações | 2 arquivos |
| `Tutorial` | componente | `src/components/tutorial.tsx:87` | Início, painel, ajuda e configurações | 2 arquivos |
| `Tutorial` | tipo | `src/lib/tutoriais.ts:18` | Início, painel, ajuda e configurações | 1 arquivo |
| `tutorialAutomatico` | ação | `src/lib/tutoriais-acoes.ts:25` | Início, painel, ajuda e configurações | 1 arquivo |
| `tutorialDaTela` | função | `src/lib/tutoriais.ts:711` | Início, painel, ajuda e configurações | 2 arquivos |
| `ultimas_leituras` | view | `supabase/migrations/20261106000001_sondas_iot.sql:55` | Comum | 1 arquivo |
| `UltimoPedido` | tipo | `src/lib/vendas-dados.ts:11` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `ultimosMeses` | função | `src/lib/relatorios.ts:14` | Planejamento, previsões, custo do kg e relatórios | 4 arquivos |
| `Unidade` | tipo | `src/components/graficos.tsx:21` | Planejamento, previsões, custo do kg e relatórios | — |
| `UNIDADES` | constante | `src/lib/estoque.ts:22` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `UNIDADES_DOSE` | constante | `src/lib/rotulos.ts:18` | Comum | 4 arquivos |
| `unidadeSaldo` | função | `src/lib/estoque.ts:41` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `UNIFORMIDADE_BAIXA` | constante | `src/lib/zootecnico.ts:225` | Produção | 1 arquivo |
| `updateSession` | função | `src/lib/supabase/proxy.ts:10` | Login, segurança, usuários e permissões | 1 arquivo |
| `urlBase` | função | `src/lib/asaas-mapa.ts:18` | Cobrança | 2 arquivos |
| `urlFocus` | função | `src/lib/focus-mapa.ts:4` | Fiscal | 2 arquivos |
| `usandoIndexedDB` | função | `src/lib/db/indexeddb.ts:169` | Comum | 1 arquivo |
| `usarDispositivoConfiavel` | função | `src/lib/mfa.ts:84` | Login, segurança, usuários e permissões | 1 arquivo |
| `useAreaVisivel` | hook | `src/components/area-visivel.ts:10` | Comum | 4 arquivos |
| `useArmazemPronto` | hook | `src/lib/db/use-armazem.ts:14` | Comum | — |
| `useAvisoCurto` | hook | `src/components/cadastro.tsx:339` | Comum | 1 arquivo |
| `useCampo` | hook | `src/components/campo/contexto.tsx:49` | Produção | 11 arquivos |
| `useDoisToques` | hook | `src/components/campo/pecas.tsx:128` | Produção | 3 arquivos |
| `useFecharPainel` | hook | `src/components/cadastro.tsx:21` | Comum | 1 arquivo |
| `useFilaCampo` | hook | `src/components/campo/fila-cliente.ts:38` | Produção | 1 arquivo |
| `useGravarItem` | hook | `src/lib/db/use-armazem.ts:18` | Comum | — |
| `useItemArmazenado` | hook | `src/lib/db/use-armazem.ts:9` | Comum | 3 arquivos |
| `useOnline` | hook | `src/lib/online.ts:6` | Início, painel, ajuda e configurações | 4 arquivos |
| `usePreferencia` | hook | `src/components/campo/fila-cliente.ts:137` | Produção | 2 arquivos |
| `useServiceWorker` | hook | `src/components/offline.tsx:31` | Comum | 2 arquivos |
| `useTarefaSync` | hook | `src/lib/sync/navegador.ts:38` | Comum | 2 arquivos |
| `UsoEntrada` | tipo | `src/lib/previsao-racao.ts:393` | Vendas, PDV, estoque, produtos e ração | — |
| `Usuario` | tipo | `e2e/apoio.ts:68` | Comum | — |
| `Usuario` | tipo | `src/lib/auth.ts:6` | Login, segurança, usuários e permissões | — |
| `USUARIOS` | constante | `src/lib/menu.ts:19` | Comum | — |
| `usuarios_empresa` | tabela | `supabase/migrations/20261026000001_schema.sql:31` | Login, segurança, usuários e permissões | 3 arquivos |
| `uuidValido` | função | `src/lib/api/regras.ts:105` | API pública, webhooks e rotinas agendadas | 8 arquivos |
| `validarAbrirLote` | função | `src/lib/campo/validar.ts:99` | Produção | 3 arquivos |
| `validarAgua` | função | `src/lib/agua.ts:28` | Comum | 3 arquivos |
| `validarApontamentoCampo` | função | `src/lib/apontamento-campo.ts:81` | Produção | 2 arquivos |
| `validarBaixa` | função | `src/lib/api/regras.ts:200` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `validarBiometriaCampo` | função | `src/lib/campo/validar.ts:55` | Produção | 3 arquivos |
| `validarCausas` | função | `src/lib/causas-morte.ts:19` | Produção | 2 arquivos |
| `validarContato` | função | `src/lib/api/regras.ts:223` | API pública, webhooks e rotinas agendadas | 3 arquivos |
| `validarConversa` | função | `src/lib/campo/contexto-chat.ts:14` | Produção | 3 arquivos |
| `validarFecharLote` | função | `src/lib/campo/validar.ts:129` | Produção | 3 arquivos |
| `validarGrupos` | função | `src/lib/biometria-grupos.ts:17` | Comum | 3 arquivos |
| `validarInsumoCampo` | função | `src/lib/campo/validar.ts:167` | Produção | 3 arquivos |
| `validarMedicacao` | função | `src/lib/apontamento-campo.ts:37` | Produção | 2 arquivos |
| `validarPedidoCampo` | função | `src/lib/pedido-campo.ts:25` | Produção | 2 arquivos |
| `validarProduto` | função | `src/lib/api/regras.ts:268` | API pública, webhooks e rotinas agendadas | 3 arquivos |
| `validarTitulo` | função | `src/lib/api/regras.ts:146` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `validarUrlWebhook` | função | `src/lib/api/regras.ts:337` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `validarVendaBalcao` | função | `src/lib/pdv.ts:24` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `Valor` | tipo | `src/lib/previsao-racao.ts:17` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `valorCargo` | função | `src/components/permissoes-cargos.tsx:25` | Login, segurança, usuários e permissões | 1 arquivo |
| `variacao` | função | `src/lib/analise-periodo.ts:77` | Planejamento, previsões, custo do kg e relatórios | 3 arquivos |
| `Vazio` | componente | `src/components/ui.tsx:206` | Comum | 9 arquivos |
| `vazioDoViveiro` | função | `src/lib/planejamento.ts:131` | Planejamento, previsões, custo do kg e relatórios | — |
| `vencimentoDoFator` | função | `src/lib/boleto.ts:51` | Comum | 1 arquivo |
| `venda_balcao` | função SQL | `supabase/migrations/20261029173000_pontos_de_venda.sql:654` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `VendaBalcao` | tipo | `src/lib/pdv.ts:8` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `Vendas` | tipo | `src/lib/analise-periodo.ts:259` | Planejamento, previsões, custo do kg e relatórios | — |
| `vendas_itens` | view | `supabase/migrations/20261105000003_piscicultura_despesca_estoque.sql:375` | Vendas, PDV, estoque, produtos e ração | 2 arquivos |
| `venderNoBalcao` | ação | `src/app/(app)/vendas/actions.ts:173` | Vendas, PDV, estoque, produtos e ração | 1 arquivo |
| `vendidoPorKg` | função | `src/lib/pescado.ts:55` | Comum | 4 arquivos |
| `VerificacaoDuasEtapas` | componente | `src/app/(app)/seguranca/mfa.tsx:23` | Login, segurança, usuários e permissões | 1 arquivo |
| `VERSAO_TERMOS` | constante | `src/lib/termos.ts:4` | Login, segurança, usuários e permissões | 4 arquivos |
| `VIAS_MEDICAMENTO` | constante | `src/lib/rotulos.ts:15` | Comum | 3 arquivos |
| `viewport` | constante | `src/app/campo/page.tsx:27` | Produção | — |
| `vigenteEm` | função | `src/lib/vendas.ts:97` | Vendas, PDV, estoque, produtos e ração | 3 arquivos |
| `Viveiro` | tipo | `src/app/(app)/piscicultura/lista.tsx:12` | Produção | 1 arquivo |
| `Viveiro` | tipo | `src/lib/planejamento.ts:62` | Planejamento, previsões, custo do kg e relatórios | 4 arquivos |
| `viveiro_cc` | trigger | `supabase/migrations/20261026000003_producao_e_titulos.sql:33` | Comum | — |
| `viveiro_cc_nome` | trigger | `supabase/migrations/20261027010000_cadastros.sql:156` | Comum | — |
| `viveiro_cc_sai` | trigger | `supabase/migrations/20261027010000_cadastros.sql:170` | Comum | — |
| `ViveiroApontamento` | tipo | `src/app/(app)/apontamentos/campos-lancamento.tsx:15` | Produção | — |
| `ViveiroFala` | tipo | `src/lib/fala-apontamento.ts:9` | Produção | 1 arquivo |
| `ViveiroFaltando` | tipo | `src/lib/lembretes.ts:5` | Comum | 1 arquivo |
| `ViveiroImportado` | tipo | `src/lib/importacao.ts:26` | Importação | — |
| `ViveiroOpcao` | tipo | `src/components/opcoes-viveiro.tsx:4` | Comum | 2 arquivos |
| `viveiros` | tabela | `supabase/migrations/20261026000001_schema.sql:594` | Comum | 10 arquivos |
| `ViveirosCampo` | componente | `src/components/campo/viveiros-campo.tsx:73` | Produção | 1 arquivo |
| `ViveirosDoLote` | componente | `src/app/(app)/lotes/[id]/viveiros.tsx:97` | Produção | 1 arquivo |
| `webhook_eventos` | tabela | `supabase/migrations/20261026000001_schema.sql:501` | API pública, webhooks e rotinas agendadas | 2 arquivos |
| `webhookPedeSincronizar` | função | `src/lib/open-finance-mapa.ts:78` | Financeiro | 2 arquivos |
| `whatsapp_avisos` | função SQL | `supabase/migrations/20261101200000_whatsapp.sql:66` | Comum | 1 arquivo |
| `whatsapp_avisos_por_numero` | função SQL | `supabase/migrations/20261101200000_whatsapp.sql:101` | Comum | 1 arquivo |
| `whatsapp_cobrancas` | tabela | `supabase/migrations/20261101200000_whatsapp.sql:124` | Cobrança | — |
| `whatsapp_confirmar` | função SQL | `supabase/migrations/20261101200000_whatsapp.sql:73` | Comum | 1 arquivo |
| `whatsapp_destinos` | função SQL | `supabase/migrations/20261101200000_whatsapp.sql:110` | Comum | 1 arquivo |
| `whatsapp_mensagens` | tabela | `supabase/migrations/20261101200000_whatsapp.sql:177` | Comum | 2 arquivos |
| `whatsapp_pedir_codigo` | função SQL | `supabase/migrations/20261101200000_whatsapp.sql:46` | Comum | 1 arquivo |
| `whatsapp_remetente` | função SQL | `supabase/migrations/20261101200000_whatsapp.sql:90` | Comum | 1 arquivo |
| `whatsapp_vinculos` | tabela | `supabase/migrations/20261101200000_whatsapp.sql:21` | Comum | 2 arquivos |
| `whatsappConfigurado` | função | `src/lib/whatsapp.ts:18` | Comum | 4 arquivos |
| `WhatsAppPessoal` | componente | `src/components/whatsapp-pessoal.tsx:11` | Comum | 2 arquivos |
| `xmlNfeRecebida` | função | `src/lib/focus.ts:95` | Fiscal | 1 arquivo |
| `zerar_financeiro` | função SQL | `supabase/migrations/20261102000000_zerar_sistema.sql:44` | Financeiro | 1 arquivo |
| `zerar_sistema` | função SQL | `supabase/migrations/20261103120000_remover_manutencao.sql:38` | Financeiro | 1 arquivo |
| `zerarAppLoginLocal` | ação | `src/app/(app)/configuracoes/usuarios/actions.ts:128` | Login, segurança, usuários e permissões | 1 arquivo |
| `zerarFinanceiro` | ação | `src/app/(app)/configuracoes/zerar-financeiro/actions.ts:10` | Financeiro | 1 arquivo |
| `zerarSistema` | ação | `src/app/(app)/configuracoes/zerar-sistema/actions.ts:10` | Financeiro | 1 arquivo |
| `zz_categoria_no_fim` | trigger | `supabase/migrations/20261101153000_ordem_categorias_centros.sql:47` | Financeiro | — |
| `zz_centro_custo_no_fim` | trigger | `supabase/migrations/20261101153000_ordem_categorias_centros.sql:63` | Financeiro | — |
