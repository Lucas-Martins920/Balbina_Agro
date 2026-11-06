# Banco de dados

Postgres no Supabase. Todo o schema nasce das migrations em `supabase/migrations/` (101 arquivos em 2026-11-02), aplicadas em ordem. A referência completa (cada função, tabela, view, trigger e policy, com o arquivo e a linha) está em [`docs/mapa-codigo/banco.md`](../mapa-codigo/banco.md). Este texto explica as ideias.

## Esquemas

| Esquema | O que tem |
|---|---|
| `public` | Tabelas de dados, views e as funções que o app chama por `.rpc()` |
| `app` | Funções internas: checagem de acesso, triggers, helpers (`app.hoje`, `app.pode`, `app.fator_unidade`...). O app não chama essas funções diretamente. A tabela `app.parametros` guarda as chaves globais (ex.: `exigir_2fa`). |
| `auth` | Do Supabase Auth (usuários e sessões) |
| `cron`, `vault` | `pg_cron` (rotinas agendadas) e segredos (`balbina_url`, `cron_secret`) |

## Convenções do schema

- Chave `uuid` (`gen_random_uuid()`), datas `timestamptz` em UTC, dia de negócio em `date` no fuso da empresa.
- Dinheiro em `bigint` com sufixo `_cents`. Quantidades em `numeric`.
- `empresa_id not null` em toda tabela de dados, com índice.
- Views com `security_invoker`, para respeitarem o RLS de quem consulta.
- Mensagens de erro (`raise exception`) em português, escritas para o usuário final. Elas chegam à tela.

## Segurança em linhas (RLS)

Todas as tabelas de `public` têm RLS. O desenho é o mesmo em todas:

| Policy | Tipo | Regra |
|---|---|---|
| `membros` | permissiva | `empresa_id in (select app.minhas_empresas())`: só empresas de que o usuário é membro ativo, com assinatura liberada e MFA em dia |
| `escrita_inserir` / `escrita_alterar` / `escrita_apagar` | restritiva | `app.pode(empresa_id, '<modulo>.<acao>')` |
| `sem_inserir` / `sem_apagar` | restritiva | `false`: tabela que só funções `security definer` gravam (ex.: auditoria, documentos recebidos) |

Funções-chave de acesso (schema `app`):

| Função | Para quê |
|---|---|
| `minhas_empresas()` | Empresas visíveis ao usuário |
| `pode(empresa, chave)` | Permissão `modulo.acao` = perfil/cargo + plano + assinatura + MFA |
| `plano_inclui(empresa, modulo)` | Se o plano da empresa tem o módulo (`niveis_plano`) |
| `e_master(empresa)`, `exige_master(...)` | Ações só do master |
| `mfa_em_dia()`, `sessao_com_senha()` | 2º fator da sessão (`sessoes_2fa`, dispositivos confiáveis por 14 dias) |
| `empresa_liberada(empresa)`, `assinatura_libera(...)` | Assinatura do Balbina paga ou em teste |
| `travar_referencias()` | Cria triggers que impedem uma FK de apontar para registro de **outra empresa**. Toda migration que cria tabela termina chamando essa função. |

## Regras que vivem no banco

Alguns exemplos do que **não** depende da tela:

