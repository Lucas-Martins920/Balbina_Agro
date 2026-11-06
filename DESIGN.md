# Design do Balbina

Direção: **Liquid Glass**, a linguagem do iOS 26 / macOS Tahoe aplicada a um ERP. O app inteiro é vidro sobre um papel de parede de luz colorida (quatro campos: azul-petróleo, azul, verde-água e âmbar, fixos atrás da página), como a luz na água do viveiro. Cartões, tabelas, botões, campos e abas são lâminas translúcidas sobre o papel de parede, com aresta de luz por dentro e um reflexo que acompanha o mouse. A navegação (lateral flutuante, barra de abas do celular, menu e painel lateral) é a lâmina mais líquida: mais clara, mais desfocada e, no Chromium, com refração nas bordas. O azul-petróleo da água (`--marca`) é a cor da marca. Verde e vermelho só dizem bom ou ruim.

## Material (src/app/globals.css)

- `body::before`: papel de parede (`--papel-1..4` sobre `--fundo`). Parado de propósito: fundo animado obrigaria cada lâmina a refazer o desfoque a cada quadro.
- `.vidro`: lâmina de conteúdo (`--superficie`, arestas `--aresta`/`--brilho`, reflexo `--reflexo` em `--mx`/`--my`). Sem `backdrop-filter`: atrás dela só há o papel de parede, que já é luz difusa, e cada lâmina desfocada custava uma passada da placa de vídeo por quadro de rolagem.
- `.cristal`: lâmina de navegação (`--cristal`, blur 28px, saturação 200%). Com `html.lente` (Chromium, marcado por `SCRIPT_TEMA`) usa o filtro SVG `#lente` (`FiltroLente` em `src/components/brilho-vidro.tsx`) para refratar as bordas. Com `html.leve` (toque, até 4 núcleos ou 4 GB, economia de dados) fica sem refração, com blur 16px, e o reflexo do mouse desliga.
- Em CSS escreva só `backdrop-filter` (sem a versão `-webkit-`): com as duas, o build guarda só a prefixada e o Chrome fica sem desfoque.
- `BrilhoVidro` (mesmo arquivo): um ouvinte de `pointermove` no documento escreve `--mx`/`--my` na lâmina sob o mouse, no máximo uma vez por quadro; desligado no toque e com reduced-motion.
- `.popover` é sólido: listas abertas precisam ler bem. `prefers-reduced-transparency` troca vidro por `solido`.
- Ficam em `@layer components`, então utilitários do Tailwind (bg-*, transition-*) valem por cima.

## Tokens

| Token | Uso |
| --- | --- |
| `fundo` / `papel-1..4` | papel de parede |
| `superficie` / `cristal` | tinta do vidro de conteúdo / da navegação |
| `aresta` / `brilho` / `reflexo` | luz da borda de cima / bordas / reflexo do ponteiro |
| `elevado` | vidro claro dentro de vidro: botões secundários, trilho das abas, campos, hover |
| `solido` | superfície opaca: popovers, aba ativa, campo em foco |
| `texto` / `texto-suave` | tinta e texto secundário |
| `borda` / `linha` | aresta clara das lâminas / fios entre linhas |
| `marca` / `marca-suave` / `marca-texto` | azul-petróleo: botão principal (vidro tingido; texto branco no dia, escuro no noturno), foco, aba ativa do celular e do `/campo` |
| `azul` / `verde` / `laranja` / `violeta` / `rosa` / `amarelo` | cores de apoio (paleta validada para daltonismo): ícones do menu, `Ficha` e séries dos gráficos. Nunca em texto |
| `positivo` / `perigo` / `alerta` | entrada e em dia / vencido e erro / atenção |
| `--etiqueta-*` | etiquetas |

Dois temas com os mesmos nomes; o noturno é vidro fumê sobre luz escura. Escolha no `SeletorTema` (`src/components/tema.tsx`), salva em `localStorage` (`balbina-tema`), aplicada antes da pintura por `SCRIPT_TEMA`. Todo valor de cor existe nos três blocos de globals.css.

## Forma

