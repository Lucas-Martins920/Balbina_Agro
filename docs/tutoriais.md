# Tutoriais por tela (balões guiados)

Cada tela do Balbina tem um tutorial curto em balões ([Driver.js](https://driverjs.com), MIT) que aparece no primeiro
acesso de cada pessoa. O botão de ajuda fixo no canto de baixo (atalho `?`) mostra as dúvidas da tela, busca em todas
as dúvidas, refaz o tutorial da tela, o tour de boas-vindas ou todos, e liga/desliga o tutorial automático.

- Textos e passos: `src/lib/tutoriais.ts` (`TUTORIAIS`, `TOUR_GERAL`). O componente é `src/components/tutorial.tsx`,
  montado em `src/app/(app)/layout.tsx` e em `src/app/campo/page.tsx`.
- Permissões: o tutorial com `permissao` só aparece para quem tem a chave (`"master"` = só o master); passo com
  `permissao` some para quem não tem. O servidor manda ao navegador só as chaves citadas nos tutoriais que a pessoa tem.
- Alvos: `data-tour="titulo|acoes|filtros|busca|novo|lista|indicadores|periodo"` já estão nos primitivos
  (`ui.tsx`, `cadastro.tsx`, contas a pagar/receber); um cartão é achado pelo título (`data-cartao`). Passo cujo
  elemento não está visível (outra versão do celular, lista vazia, sem permissão) é pulado sozinho.
- "Já viu": tabela `tutoriais_vistos` (por usuário, RLS só dele; `*` = automático desligado) e cópia no
  `localStorage`, para o app de campo sem sinal.
- Testes automáticos (Playwright, `navigator.webdriver`) não recebem o tour automático.

Tela nova: acrescente uma entrada em `TUTORIAIS` com a rota (`/rota` ou `/rota/[id]`); o teste
`src/lib/tutoriais.test.ts` confere que a rota existe, que todo módulo do menu tem tutorial e que as chaves e as marcas
`data-tour` existem.
