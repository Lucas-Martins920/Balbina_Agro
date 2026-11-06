# Open Finance: alternativas ao Pluggy (estudo, 2026-11-02)

> Estudo feito no FINAVI, de onde o Balbina herdou o financeiro; vale igual para o Balbina (os preços dos planos são os do FINAVI na época).

Pedido do Nicolas: "Estudar outras opções de fazer integração open finance, Pluggy muito cara, visando a segurança". Este é um estudo para decidir. Nenhum código de produção foi mudado.

## Resumo

- O Pluggy cobra **a partir de R$ 2.500/mês** pelo produto de dados (preço publicado pela própria Pluggy em 2026-09). Com os planos do FINAVI entre R$ 149 e R$ 449, isso só se paga com dezenas de empresas no plano Gestão. Hoje não compensa.
- A opção **mais segura** é a que tira o intermediário do caminho: **extrato pela API do próprio banco** (o dado sai do banco direto para o sistema) ou o **OFX** que já existe. Não tem terceiro guardando os dados das empresas.
- Entre os agregadores, o mais barato encontrado é a **Tecnospeed PlugBank** (relatos de R$ 1.500 de adesão + R$ 540/mês), credenciada no Open Finance regulado (OAuth 2.0, FAPI, mTLS, sem senha do banco). Fica 4 a 5 vezes mais barata que o Pluggy.
- Participar direto do Open Finance Brasil **não é viável**: só instituição autorizada pelo Banco Central (instituição de pagamento, SCD etc.) pode ser receptora de dados.

**Recomendação:** não contratar o Pluggy pago. Curto prazo, deixar o **OFX como caminho principal** (custo zero, segurança máxima) e o Pluggy desligado (código fica, sem chaves). Em seguida, fazer **API direta com o banco que a maioria das granjas usa** (perguntar qual é). Quando houver clientes pagantes suficientes para a conta fechar (cerca de 4 a 6 granjas usando conciliação automática), contratar a **Tecnospeed** só com conectores do Open Finance regulado.

## Como o sistema usa hoje

- `src/lib/open-finance.ts` fala com `https://api.pluggy.ai` (auth com `PLUGGY_CLIENT_ID/SECRET`, connect token por empresa via `clientUserId`, `/accounts`, `/v2/transactions` com cursor).
- `src/app/api/webhooks/pluggy/route.ts` recebe o aviso de item atualizado; `src/app/api/cron/open-finance/route.ts` sincroniza.
- `src/lib/open-finance-mapa.ts` converte conta/transação do Pluggy para linha do extrato (testado em `open-finance-mapa.test.ts`).
- Banco: `conexoes_bancarias.provedor text check (provedor in ('pluggy'))` (migration `20261026210000_open_finance_conciliacao.sql`). A coluna já prevê outro provedor; trocar é ampliar o check e escrever outro adaptador.
- O que vem depois da importação (regras, conciliação, rateio, DRE, custo do kg) não depende do provedor. A troca fica contida em ~350 linhas (cliente da API, webhook, mapa e o botão "Conectar banco").
- Em 2026-10-27 só foi testado no sandbox (Pluggy Bank). Nenhum banco real conectado.

## Comparação

