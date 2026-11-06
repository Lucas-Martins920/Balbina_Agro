"use client";

import { useEffect, useRef, useState } from "react";
import { CLASSE_CONTROLE, classeBotao, Selecao } from "@/components/ui";
import { formatarMoeda, lerCentavos } from "@/lib/formato";
import { restanteDoRateio } from "@/lib/rateio";

type Opcao = { id: string; nome: string; grupo?: string };
export type LinhaInicial = { categoria_id: string | null; centro_custo_id: string | null; valor_cents?: number | null; descricao?: string | null };
type Linha = { chave: number; categoria: string; centro: string; valor: string; descricao: string };

const emReais = (c: number) => (c / 100).toFixed(2).replace(".", ",");

function montar(inicial: LinhaInicial[] | undefined): Linha[] {
  const base = inicial?.length ? inicial : [{ categoria_id: null, centro_custo_id: null }];
  return base.map((l, i) => ({
    chave: i, categoria: l.categoria_id ?? "", centro: l.centro_custo_id ?? "",
    valor: base.length > 1 && l.valor_cents ? emReais(l.valor_cents) : "", descricao: l.descricao ?? "",
  }));
}

// Linhas de rateio (categoria + centro de custo + valor + descrição). Com uma linha só, o valor é o total.
// O total vem de `total` (centavos, ex.: valor do extrato) ou do campo `campoTotal` do mesmo formulário;
// com ele a tela mostra quanto falta distribuir. Os campos são lidos por lerRateio (src/lib/rateio.ts).
export function Rateio({ categorias, centros, total, campoTotal, inicial, prefixo = "rateio", rotuloCentro = "Centro de custo" }: {
  categorias: Opcao[]; centros: Opcao[]; total?: number; campoTotal?: string; inicial?: LinhaInicial[]; prefixo?: string; rotuloCentro?: string;
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() => montar(inicial));
  const [proximo, setProximo] = useState(linhas.length);
  const [totalDoCampo, setTotalDoCampo] = useState<number | null>(null);
  const ref = useRef<HTMLFieldSetElement>(null);
  const varias = linhas.length > 1;
  const grupos = [...new Set(categorias.map((c) => c.grupo ?? ""))];
  const totalCents = total ?? totalDoCampo;
  const restante = totalCents != null && varias ? restanteDoRateio(linhas.map((l) => l.valor), totalCents) : null;

  // Acompanha o campo de total do formulário e volta ao estado inicial quando o formulário é limpo.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const ler = () => {
      if (!campoTotal) return;
      const campo = form.elements.namedItem(campoTotal);
      setTotalDoCampo(campo instanceof HTMLInputElement ? lerCentavos(campo.value) : null);
    };
    const limpar = () => { setLinhas(montar(inicial)); setTimeout(ler, 0); };
    ler();
    form.addEventListener("input", ler);
    form.addEventListener("reset", limpar);
    return () => { form.removeEventListener("input", ler); form.removeEventListener("reset", limpar); };
  }, [campoTotal, inicial]);

  const mudar = (chave: number, campo: keyof Omit<Linha, "chave">, valor: string) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));

  const adicionar = () => {
    // a partir da 3ª linha, a nova já vem com o que falta distribuir
    const valor = varias && restante != null && restante > 0 ? emReais(restante) : "";
    setLinhas([...linhas, { chave: proximo, categoria: "", centro: "", valor, descricao: "" }]);
    setProximo(proximo + 1);
  };

  const completar = () => {
    if (restante == null) return;
    const ultima = linhas[linhas.length - 1];
    const novo = (lerCentavos(ultima.valor) ?? 0) + restante;
    if (novo > 0) mudar(ultima.chave, "valor", emReais(novo));
  };

  return (
    <fieldset ref={ref} className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{varias ? "Rateio entre categorias e centros de custo" : `Categoria e ${rotuloCentro.toLowerCase()}`}</legend>
      {linhas.map((l, i) => {
        const categoria = (
          <Selecao rotulo="Categoria" id={`${prefixo}_categoria_${l.chave}`} name="rateio_categoria" required
            value={l.categoria} onChange={(e) => mudar(l.chave, "categoria", e.target.value)}>
            <option value="" disabled>Escolha…</option>
            {grupos.map((g) => (
              <optgroup key={g} label={g}>
                {categorias.filter((c) => (c.grupo ?? "") === g).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </optgroup>
            ))}
          </Selecao>
        );
        const centro = (
          <Selecao rotulo={rotuloCentro} id={`${prefixo}_cc_${l.chave}`} name="rateio_cc" value={l.centro} onChange={(e) => mudar(l.chave, "centro", e.target.value)}>
            <option value="">Nenhum</option>
            {centros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
        );
        if (!varias) {
          return (
            <div key={l.chave} className="grid gap-2 sm:grid-cols-2">
              {categoria}{centro}
              <input type="hidden" name="rateio_valor" value="" />
              <input type="hidden" name="rateio_descricao" value="" />
            </div>
          );
        }
        return (
          <div key={l.chave} className="flex flex-col gap-2 rounded-xl border border-borda/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-texto-suave">Linha {i + 1}</span>
              <button type="button" className={classeBotao("fantasma", "sm")} aria-label={`Remover linha ${i + 1}`}
                onClick={() => setLinhas(linhas.filter((x) => x.chave !== l.chave))}>
                remover
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {categoria}{centro}
              <label className="flex flex-col gap-1.5 text-sm" htmlFor={`${prefixo}_valor_${l.chave}`}>
                <span className="font-medium">Valor (R$)</span>
                <input id={`${prefixo}_valor_${l.chave}`} name="rateio_valor" inputMode="decimal" required placeholder="0,00"
                  value={l.valor} onChange={(e) => mudar(l.chave, "valor", e.target.value)} className={`h-10 tabular-nums ${CLASSE_CONTROLE}`} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm" htmlFor={`${prefixo}_descricao_${l.chave}`}>
                <span className="font-medium">Descrição <span className="font-normal text-texto-suave">(opcional)</span></span>
                <input id={`${prefixo}_descricao_${l.chave}`} name="rateio_descricao" maxLength={200} placeholder="Ex.: 10 sacos de milho"
                  value={l.descricao} onChange={(e) => mudar(l.chave, "descricao", e.target.value)} className={`h-10 ${CLASSE_CONTROLE}`} />
              </label>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={classeBotao("secundario", "sm")} onClick={adicionar}>
          {varias ? "+ mais uma linha" : "+ dividir em várias categorias ou centros de custo"}
        </button>
        {restante != null && (
          <span role="status" className={`text-sm tabular-nums ${restante === 0 ? "text-positivo" : restante > 0 ? "text-alerta" : "text-perigo"}`}>
            {restante === 0
              ? `Fecha com o total de ${formatarMoeda(totalCents)}`
              : restante > 0 ? `Falta distribuir ${formatarMoeda(restante)} de ${formatarMoeda(totalCents)}`
                : `Passou ${formatarMoeda(-restante)} do total de ${formatarMoeda(totalCents)}`}
          </span>
        )}
        {restante != null && restante !== 0 && (lerCentavos(linhas[linhas.length - 1].valor) ?? 0) + restante > 0 && (
          <button type="button" className={classeBotao("fantasma", "sm")} onClick={completar}>Ajustar a última linha</button>
        )}
      </div>
    </fieldset>
  );
}
