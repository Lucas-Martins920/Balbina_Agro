"use client";

import { useState } from "react";
import { Campo, Selecao } from "@/components/ui";
import { LINHAS_FORMULA } from "@/lib/estoque";
import { formatarNumero, lerDecimal } from "@/lib/formato";
import { resumoFormula } from "@/lib/formula-racao";

// Linhas da fórmula com o total da batida e a parte de cada ingrediente na hora.
// A batida pode ter qualquer total (não precisa fechar 1.000 kg).
export function LinhasFormula({ ingredientes }: { ingredientes: { id: string; nome: string }[] }) {
  const [medida, setMedida] = useState<"kg" | "pct">("kg");
  const [qtds, setQtds] = useState<string[]>(() => Array(LINHAS_FORMULA).fill(""));
  const [totalPct, setTotalPct] = useState("1000");
  const valores = qtds.map((q) => lerDecimal(q) ?? 0);
  const soma = valores.reduce((s, v) => s + v, 0);
  const totalBatida = lerDecimal(totalPct) ?? 0;
  const kgs = medida === "kg" ? valores : valores.map((v) => (v * totalBatida) / 100);
  const { total, percentuais } = resumoFormula(kgs);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Selecao rotulo="Quantidades em" id="f_medida" name="medida" value={medida} onChange={(e) => setMedida(e.target.value as "kg" | "pct")}>
          <option value="kg">kg na batida (qualquer total)</option>
          <option value="pct">% da mistura (somam 100)</option>
        </Selecao>
        {medida === "pct" && (
          <Campo rotulo="Total da batida (kg)" id="f_total" name="total_kg" inputMode="decimal" value={totalPct} onChange={(e) => setTotalPct(e.target.value)} />
        )}
      </div>
      {qtds.map((q, i) => (
        <div key={i} className="grid grid-cols-[2fr_1fr_4rem] items-end gap-3">
          <Selecao rotulo={i === 0 ? "Ingrediente" : ""} aria-label={`Ingrediente ${i + 1}`} id={`f_ins_${i}`} name={`insumo_${i}`} defaultValue="">
            <option value="">—</option>
            {ingredientes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </Selecao>
          <Campo rotulo={i === 0 ? (medida === "kg" ? "kg" : "%") : ""} aria-label={`Quantidade ${i + 1}`} id={`f_kg_${i}`} name={`kg_${i}`} inputMode="decimal"
            value={q} onChange={(e) => setQtds((v) => v.map((x, j) => (j === i ? e.target.value : x)))} />
          <span className="pb-2.5 text-right text-xs tabular-nums text-texto-suave">{valores[i] > 0 && medida === "kg" ? `${formatarNumero(percentuais[i], 1)}%` : ""}</span>
        </div>
      ))}
      <p className="text-sm tabular-nums" aria-live="polite">
        Total da batida: <strong>{formatarNumero(total, 1)} kg</strong>
        {medida === "pct" && <span className={Math.abs(soma - 100) > 0.05 && soma > 0 ? " text-perigo" : " text-texto-suave"}> · percentuais somam {formatarNumero(soma, 2)}%</span>}
      </p>
      <p className="text-xs text-texto-suave">A batida pode ter qualquer peso (ex.: 1.050 kg ou 600 kg). O custo por tonelada e a produção usam a proporção de cada ingrediente.</p>
    </>
  );
}
