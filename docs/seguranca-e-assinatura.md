# Segurança e assinatura (SaaS)

## Como o acesso é liberado

- Cada empresa tem uma linha em `assinaturas` (migration `20261027050000_assinaturas.sql`). Empresa nova ganha 14 dias de teste; as que já existiam ganharam 30.
- Acesso liberado = `status = 'cortesia'` **ou** `teste_ate >= hoje` **ou** `pago_ate + 5 dias >= hoje` (`app.assinatura_libera`).
- O bloqueio é no banco: `app.minhas_empresas()` e `app.pode()` só devolvem empresas liberadas, então todas as policies e RPCs param juntas. `empresas`, `assinaturas`, `planos` e `minhas_permissoes` continuam legíveis para a tela de pagamento.
- O layout do app e `/campo` mandam quem está bloqueado para `/assinatura`. Isso é só a navegação; a trava de verdade é o RLS.
- Ninguém grava `assinaturas` com o JWT do usuário. O servidor grava com a chave secreta depois de conferir que a pessoa é master (`src/app/assinatura/actions.ts`), e o webhook grava pela RPC `registrar_evento_assinatura` (só service role).

## Cobrança

- Asaas da conta do fornecedor do Balbina, com variáveis `BALBINA_ASAAS_API_KEY`, `BALBINA_ASAAS_AMBIENTE` e `BALBINA_ASAAS_WEBHOOK_TOKEN`. É separado do Asaas das pisciculturas (`ASAAS_*`): o perfil de cobrança de uma piscicultura só aceita nomes `ASAAS_*`, então nunca alcança a chave do Balbina.
- "Assinar" cria o cliente e a assinatura (`billingType: UNDEFINED`, a piscicultura escolhe Pix, boleto ou cartão na fatura do Asaas). A primeira cobrança vence no fim do teste.
- Webhook: `POST /api/webhooks/assinatura`. `PAYMENT_CONFIRMED`/`RECEIVED` estende `pago_ate` por um ciclo; `PAYMENT_OVERDUE` marca atraso; estorno desfaz o período; `SUBSCRIPTION_DELETED`/`INACTIVATED` cancela (o acesso vai até o fim do período pago).
- Planos e preços na tabela `planos` (valores iniciais provisórios).
- Empresa do próprio fornecedor ou de parceiros: `update assinaturas set status = 'cortesia' where empresa_id = '...'` no SQL Editor.

## Configurar no Asaas do Balbina

Passo a passo completo para produção, garantias do código e pendências: [asaas-producao.md](asaas-producao.md).

1. Conta de produção no CNPJ do fornecedor; gerar a chave da API.
2. Na Vercel: `BALBINA_ASAAS_API_KEY`, `BALBINA_ASAAS_AMBIENTE=producao`, `BALBINA_ASAAS_WEBHOOK_TOKEN` (texto aleatório).
3. No Asaas, Integrações > Webhooks: URL `https://<domínio do Balbina>/api/webhooks/assinatura`, o mesmo token, eventos de cobrança e de assinatura.

## Planos (Basic, Vendas, Fiscal, Gestão)

Migration `20261027224100_planos_balbina.sql`. Cada plano libera um conjunto de módulos (tabela `niveis_plano`, coluna `modulos` com os prefixos das chaves de permissão; `*` = todos):

| Plano | Módulos |
| --- | --- |
| Balbina Basic | viveiros (piscicultura), lotes, apontamentos, sanidade, estoque, ração e insumos, clientes/fornecedores, produtos, configurações, histórico |
| Balbina Vendas | Basic + contas a pagar/receber, contas, cartões, fluxo de caixa, relatórios, orçamento, fechamento, categorias, centros de custo, vendas, PDV |
| Balbina Fiscal | Vendas + cobranças (boleto/Pix) e notas fiscais |
| Balbina Gestão | tudo, inclusive conciliação/Open Finance, planejamento e custo do kg |

- A trava está em `app.pode()`: a chave só vale se o plano inclui o módulo, nem o master passa. `notas_fiscais` tem policies restritivas próprias (`plano_*`), porque quem grava a nota é quem lança venda.
- Teste grátis e assinatura sem plano valem como Gestão (`app.nivel_empresa`).
- O app recebe `nivel`, `nome_plano` e `modulos` em `minhas_permissoes`; o menu esconde o que o plano não inclui e mostra o convite "Conhecer planos"; `/sem-acesso` explica qual plano libera o módulo. Ações que chamam Asaas, Focus ou Pluggy conferem o plano antes (`foraDoPlano`).
- Mudar o que um plano libera: `update niveis_plano set modulos = ... where id = 'basic'`. Preços em `planos` (um registro mensal e um anual por nível) são provisórios.
- Os planos antigos `mensal`/`anual` ficaram como Gestão, fora da vitrine.