- **Títulos**: o rateio precisa somar o valor do título (`app.checa_rateio`, trigger diferido até o commit). `pago_cents` e `status` são recalculados a cada baixa (`app.atualiza_saldo_agendamento`). Mês fechado bloqueia baixas e transferências naquele mês (`app.bloqueia_periodo_fechado`, `fechar_mes`).
- **Produção**: um viveiro não recebe dois lotes no mesmo período (exclusion constraint com `daterange` em `lote_alocacoes`). O dia do lote é a soma dos lançamentos dos turnos (`app.totalizar_apontamento`). Mortes e descartes não passam dos peixes do viveiro. Lançar de novo no mesmo turno pede `p_forcar`, e um `client_id` repetido não duplica um lançamento offline. O peso entre duas biometrias vem da curva da espécie (`app.peso_estimado`), e a ração sugerida da tabela de arraçoamento (`racao_sugerida`, que suspende com oxigênio abaixo do mínimo).
- **Estoque de pescado**: a despesca (`registrar_despesca`) dá entrada dos kg por classe no produto base de cada classe; o que não foi separado entra como "Inteiro". A carência de um medicamento trava a despesca do lote (`app.carencia_ate`). Só a última despesca do lote pode ser desfeita, e só enquanto o peixe não foi vendido (`desfazer_despesca`). Saldo negativo é recusado e o estoque é travado contra corrida (`app.travar_estoque`, `app.conferir_saldo_peixe`).
- **Custo**: entrada de insumo recalcula o custo médio ponderado (`app.atualizar_custo_medio`). Setor, viveiro e lote criam e renomeiam o próprio centro de custo (`app.cc_automatico`, `app.cc_renomear`).
- **Vendas**: só produto marcado "para venda" ganha preço ou entra em pedido (`app.exige_produto_de_venda`). Faturar baixa as embalagens (`app.baixar_embalagens`). Cancelar exige cancelar a nota antes (`cancelar_pedido`).
- **Extrato**: movimento único por conta + FITID, então reimportar não duplica. `importar_extrato` também pula a linha que repete data + valor + descrição de outra importação da conta (banco que muda o FITID), contando repetições; o total pulado fica em `importacoes_extrato.linhas_repetidas`. Webhook único por provedor + id do evento.
- **Credenciais**: chaves do Asaas de cada piscicultura e do emitente na Focus ficam em tabelas `*_segredos` (cifradas com `BALBINA_CHAVE_CRIPTO`, sem acesso para `anon`/`authenticated`). `app.protege_credenciais` impede o usuário de trocar a credencial de um perfil de cobrança.

## Views principais

| View | Usada para |
|---|---|
| `titulos` | Contas a pagar/receber com situação (vencido, a vencer) no fuso da empresa |
| `fluxo_previsto`, `saldos_contas`, `movimentos_caixa`, `aging_titulos` | Fluxo de caixa, saldos e inadimplência |
| `resultado_competencia`, `resultado_caixa`, `orcado_realizado`, `categorias_custo` | DRE, orçamento e componentes do custo |
| `estoque_peixe`, `estoque_peixe_ponto`, `saldos_estoque`, `saldos_produtos`, `estoque_produtos` | Estoque de pescado em kg (por classe e ponto de venda) e de insumos |
| `alocacoes_atuais`, `indicadores_lote_dia`, `indicadores_lote_semana`, `mortalidade_causas`, `medicacoes`, `custo_kg_lote` | Peixes em cada viveiro, indicadores zootécnicos (biomassa, ganho por dia, conversão alimentar), carência e custo do kg por lote |
| `pedidos`, `vendas_itens`, `clientes_compras`, `margem_cliente_mes`, `caixa_pdv` | Comercial e PDV |
| `alertas` | Alertas do painel |

## Rotinas agendadas (`pg_cron`)

| Job | Quando | Faz |
|---|---|---|
| `balbina-automacoes` | a cada 15 min | Chama `/api/cron/automacoes` com `CRON_SECRET` (URL e segredo no Vault) |
| `balbina-webhooks-api` | a cada 5 min | Entrega a fila de webhooks da API pública |
| `balbina-recorrencias` | diário | `app.gerar_recorrencias_todas()`: cria os títulos futuros das recorrências |

## Histórico e auditoria

Toda tabela da empresa (com `empresa_id` ou pelo pai, ex.: `pedido_itens` por `pedido_id`) grava as alterações em `audit_log` pelo trigger `historico` (`app.registrar_alteracao`), ligado por `app.ligar_historico()`, exceto as listadas em `app.tabelas_sem_historico()`. A tela `/historico` mostra o log com os nomes de `src/lib/historico.ts`. Eventos de segurança (logins bloqueados, MFA, troca de master) ficam em `eventos_seguranca` e viram alarmes no painel do master.

## Mudar o banco

1. Crie a migration (modelo em [convencoes.md](convencoes.md#uma-migration)).
2. Escreva o teste em `supabase/tests/99_<assunto>.sql`.
3. Rode `npm run test:db`, que aplica todas as migrations num Postgres limpo e roda os testes.
4. No `npm run local`, `npm run local:zerar` recria o banco local com tudo.
5. A migration só chega à produção no merge do consolidado para o `master` (workflow `migracoes.yml`, depois da Verificação verde).
