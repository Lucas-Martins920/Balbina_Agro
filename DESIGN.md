# Design do Balbina

Direção: **Várzea**, a planície fértil de beira-rio onde o tambaqui engorda. Superfícies limpas e opacas sobre um fundo de folha nova (`#f5f8f2`), verde fresco como marca (`#2e7d32`), barra lateral clara com fio de borda, cantos arredondados (cards `rounded-2xl`/20px, botões em cápsula `rounded-full`). Sora nos títulos, Figtree no texto. Sem vidro, sem ondas, sem blur: a identidade vem do verde vivo, dos cantos pill e do tom de folhagem no fundo.

## Material (src/app/globals.css)

- `body::before`: dois brilhos radiais suaves de sol e mato sobre `--fundo`, fixos e sem animação.
- `.vidro`: cartão de conteúdo opaco (`--superficie` branco, bordas `--borda`, sombra `--sombra`). Sem backdrop-filter, sem reflexo.
- `.cristal`: barra de navegação quase opaca (`--cristal`, 94% alpha). Sem blur.
- `.igapo`: escopo que tinge a barra lateral e o menu móvel. No Várzea a lateral é branca com um fio de borda à direita (`box-shadow: inset -1px 0 0 var(--borda)`), separando-a do conteúdo.
- `.folha`: modificador para cartões com tom verde: `--elevado: #e8f0e4`, `--borda: #dde7d7`, `--etiqueta-neutro: #e4eedf`. Usado nos cards do painel financeiro.
- `.popover` é sólido: listas abertas precisam ler bem.
- Ficam em `@layer components`, então utilitários do Tailwind (bg-*, transition-*) valem por cima.

## Tokens