## Conta Asaas de cada piscicultura

- Migration `20261027130000_contas_asaas.sql`. Cada perfil de cobrança liga a sua conta em Cobranças (só o master): **subconta aberta pelo Balbina** (`POST /v3/accounts` com a chave `BALBINA_ASAAS_API_KEY`, a conta-pai precisa ser CNPJ) ou **conta que a piscicultura já tem** (cola a chave da API; o ambiente é descoberto testando produção e sandbox).
- A chave da piscicultura é cifrada no servidor com AES-256-GCM (`src/lib/cripto.ts`, segredo `BALBINA_CHAVE_CRIPTO`) e fica em `contas_asaas_segredos`, sem policy nem privilégio para `anon`/`authenticated`. Perder `BALBINA_CHAVE_CRIPTO` obriga a ligar as contas de novo.
- O Balbina cadastra o webhook na conta da piscicultura (`/api/webhooks/asaas?perfil=<id>`) com um token só dela; guardamos o hash. O webhook só mexe nas cobranças daquele perfil e atualiza a situação cadastral (`ACCOUNT_STATUS_GENERAL_APPROVAL_*`).
- `credenciais_ref` (a chave única antiga do servidor) só o service role altera (trigger `app.protege_credenciais`). Desde 2026-11-02 o app não lê mais essa coluna (a chave única do servidor saiu); toda piscicultura liga a própria conta em Cobranças.
- Regras do Asaas para subcontas: em produção há um período de avaliação (até 10 subcontas, R$ 2.000 em cobranças por subconta, 60 dias) e, depois dele, gerenciar a chave das subcontas exige homologação BaaS no Asaas. Sem essa homologação, use a opção "Já tenho conta no Asaas".

## Auditoria de 2026-10-27

Conferido e em ordem: RLS em todas as tabelas com `empresa_id`, views com `security_invoker`, funções `security definer` com `search_path` fixo, permissões por módulo nas policies restritivas, webhooks com token em tempo constante e idempotência, segredos só no servidor.

Corrigido: redirecionamento aberto no login (`/\site.com`), cabeçalhos de segurança (`next.config.ts`), cookie da empresa com `Secure`.

Pendente:
- CNPJ não é verificado na criação da empresa (dá para ocupar o CNPJ de outro ou repetir teste grátis com CNPJs inventados). Próximo passo: consultar o CNPJ (BrasilAPI) e limitar um teste por usuário.
- CSP sem `script-src` (o tema e o Next usam script inline); token da Pluggy vai na URL do webhook.

## Termos, privacidade e cookies

- Páginas públicas: `/termos`, `/privacidade` e `/cookies`, com rodapé em todas as telas de acesso. São textos-base: **revise com um advogado** e preencha `NEXT_PUBLIC_BALBINA_RAZAO_SOCIAL`, `NEXT_PUBLIC_BALBINA_CNPJ`, `NEXT_PUBLIC_BALBINA_EMAIL` e `NEXT_PUBLIC_BALBINA_FORO` na Vercel antes de vender.
- O Balbina só usa cookies essenciais (sessão do Supabase e `empresa_id`) e localStorage de preferência. Por isso o aviso de cookies é informativo, sem botão de recusar. Ao adicionar analytics, pixel ou qualquer cookie não essencial, troque o aviso por consentimento de verdade (aceitar/recusar) e atualize `/cookies`.
- Aceite: tabela `aceites_termos` (uma linha por pessoa e versão, com IP e navegador), gravada só pela RPC `aceitar_termos`; ninguém altera nem apaga. Migration `20261027123500_termos_e_seguranca.sql`.
- Quem cria conta marca o aceite no cadastro; ele vira registro no primeiro acesso. Convidados e contas antigas passam por `/aceitar-termos`. Ao mudar qualquer documento, mude `VERSAO_TERMOS` em `src/lib/termos.ts` e todos aceitam de novo.

## Auditoria de 2026-10-27 (segunda rodada)

Ferramentas: Semgrep com as regras do GitHub (TypeScript, JavaScript, segredos, GitHub Actions), `npm audit` (0 vulnerabilidades) e revisão manual de cada porta de entrada (rotas de API, server actions, funções `security definer`, policies).