| Opção | Custo (o que achei) | Segurança e conformidade | Cobertura | Esforço a partir do que existe |
|---|---|---|---|---|
| **Pluggy** (atual) | A partir de **R$ 2.500/mês** (dados); trial 14 dias. Relatos dizem que não negocia abaixo disso. | Autorizada pelo BC como ITP (iniciadora de pagamento). Oferece conectores do Open Finance regulado (consentimento OAuth no app do banco) **e** conectores de "acesso direto" (com usuário/senha do banco). Certificações ISO/SOC não confirmadas em fonte pública. | Ampla (todos os grandes, cooperativas, digitais). | Zero (já integrado). |
| **Belvo** | Relato de **~R$ 6.000/mês**. Sem preço público. | ISO 27001 (anunciado pela Belvo). Open Finance regulado no Brasil + agregação. Foco em empresas maiores. | Ampla. | Médio: novo adaptador e widget. |
| **Tecnospeed PlugBank** | Relato de **R$ 1.500 de adesão + R$ 540/mês** (o menor dos três). Preço só por contato. | Credenciada no Open Finance; OAuth 2.0, FAPI, mTLS por conta dela; declara LGPD. Sem senha do banco. ISO/SOC não informado. | 47 bancos (44 PF, 36 PJ). | Médio: novo adaptador; ela promete "≤30 dias até produção". Empresa de Maringá conhecida em ERPs (boleto/NF-e). |
| **Klavi, Quanto, Iniciador, Celcoin** | Sem preço público; vendem para bancos, fintechs e crédito. Celcoin aparece em relato como base de revendas mais baratas. | Instituições reguladas/participantes do Open Finance. | Variável. | Médio a alto; foco não é ERP pequeno. |
| **Revendas sobre Pluggy** (ex.: Banco MCP) | ~R$ 9,90 a 19,90 por conta conectada/mês (relato TabNews 2026-06). | **Mais um intermediário** entre o banco e o sistema, empresa pequena, sem certificação conhecida. Termos de uso podem não permitir uso por SaaS. | A do Pluggy. | Médio. |
| **API direta do banco** (BB, Sicoob, Inter, Itaú, Bradesco, BTG...) | Em geral **sem custo** para conta PJ do próprio cliente (cada banco tem sua regra). | **A mais segura:** sem terceiro. A empresa gera no banco uma credencial (client id + certificado) só de leitura do extrato; o FINAVI guarda cifrada (Supabase Vault). mTLS/OAuth do banco. | Um banco por integração. | Alto por banco (cada um tem sua API e certificado), mas o mapa para o extrato é o mesmo. Omie/ACBr fazem assim. |
| **OFX** (já existe) | **Zero.** | Máxima: arquivo baixado pela empresa, nenhuma credencial guardada. | Todos os bancos. | Zero; já corrigido para arquivos grandes (#213). Só não é automático. |
| **Ser participante do Open Finance** | Exige virar instituição autorizada pelo BC (capital mínimo, compliance, auditoria). | — | — | Inviável para o Balbina (e era para o FINAVI). |

## Segurança: o que importa na escolha

1. **Nunca usar conector com senha do banco** (screen scraping / "acesso direto"). Se ficar com Pluggy ou outro agregador, ligar só conectores do Open Finance regulado: a empresa autoriza no app do banco, o consentimento tem prazo e pode ser revogado, e ninguém guarda a senha.
2. **Menos intermediários = menos risco.** Cada empresa no meio guarda o extrato das empresas. API direta e OFX não têm ninguém no meio; agregador tem um; revenda tem dois.
3. **Conferir antes de assinar** com qualquer agregador: contrato de operador de dados (LGPD, art. 39), onde ficam os dados (Brasil?), certificados (ISO 27001 / SOC 2 Type II, pedir o relatório), retenção e exclusão quando a granja desconecta, e aviso de incidente. Nenhum dos três publicou incidente conhecido nas fontes lidas, mas também não publicam relatório de auditoria aberto.
4. **No Balbina:** credencial de banco (se fizermos API direta) só no Vault, nunca em tabela comum; leitura só pelo servidor; já existe o webhook com token e RLS por empresa nas tabelas da conciliação.

## Plano sugerido

1. **Agora (sem custo):** deixar o Pluggy desligado na produção (sem `PLUGGY_*` na Vercel, sem as chaves a conciliação mostra só as instruções e o cron ignora) e o OFX como entrada principal. Nada a programar.
2. **Próximo passo:** escolher 1 banco (o que mais pisciculturas usam: BB, Sicoob, Bradesco, Banco da Amazônia?) e fazer a API direta dele como novo `provedor`, com a credencial da empresa no Vault. Estimativa: alguns dias por banco.
3. **Quando houver escala:** pedir proposta formal à Tecnospeed (e uma contraproposta do Pluggy com o número real de conexões), exigindo só Open Finance regulado e o contrato LGPD. Plugar como outro `provedor` sem mexer no resto.

## Atualização 2026-11-02: requisito "todos os principais bancos"

O Nicolas definiu que a integração precisa atender **todos os principais bancos**. Isso muda a recomendação:

- A **API direta por banco sai do plano principal**: seriam 6 a 10 integrações separadas (BB, Caixa, Itaú, Bradesco, Santander, Sicoob, Sicredi, Inter, Nubank PJ, Banco da Amazônia), cada uma com certificado, contrato e regra próprios. Não escala e cada uma é uma credencial a mais para guardar.
- A saída é um **agregador do Open Finance regulado**: um contrato, todos os bancos participantes, consentimento no app do banco, sem senha.
- **Escolha recomendada: Tecnospeed PlugBank** (47 bancos, 36 PJ; ~R$ 540/mês + R$ 1.500 de adesão, a confirmar). Antes de assinar: pedir a lista de bancos PJ (conferir Banco da Amazônia, Sicoob e Sicredi), proposta formal por número de conexões, contrato LGPD de operador, onde ficam os dados e certificados (ISO 27001 / SOC 2).
- **Na mesma rodada, pedir contraproposta ao Pluggy** com o volume real. Se chegar perto da Tecnospeed, ficar no Pluggy evita a migração (só conectores do Open Finance regulado).
- O **OFX continua** como reserva para banco que o agregador não cobrir e para quem não quiser dar consentimento.
- No código: novo adaptador como `provedor = 'tecnospeed'` (ampliar o check de `conexoes_bancarias.provedor`), mantendo o do Pluggy até a troca. Estimativa: poucos dias depois de ter a conta de sandbox.

## Pontos fracos deste estudo

- Preços de Belvo e Tecnospeed vêm de relatos públicos (TabNews, 2026-05), não de proposta oficial. Precisam ser confirmados com os comerciais.
- Certificações ISO/SOC do Pluggy e da Tecnospeed não foram confirmadas em fonte pública.
- Custo e regras das APIs diretas variam por banco e por agência; confirmar com o gerente do banco escolhido.

## Fontes

- Pluggy, preços e autorização ITP: https://www.pluggy.ai/blog/melhor-api-open-finance-como-avaliar (2026-09-01)
- Relato de preços Pluggy/Belvo/Tecnospeed: https://www.tabnews.com.br/GuilhermeVieira/estou-desenvolvendo-um-app-de-financas-pessoais-e-nao-consigo-pagar-o-open-finance-pluggy-r2-5k-mes-belvo-r6k-mes-tecnospeed-r1-5k-de-entrada-r540 (2026-05-21)
- Revenda sobre Pluggy: https://www.tabnews.com.br/GuilhermeVieira/resolvi-o-problema-do-open-finance-caro-que-postei-aqui-achei-uma-alternativa-e-ja-esta-em-producao (2026-06-17)
- Tecnospeed PlugBank Open Finance: https://tecnospeed.com.br/en/plugbank/open-finance-api/
- Belvo ISO 27001: https://belvo.com/blog/belvo-doubles-down-commitment-security-achieves-iso-27001/ ; https://belvo.com/security
- Extrato via API direta (exemplos de ERP): https://ajuda.omie.com.br/pt-BR/collections/1442343-integracoes-bancarias
- Regras do Open Finance (Resolução Conjunta nº 1/2020): https://normativos.bcb.gov.br/Lists/Normativos/Attachments/51028/Res_Conj_0001_v9_L.pdf