| Token | Uso |
| --- | --- |
| `fundo` | fundo da página (#f5f8f2 dia, #0f1a14 noite) |
| `superficie` / `cristal` | branco do cartão / tinta da navegação |
| `elevado` | fundo leve dentro de cartão: botões secundários, trilho das abas, campos, hover |
| `solido` | superfície opaca: popovers, aba ativa, campo em foco |
| `texto` / `texto-suave` | tinta e texto secundário |
| `borda` / `linha` | aresta dos cartões / fios entre linhas de tabela |
| `marca` / `marca-suave` / `marca-texto` | verde (#2e7d32): botão principal (preenchido; texto branco), foco, aba ativa do celular e do `/campo`, item ativo da lateral |
| `marca-claro` | verde mais vivo (#7cc36b) para detalhes decorativos |
| `azul` / `verde` / `laranja` / `violeta` / `rosa` / `amarelo` | cores de apoio (paleta validada para daltonismo): ícones do menu, `Ficha` e séries dos gráficos. Nunca em texto |
| `positivo` / `perigo` / `alerta` | entrada e em dia / vencido e erro / atenção |
| `--etiqueta-*` | etiquetas |

Dois temas com os mesmos nomes; o noturno é verde-escuro profundo (#0f1a14). Escolha no `SeletorTema` (`src/components/tema.tsx`), salva em `localStorage` (`balbina-tema`), aplicada antes da pintura por `SCRIPT_TEMA`. Todo valor de cor existe nos três blocos de globals.css.

## Forma

- Fonte título: **Sora** (`--font-display`, `font-display`). Título grande 34px bold (30px no celular), tracking −0,03em; título de cartão 17px semibold.
- Fonte corpo: **Figtree** (`--font-sans`, `font-sans`). Corpo 14px.
- Fonte código: **IBM Plex Mono** (`--font-mono`).
- Cantos concêntricos: cartões `rounded-2xl` (20px), lateral, menu e painéis `rounded-3xl`/24px, campos `rounded-xl`.
- Botões: **cápsulas pill** (`rounded-full`). Principal = verde preenchido com texto branco (um por tela); secundário = fundo claro com borda; fantasma = só hover. Ao apertar encolhem para 0,95 com mola (`ease-mola`).
- Nada de texto sublinhado como ação. Ação solta (extrato, voltar, exportar, cancelar, "Assinar agora") é cápsula `classeBotao("secundario", "sm")` (o pequeno tem área de toque de 44px; texto longo usa o terceiro parâmetro `quebrar`). Link dentro de uma frase é o chip `CLASSE_LINK_CHIP`. Só o número ou nome numa célula de tabela continua link de texto, com sublinhado no hover.
- Abas (`Segmentos`, `AbasFiltro`): trilho pill com pílula sólida (`rounded-full`); no celular rolam na horizontal.
- Barra lateral: fundo branco com fio de borda (`box-shadow: inset -1px 0 0 var(--borda)`). Item ativo: `bg-marca-suave font-semibold text-marca` (verde claro com texto verde). Recolhida vira trilho de ícones com as mesmas cores.
- Celular: barra fina no alto com o nome da tela e **barra de abas** embaixo (Painel, três módulos que a pessoa pode ver e Menu); o Menu sobe como uma folha.
- Celular tem duas versões. A **simples** (padrão) mostra no Menu só a operação do dia (`MODULOS_CELULAR` em `src/lib/menu.ts`), esconde no Painel os blocos com a classe `so-completo` e mostra tabelas como lista de cartões. A **versão completa** desenha a página com 1280px, como no computador (cookie `balbina-versao`, lido por `generateViewport` em `src/app/(app)/layout.tsx`; o Safari ignorava o viewport trocado por script). A troca é o `SeletorVersao` (`src/components/versao.tsx`, celular × monitor, no formato do seletor dia/noite): fica na barra do alto do celular e, na versão completa, flutua no canto de baixo aumentado por `--escala-versao` para não ficar minúsculo com a página encolhida.
- Tabelas no celular: `Tabela` vira cartões (`.tabela-cartoes` em globals.css + `RotulosCelular`). Use `principal` para a coluna que dá título ao cartão, `ocultarNoCelular` para detalhes e `celular="rolar"` só em tabela de análise larga (semana a semana, viabilidade).
- Nada pode passar da largura da tela: grade sempre com `grid-cols-1` no celular (itens de grade já têm `min-width: 0`) e filtros em cápsula com `max-w-full overflow-x-auto`. Uma peça larga faz o Safari do iPhone afastar o zoom e a tela fica descentralizada.
- Aparência: só dia e noite. Sem escolha salva, segue o aparelho.
- `Ficha`: quadrado colorido com glifo branco.

## Marca sobre títulos

A marca de página é o texto "● Balbina" em verde (`--marca`) acima do título, via `.titulo-igapo::before`. Simples, sem ícone SVG — apenas um bullet e o nome.

## App de campo (`/campo`)

- Uma coluna de até 32rem, barra no alto (nome da piscicultura e o selo de sinal, que abre os Envios) e barra
  de abas embaixo: Chat, Viveiros, Ração, Biometria, Envios. A aba aberta fica salva no aparelho.
- Formulários abrem numa folha que sobe de baixo (`src/components/campo/folha.tsx`, `<dialog>` nativo, arrastar para
  fechar). Botão principal grande (56px) no rodapé da folha; contadores −/+ para sacos e mortes; Sim/Não do checklist
  em cápsulas.
- Peças em `src/components/campo/pecas.tsx`. Nada de tabela: listas de cartões com o número que importa grande.
- O chat mostra a conversa e as propostas da IA como cartões para confirmar; nada é lançado sem o toque de quem está
  no viveiro. Foco do teclado visível no contorno da caixa de texto, não no campo.

## Regras

- Painel de conteúdo = `vidro rounded-2xl border border-borda`. Navegação = `cristal`. Dentro de um cartão não use outro `.vidro`: use `bg-elevado`. Nada de backdrop-blur.
- Use os primitivos de `src/components/ui.tsx`: `Titulo`, `Cartao`, `Botao`/`LinkBotao`/`classeBotao`, `Campo`, `Selecao`, `Tabela` (com `direita`), `Etiqueta`, `Segmentos`, `Faixa` + `Indicador`, `CartaoKpi`, `Aviso`, `Vazio`. Nada de cor fixa.
- Barra lateral (`src/components/barra-lateral.tsx`, estrutura em `src/lib/menu.ts`): aberta mostra empresa, busca de telas (⌘K/Ctrl K), seções Principal/Operação/Administração com cada grupo de módulos abrindo em árvore, interruptor de modo noturno e perfil (bolinha verde = com internet); recolhida vira um trilho de ícones com dica ao passar o mouse. O estado fica em `<html class="lateral-recolhida">` (`src/lib/lateral.ts`, padrão recolhida abaixo de 1280px) e o CSS usa a variante `recolhida:`. No celular a mesma lista aberta vai na folha do botão Menu.
- Cadastros seguem `ListaCadastro` + `PainelLateral` + `FormPainel` de `src/components/cadastro.tsx`. Ação em várias linhas de uma vez: prop `emLote` da `ListaCadastro` (caixa por linha, "selecionar todos" vale para o que a busca e o filtro mostram, barra no rodapé) com `BotaoLote`, que confirma na própria barra antes de rodar.
- **Lançamentos** (entrada de dados que não é cadastro em lista) seguem um padrão só: o botão fica **no alto**, no `acoes` do `Titulo` (lançamento da tela inteira) ou da `Secao` (lançamento que mexe naquele bloco), e abre a gaveta da direita com o formulário (`BotaoLancamento` de `src/components/lancamento.tsx`, por cima de `PainelLateral` + `FormPainel`). Salvou, a gaveta fecha e o aviso curto aparece. O corpo da tela fica só com informação: resumo no alto, listas embaixo. Nada de cartão com formulário no fim da página ou numa coluna ao lado da tabela. O lançamento mais comum da tela é o botão principal (um por tela); os outros são secundários, e cadastros de apoio (produto, depósito, cartão) vão como secundários pequenos. Ação de uma linha (Feito, Cobrar, Faturar, Conciliar, Excluir) continua na própria linha. Telas que são o próprio formulário (parâmetros, checklist de manutenção, PDV) não mudam.
- Dentro da gaveta (32rem) use no máximo `grid-cols-2`; classes `sm:`/`md:` respondem à janela, não à gaveta.
- Lista de escolha de cadastro dentro de um lançamento (produto, depósito, fornecedor, cliente) usa `SelecaoComNovo` (`src/components/selecao-com-novo.tsx`): o "+ Novo" cadastra só com o nome ali mesmo e deixa o novo escolhido.
- Um link pode abrir a gaveta de outra tela com `?lancar=<rótulo ou chave do BotaoLancamento>` (é assim que a Rotina do dia leva direto ao lançamento do viveiro).
- **Rotina do dia** (`/pendencias`): checklist do que precisa entrar hoje, por área (Viveiros, Comercial, Financeiro, Semana e mês), marcado sozinho pelo que já entrou (`organizarRotina` em `src/lib/pendencias.ts`). Assunto novo que precisa ser alimentado todo dia entra lá.
- Tela sucinta: responder primeiro a pergunta do dia (números em `Faixa`, próximos passos, o que está atrasado); detalhe mês a mês fica recolhido num `<details>` ou em outra aba.
- Dinheiro: entrada em verde com `+`, saída em tinta com `−`; vermelho só para vencido ou negativo. Zero é `–`.
- Tabelas: sem zebra, cabeçalho cinza pequeno, valores à direita com `tabular-nums`.
- Ícones: `lucide-react`, 16px, traço 1,75.

## Movimento

- Uma entrada orquestrada por tela: os blocos sobem em cascata (`.cascata` no layout, 40ms entre blocos), as colunas dos gráficos crescem da base (`.crescer-y`), barras e faixas crescem da esquerda (`.crescer-x`, incluindo a linha do tempo) e linhas se revelam (`.revelar-x`). Atraso por item via `--i`.
- Troca de tela mostra na hora o esqueleto de `src/app/(app)/loading.tsx` (`.esqueleto`).
- Só `transform`, `opacity` e `clip-path`; `ease-out` exponencial (`--ease-out`, `--ease-drawer`); botões encolhem para 0,97 ao apertar. `prefers-reduced-motion` zera duração e atraso.

## Desempenho

- Sem vidro, sem blur na navegação: custo de GPU praticamente zero.
- Entradas curtas: a cascata dura 300 ms (atraso máximo 120 ms) e os gráficos crescem em 500 ms. O esqueleto anima com `transform` numa camada (`::after`), nunca `background-position`.
- A luz do fundo fica em `body::before` fixo, não em `background-attachment: fixed`.
- Leituras do servidor em paralelo (`Promise.all`), regra `async-parallel` da skill vercel-react-best-practices.

## Painel e gráficos

- `CartaoKpi`, `GraficoColunas`, `GraficoLinha`, `BarrasRanking` em `src/components/graficos.tsx`; planejamento em `graficos-planejamento.tsx`. Sem biblioteca.
- Cor com significado fixo: receitas `verde`, despesas `laranja`, saldo `azul`, resultado e centro de custo `violeta`, ração `amarelo`. Crescimento do peixe (biometria contra a curva da espécie) usa `marca` para o medido e a curva tracejada para o padrão.
- Regras da skill dataviz: um eixo, grade de 1px, ponta arredondada 4px, legenda para 2+ séries, dica no hover e tabela escondida para leitor de tela.

## Ferramentas

Skills de design em `.claude/skills/` (Impeccable, Taste Skill, Emil Kowalski e animação, frontend-design, vercel-react-best-practices). Produto descrito em `PRODUCT.md`. Para conferir no navegador, rode `npm run local` (`docs/rodar-local.md`).