Achado e corrigido: **ação sobre documentos de outra empresa pelas integrações.** Asaas, Focus NFe e Pluggy usam uma credencial do servidor para todas as empresas, e o servidor montava a URL com ids gravados em colunas que o usuário pode editar pela API (`cobrancas.id_externo`, `notas_fiscais.provedor_ref`, `contatos.asaas_cliente_id`, `conexoes_bancarias.item_id`, `contas_financeiras.open_finance_conta_id`). Trocando o id, um usuário de uma granja conseguiria cancelar a cobrança ou a nota fiscal de outra, ou ler a nota dela. Correções:
- A referência da nota na Focus agora é calculada do id da nota (`refDaNota`), nunca lida da coluna.
- Antes de cancelar uma cobrança, o servidor confere no Asaas que o pagamento tem `externalReference` igual à cobrança; o cliente do Asaas só é reaproveitado se for do mesmo contato.
- A sincronização do Open Finance confere que o item foi aberto pela empresa e só lê contas daquele item.
- No banco, esses ids não podem mais ser trocados por outro valor pelo usuário (trigger `app.protege_ids_integracao`); só o service role troca.
- Com a conta Asaas por empresa (PR #28 do FINAVI), a chave é escolhida pelo perfil da cobrança. A cobrança agora só aceita perfil da mesma empresa (trigger `app.checa_perfil_da_cobranca`) e o cancelamento pega o perfil pela RLS, não pelo id gravado na cobrança.

Revisado e em ordem: webhooks com token em tempo constante; RLS e policies restritivas em todas as tabelas com `empresa_id`; funções `security definer` com checagem de empresa/master; segredos só no servidor; sem `dangerouslySetInnerHTML` além do script do tema.

Achados menores, sem correção agora: actions do GitHub fixadas por tag (`@v4`) em vez de hash; mensagem de erro do cadastro repassa o texto do Supabase.

## Auditoria de 2026-10-28 (skill security-audit da Cloudflare)

Método da skill `security-audit` (cloudflare/security-audit-skill): mapa das fronteiras de confiança, cinco frentes revisadas em paralelo (webhooks e integrações, login e sessão, banco e RLS, server actions e rotas, configuração, CI e dependências) e cada achado reproduzido num Postgres local com dados fictícios antes de corrigir. Relatório completo na pasta do projeto (`seguranca/auditoria-seguranca-2026-10-28.md`).

Corrigido (migration `20261028050000_isolamento_entre_empresas.sql`, testes `99_mfa_master.sql` e `99_isolamento_empresas.sql`):
- **Master sem o segundo fator.** `app.e_master()` não chamava `app.mfa_em_dia()`. Com só a senha de um master com autenticador, a API direta deixava convidar outro master, remover usuários e importar dados. Corrigido também pelo PR #55 (`20261028040000_auditoria_correcoes.sql`); `99_mfa_master.sql` testa as RPCs.
- **Referência para registro de outra empresa.** O RLS olha só o `empresa_id` da própria linha; uma linha da empresa A podia apontar para o apontamento, o centro de custo ou o núcleo de B, e triggers `security definer` seguiam a referência (estoque lançado em B, centro de custo de B renomeado ou apagado). Toda chave estrangeira entre tabelas com `empresa_id` agora confere a mesma empresa (`app.checa_mesma_empresa`, criada por `app.travar_referencias()`).
- **Vínculos da importação.** `importar_pacote` atualizava a conta ou o contato pelo id gravado em `importacao_vinculos`, sem conferir a empresa. O vínculo agora só aceita registro da mesma empresa.
- A importação do NIBO só aceita data inicial real dos últimos 10 anos (antes, `0000-01-01` disparava dezenas de milhares de chamadas).

## Login: captcha e verificação em duas etapas

- **Cadastro** pede a senha duas vezes; o convite e a tela de nova senha também.
- **Esqueci minha senha** (`/login`): o link do e-mail passa por `/auth/confirmar?proximo=senha` e cai em `/auth/nova-senha`.
- **Captcha**: Cloudflare Turnstile no login, no cadastro e no "esqueci minha senha" (`src/components/captcha.tsx`). O token vai como `captchaToken` para o Supabase Auth, que confere com a chave secreta. Sem `NEXT_PUBLIC_TURNSTILE_SITE_KEY` o widget não aparece.
- **Verificação em duas etapas (MFA TOTP)**: cada pessoa ativa em `/seguranca` (ícone de escudo ao lado do e-mail, no menu). Depois disso o login pede o código do app autenticador em `/auth/mfa`. A trava de verdade está no banco (`20261027154700_mfa.sql`): com autenticador confirmado, `app.minhas_empresas()`, `app.empresas_vinculadas()` e `app.pode()` só liberam a sessão `aal2`. Quem redefinir essas funções precisa manter `app.mfa_em_dia()`.
- Pessoa que perdeu o celular: no painel do Supabase, Authentication > Users > a pessoa > apagar o fator MFA. Ela volta a entrar só com a senha e pode ativar de novo.

### Ativar o captcha (uma vez)

A ordem importa: se o Supabase passar a exigir captcha antes de o site mandar o token, ninguém entra.

1. Cloudflare (dash.cloudflare.com, conta grátis) > Turnstile > Add widget. Nome "Balbina", domínios do Balbina (o da Vercel e o próprio) e `localhost`, modo Managed. Copie a **Site Key** e a **Secret Key**.
2. Vercel > projeto > Settings > Environment Variables: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = Site Key (Production e Preview). Faça um Redeploy e confira que o login mostra a caixinha da Cloudflare.
3. Supabase > Authentication > Attack Protection > Enable Captcha protection: provedor Turnstile, cole a **Secret Key**, salve.
4. Supabase > Authentication > URL Configuration > Redirect URLs: inclua `https://<domínio do Balbina>/**` (o "esqueci minha senha" volta com `?proximo=senha`).

O MFA por app autenticador já vem ligado no Supabase (Authentication > Multi-Factor: TOTP "Enabled"); confira só se alguém desligou.

### Verificação em duas etapas obrigatória (2026-10-28)

Desde a migration `20261028034500_mfa_obrigatorio.sql`, toda sessão precisa do 2º fator, não só a de quem ativou o app:

- **Quem ativou o app autenticador** (`/seguranca`): só o código do app vale (sessão `aal2`). O e-mail não substitui o app.
- **Os demais**: código enviado por e-mail em `/auth/mfa`. O Supabase Auth manda e confere (`signInWithOtp`/`verifyOtp` num cliente avulso); o servidor então grava a sessão (`session_id` do JWT) em `sessoes_2fa` com a chave de serviço. O link do mesmo e-mail também vale (`/auth/mfa/email`). Links de confirmação de cadastro, convite e "esqueci minha senha" que passam por `/auth/confirmar` já contam como o e-mail.
- Cada aparelho ou navegador novo pede o código de novo; sair da conta encerra a sessão.
- Precisa de `SUPABASE_SECRET_KEY` na Vercel.

Configuração no Supabase:

1. **SMTP próprio** (Authentication > Emails > SMTP Settings). Sem ele o Supabase só manda e-mail para os membros da equipe do projeto e no máximo 2 por hora: outros usuários ficam sem o código.
2. **Modelo do e-mail** (Authentication > Emails > Templates > Magic Link): inclua o código, por exemplo `<p>Seu código do Balbina: <strong>{{ .Token }}</strong></p>`, mantendo o link `{{ .ConfirmationURL }}`. Sem o código no modelo, só o link funciona.
3. **Redirect URLs**: `https://<domínio do Balbina>/**` (o link volta em `/auth/mfa/email`).

Saída de emergência, se o envio de e-mail parar: no SQL Editor, `update app.parametros set valor = 'nao' where chave = 'exigir_2fa';` volta ao 2º fator opcional (só para quem ativou o app). Para religar, `valor = 'sim'`.

### Confiar no dispositivo por 14 dias e sessão aberta com senha (2026-10-28)

- Na verificação do login há a caixa "Confiar neste dispositivo por 14 dias". Marcada, o navegador recebe o cookie httpOnly `balbina_dispositivo` (token aleatório); o banco guarda só o hash em `dispositivos_confiaveis` (só a chave de serviço lê). Num login novo nesse navegador, `/auth/mfa` confere o token e registra a sessão em `sessoes_2fa` como `dispositivo_app` ou `dispositivo_email`. Quem tem app autenticador só é liberado por confiança criada com o app. `/seguranca` mostra quantos navegadores estão confiados e esquece todos.
- O Supabase deixa entrar só pelo e-mail (link ou código). Para isso não valer como os dois fatores, `sessoes_2fa` só completa sessão aberta com senha (`amr` "password" no JWT, `app.sessao_com_senha()`). Por isso, depois de confirmar o cadastro, aceitar um convite ou criar uma senha nova pelo link, a pessoa entra de novo com e-mail e senha.
- Modelo do e-mail (Authentication > Emails > Templates > Magic Link), com o código e o link:
  `<p>Seu código do Balbina: <strong>{{ .Token }}</strong></p><p>Ou confirme por este link no mesmo navegador: <a href="{{ .ConfirmationURL }}">confirmar</a></p>`

## Alarmes de segurança no painel (2026-10-30)

O master vê em "Pede sua atenção", no painel, os alarmes de `alertas_seguranca(empresa)` (`20261030140000_alarmes_seguranca.sql`):

- **Senha errada em sequência**: alguém da piscicultura errou a senha 5 vezes ou mais na última hora (15 ou mais vira crítico). O login registra cada senha errada com `registrar_falha_login`, pela chave de serviço; o captcha recusado não conta.
- **Chave da API revogada ou vencida em uso**: algum sistema continua chamando a API com uma chave que já não vale (um registro por minuto por chave, guardado em `api_autenticar`).
- **Avisos da API parados**: aviso de webhook esperando há mais de 30 minutos (endereço fora do ar ou rotina do Vault sem configurar).
- **Extrato do banco parado**: conexão do Open Finance pedindo login, com erro ou sem leitura há mais de 2 dias.

Os eventos ficam em `eventos_seguranca` por 30 dias, sem acesso para quem tem login; o master vê só o resumo.
