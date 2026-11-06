// Barra lateral recolhida (só o trilho de ícones) ou aberta. A escolha fica no aparelho (localStorage) e marca
// <html class="lateral-recolhida">: o CSS (variante `recolhida:` de globals.css) troca o que aparece e a largura da
// coluna, então a página já pinta no estado certo, sem piscar. Sem escolha salva, telas abaixo de 1280px (tablet,
// notebook pequeno) começam recolhidas para sobrar espaço para o conteúdo.
export const CHAVE_LATERAL = "balbina-lateral";
export const CLASSE_RECOLHIDA = "lateral-recolhida";
export const EVENTO_LATERAL = "balbina-lateral";

export const SCRIPT_LATERAL = `try{var s=localStorage.getItem("${CHAVE_LATERAL}");if(s==="recolhida"||(s!=="aberta"&&innerWidth<1280))document.documentElement.classList.add("${CLASSE_RECOLHIDA}")}catch(e){}`;

export function lateralRecolhida() {
  return document.documentElement.classList.contains(CLASSE_RECOLHIDA);
}

export function definirLateral(recolhida: boolean) {
  document.documentElement.classList.toggle(CLASSE_RECOLHIDA, recolhida);
  try {
    localStorage.setItem(CHAVE_LATERAL, recolhida ? "recolhida" : "aberta");
  } catch {
    // navegação privada: vale só para esta aba
  }
  window.dispatchEvent(new Event(EVENTO_LATERAL));
}

export function assinarLateral(avisar: () => void) {
  window.addEventListener(EVENTO_LATERAL, avisar);
  return () => window.removeEventListener(EVENTO_LATERAL, avisar);
}

// Espiar: com a barra recolhida, passar o mouse sobre o trilho abre o painel por cima do conteúdo (sem empurrar a
// página) e tirar o mouse recolhe de novo. Marca <html class="lateral-espiando">, que desliga a variante `recolhida:`
// enquanto vale. Só no computador com mouse: toque, caneta, tela estreita (modo celular) e a versão completa no
// celular continuam abrindo pelo botão. Com a barra fixada aberta, nada muda ao passar ou tirar o mouse.
export const CLASSE_ESPIANDO = "lateral-espiando";
export const CONSULTA_MOUSE = "(hover: hover) and (pointer: fine) and (width >= 48rem)";
// Atraso para abrir: o cursor que só cruza a borda a caminho da página não abre a barra.
export const ATRASO_ABRIR = 150;
// Atraso para recolher: sair um instante da barra (ou passar de raspão pela borda) não a fecha e reabre piscando.
export const ATRASO_RECOLHER = 350;

export function podeEspiar(p: { recolhida: boolean; ponteiro: string; telaComMouse: boolean; versaoCompleta: boolean }) {
  return p.recolhida && p.ponteiro === "mouse" && p.telaComMouse && !p.versaoCompleta;
}

export function definirEspiando(espiando: boolean) {
  document.documentElement.classList.toggle(CLASSE_ESPIANDO, espiando);
}
