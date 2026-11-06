"use client";

import { useEffect, useRef } from "react";

// No celular as tabelas viram lista de cartões (CSS `.tabela-cartoes` em globals.css): cada linha é um cartão e cada
// célula mostra o nome da coluna ao lado do valor. Este componente copia o texto do cabeçalho para `data-rotulo` em
// cada célula e marca a coluna principal (título do cartão). Observa o corpo da tabela porque listas filtradas no
// cliente trocam as linhas sem recarregar a página. `ocultar` são colunas de detalhe que somem no cartão.
export function RotulosCelular({ principal = 0, ocultar = [] }: { principal?: number; ocultar?: number[] }) {
  const chaveOcultar = ocultar.join(",");
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tabela = ref.current?.parentElement?.querySelector("table");
    if (!tabela) return;
    const ocultas = new Set(chaveOcultar ? chaveOcultar.split(",").map(Number) : []);
    const rotular = () => {
      // Colunas de ação (cabeçalho vazio ou só para leitor de tela) ficam sem rótulo no cartão.
      const nomes = [...tabela.querySelectorAll("thead th")].map((th) =>
        [...th.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains("sr-only"))).map((n) => n.textContent).join("").trim());
      for (const linha of tabela.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
        let coluna = 0;
        for (const celula of linha.cells) {
          if (celula.tagName === "TD") {
            const nome = celula.colSpan > 1 ? "" : nomes[coluna] ?? "";
            if (celula.dataset.rotulo !== nome) celula.dataset.rotulo = nome;
            if (coluna === principal && celula.colSpan === 1) celula.dataset.principal = "";
            else delete celula.dataset.principal;
            if (ocultas.has(coluna)) celula.dataset.oculto = "";
            else delete celula.dataset.oculto;
          }
          coluna += celula.colSpan;
        }
      }
    };
    rotular();
    const observador = new MutationObserver(rotular);
    observador.observe(tabela, { childList: true, subtree: true });
    return () => observador.disconnect();
  }, [principal, chaveOcultar]);
  return <span ref={ref} hidden />;
}
