// Versão completa no celular: a página passa a ser desenhada com 1280px de largura, como no computador (lateral com
// todos os módulos, tabelas inteiras), e a pessoa aproxima com os dedos. Sem ela, o celular mostra a versão simples,
// focada na operação do dia. A escolha fica num cookie do aparelho (`balbina-versao`), lido pelo servidor em
// generateViewport (src/app/(app)/layout.tsx): o Safari do iPhone ignorava o <meta viewport> trocado por script.
export const CHAVE_VERSAO = "balbina-versao";
export const LARGURA_COMPLETA = 1280;

// Roda no começo do <body>. Marca <html class="completa"> pelo cookie e define `--escala-versao`, que aumenta o
// seletor flutuante na mesma proporção em que a página encolhe, para ele ficar do tamanho de um botão normal.
// Quem escolheu a versão completa antes do cookie (localStorage) é migrado aqui; recarrega uma vez para o servidor
// mandar a largura certa.
export const SCRIPT_VERSAO = `try{var h=document.documentElement,c=document.cookie.indexOf("${CHAVE_VERSAO}=completa")>=0;if(!c&&localStorage.getItem("${CHAVE_VERSAO}")==="completa"){localStorage.removeItem("${CHAVE_VERSAO}");document.cookie="${CHAVE_VERSAO}=completa; path=/; max-age=31536000; samesite=lax";location.reload()}if(c){h.classList.add("completa");h.style.setProperty("--escala-versao",String(Math.max(1,${LARGURA_COMPLETA}/Math.min(screen.width,screen.height))))}}catch(e){}`;