- Fonte: SF Pro nos aparelhos Apple (`-apple-system`), Geist nos outros. Título grande 34px bold (30px no celular), tracking −0,03em; título de cartão 17px semibold; corpo 14px.
- Cantos concêntricos: cartões `rounded-2xl` (24px), lateral, menu e painéis `rounded-3xl`/2rem, campos `rounded-xl`, botões e abas em cápsula.
- Botões: cápsulas de vidro. Principal = azul-petróleo translúcido com brilho e sombra da mesma cor (um por tela); secundário = vidro claro; fantasma = só hover. Ao apertar encolhem para 0,95 com mola (`ease-mola`).
- Nada de texto sublinhado como ação. Ação solta (extrato, voltar, exportar, cancelar, “Assinar agora”) é cápsula `classeBotao("secundario", "sm")` (o pequeno tem área de toque de 44px; texto longo usa o terceiro parâmetro `quebrar`). Link dentro de uma frase é o chip `CLASSE_LINK_CHIP`. Só o número ou nome numa célula de tabela continua link de texto, com sublinhado no hover.
- Abas (`Segmentos`, `AbasFiltro`): trilho de vidro com pílula sólida; no celular rolam na horizontal.
- Celular: barra fina de vidro no alto com o nome da tela e **barra de abas de vidro** embaixo (Painel, três módulos que a pessoa pode ver e Menu); o Menu sobe como uma folha de vidro.
- Celular tem duas versões. A **simples** (padrão) mostra no Menu só a operação do dia (`MODULOS_CELULAR` em `src/lib/menu.ts`), esconde no Painel os blocos com a classe `so-completo` e mostra tabelas como lista de cartões. A **versão completa** desenha a página com 1280px, como no computador (cookie `balbina-versao`, lido por `generateViewport` em `src/app/(app)/layout.tsx`; o Safari ignorava o viewport trocado por script). A troca é o `SeletorVersao` (`src/components/versao.tsx`, celular × monitor, no formato do seletor dia/noite): fica na barra do alto do celular e, na versão completa, flutua no canto de baixo aumentado por `--escala-versao` para não ficar minúsculo com a página encolhida.
- Tabelas no celular: `Tabela` vira cartões (`.tabela-cartoes` em globals.css + `RotulosCelular`). Use `principal` para a coluna que dá título ao cartão, `ocultarNoCelular` para detalhes e `celular="rolar"` só em tabela de análise larga (semana a semana, viabilidade).
- Nada pode passar da largura da tela: grade sempre com `grid-cols-1` no celular (itens de grade já têm `min-width: 0`) e filtros em cápsula com `max-w-full overflow-x-auto`. Uma peça larga faz o Safari do iPhone afastar o zoom e a tela fica descentralizada.
- Aparência: só dia e noite. Sem escolha salva, segue o aparelho.
- `Ficha`: quadrado colorido com glifo branco, como os Ajustes do iPhone.

## App de campo (`/campo`)

- Uma coluna de até 32rem, barra de vidro no alto (nome da piscicultura e o selo de sinal, que abre os Envios) e barra
  de abas de vidro embaixo: Chat, Viveiros, Ração, Biometria, Envios. A aba aberta fica salva no aparelho.
- Formulários abrem numa folha que sobe de baixo (`src/components/campo/folha.tsx`, `<dialog>` nativo, arrastar para
  fechar). Botão principal grande (56px) no rodapé da folha; contadores −/+ para sacos e mortes; Sim/Não do checklist
  em cápsulas.
- Peças em `src/components/campo/pecas.tsx`. Nada de tabela: listas de cartões de vidro com o número que importa grande.
- O chat mostra a conversa e as propostas da IA como cartões para confirmar; nada é lançado sem o toque de quem está
  no viveiro. Foco do teclado visível no contorno da caixa de texto, não no campo.

## Regras

- Painel de conteúdo = `vidro rounded-2xl border border-borda`. Navegação flutuante = `cristal`. Dentro de uma lâmina não use outra `.vidro`: use `bg-elevado` (vidro claro). Botões, campos e abas não levam `backdrop-blur`; desfoque só no que flutua sobre conteúdo que rola (navegação, barras fixas, fundo de modal).
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
- Troca de tela mostra na hora o esqueleto de `src/app/(app)/loading.tsx` (`.esqueleto`, reflexo de vidro passando).
- Só `transform`, `opacity` e `clip-path`; `ease-out` exponencial (`--ease-out`, `--ease-drawer`); botões encolhem para 0,97 ao apertar. `prefers-reduced-motion` zera duração e atraso.

## Desempenho

- O vidro custa GPU: a página tem um só papel de parede parado e o desfoque fica só na navegação (28px, 16px no modo leve). Nada anima o fundo.
- Entradas curtas: a cascata dura 300 ms (atraso máximo 120 ms) e os gráficos crescem em 500 ms. O esqueleto anima com `transform` numa camada (`::after`), nunca `background-position`.
- A luz do fundo fica em `body::before` fixo, não em `background-attachment: fixed`.
- O reflexo do ponteiro escreve no máximo uma vez por quadro e só no elemento sob o mouse.
- Leituras do servidor em paralelo (`Promise.all`), regra `async-parallel` da skill vercel-react-best-practices.

## Painel e gráficos

- `CartaoKpi`, `GraficoColunas`, `GraficoLinha`, `BarrasRanking` em `src/components/graficos.tsx`; planejamento em `graficos-planejamento.tsx`. Sem biblioteca.
- Cor com significado fixo: receitas `verde`, despesas `laranja`, saldo `azul`, resultado e centro de custo `violeta`, ração `amarelo`. Crescimento do peixe (biometria contra a curva da espécie) usa `marca` para o medido e a curva tracejada para o padrão.
- Regras da skill dataviz: um eixo, grade de 1px, ponta arredondada 4px, legenda para 2+ séries, dica no hover e tabela escondida para leitor de tela.

## Ferramentas

Skills de design em `.claude/skills/` (Impeccable, Taste Skill, Emil Kowalski e animação, frontend-design, vercel-react-best-practices). Produto descrito em `PRODUCT.md`. Para conferir no navegador, rode `npm run local` (`docs/rodar-local.md`).
