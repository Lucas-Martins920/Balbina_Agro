"use client";

import { useId, useState } from "react";
import { CLASSE_CONTROLE } from "@/components/ui";
import { centavosParaCampo, formatarData, formatarMoeda, formatarNumero, lerCentavos } from "@/lib/formato";
import { textoKg } from "@/lib/pescado";
import { resultadoCiclo, type BaseCiclo } from "@/lib/previsao";

// Simulador do resultado do ciclo: a pessoa muda o preço do kg e vê na hora a receita, o lucro e o preço mínimo
// para empatar. A conta é a mesma de resultadoCiclo (src/lib/previsao.ts), que tem teste.
export function SimuladorCiclo({ base, precoSugeridoCents, origemPreco, dataDespesca }: {
  base: BaseCiclo;
  precoSugeridoCents: number | null;
  origemPreco: string;
  dataDespesca: string | null;
}) {
  const id = useId();
  const [texto, setTexto] = useState(centavosParaCampo(precoSugeridoCents));
  const preco = lerCentavos(texto);
  const r = preco === null ? null : resultadoCiclo(base, preco);
  const variacoes = preco === null ? [] : [-0.1, 0, 0.1].map((v) => ({ v, r: resultadoCiclo(base, Math.round(preco * (1 + v))) }));
  const equilibrio = resultadoCiclo(base, 0).precoEquilibrioCents;
  // posição do preço digitado na régua entre 0 e o dobro do preço de equilíbrio
  const escala = equilibrio ? equilibrio * 2 : null;
  const pos = (c: number) => (escala ? Math.min(100, Math.max(0, (c / escala) * 100)) : 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <label htmlFor={id} className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Preço de venda do kg (R$)</span>
          <input id={id} inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: 12,50"
            className={`h-11 w-40 font-display text-lg font-semibold tabular-nums ${CLASSE_CONTROLE}`} />
        </label>
        <p className="max-w-[46ch] pb-1 text-xs text-texto-suave">{origemPreco}</p>
      </div>

      {r === null ? (
        <p className="text-sm text-texto-suave">Informe o preço do kg para ver o resultado do ciclo.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-linha ring-1 ring-borda lg:grid-cols-4">
            {[
              { rotulo: "Receita prevista", valor: formatarMoeda(r.receitaCents), detalhe: `${textoKg(r.kgTotal, 0)} no ciclo` },
              { rotulo: "Custo do ciclo", valor: formatarMoeda(r.custoTotalCents), detalhe: `${formatarMoeda(base.custoFuturoCents)} ainda por gastar` },
              { rotulo: r.lucroCents >= 0 ? "Lucro previsto" : "Prejuízo previsto", valor: formatarMoeda(Math.abs(r.lucroCents)), detalhe: r.margemPct === null ? "" : `margem de ${formatarNumero(r.margemPct, 1)}%`, tom: r.lucroCents >= 0 ? "text-positivo" : "text-perigo" },
              { rotulo: "Preço de equilíbrio", valor: r.precoEquilibrioCents === null ? "–" : `${formatarMoeda(r.precoEquilibrioCents)}/kg`, detalhe: "abaixo dele o ciclo não se paga" },
            ].map((c) => (
              <div key={c.rotulo} className="bg-superficie p-4">
                <dt className="text-[13px] text-texto-suave">{c.rotulo}</dt>
                <dd className={`mt-1 font-display text-[24px] leading-tight font-semibold tabular-nums ${c.tom ?? ""}`}>{c.valor}</dd>
                {c.detalhe && <dd className="mt-1 text-xs text-texto-suave">{c.detalhe}</dd>}
              </div>
            ))}
          </dl>

          {equilibrio !== null && preco !== null && (
            <div aria-hidden className="relative h-9">
              <div className="absolute inset-x-0 top-3.5 h-2 overflow-hidden rounded-full bg-elevado ring-1 ring-inset ring-borda">
                <div className="absolute inset-y-0 left-0 bg-[var(--etiqueta-perigo)]" style={{ width: "50%" }} />
                <div className="absolute inset-y-0 right-0 bg-[var(--etiqueta-positivo)]" style={{ width: "50%" }} />
              </div>
              <span className="absolute top-1 h-7 w-px bg-texto/40" style={{ left: "50%" }} />
              <span className="absolute top-2 size-5 -translate-x-1/2 rounded-full border-[3px] border-solido bg-marca shadow transition-[left] duration-300 ease-out" style={{ left: `${pos(preco)}%` }} />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <p className="text-[13px] font-medium text-texto-suave">Se o preço variar</p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {variacoes.map(({ v, r: x }) => (
                <li key={v} className={`flex items-baseline justify-between gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-inset ${v === 0 ? "bg-marca-suave/60 ring-marca/30" : "bg-elevado/60 ring-borda"}`}>
                  <span className="text-texto-suave">{v === 0 ? "Preço digitado" : `${v > 0 ? "+" : "−"}10% (${formatarMoeda(Math.round(preco! * (1 + v)))})`}</span>
                  <span className={`font-semibold tabular-nums ${x.lucroCents >= 0 ? "text-positivo" : "text-perigo"}`}>
                    {x.lucroCents >= 0 ? "+" : "−"}{formatarMoeda(Math.abs(x.lucroCents))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <p className="text-xs text-texto-suave">
        Custo já apurado: {formatarMoeda(base.custoAteAgoraCents)} (meses fechados no custo do kg).{" "}
        {dataDespesca
          ? `Até a despesca, por volta de ${formatarData(dataDespesca)} (${base.semanasRestantes} ${base.semanasRestantes === 1 ? "semana" : "semanas"}), a ração vem da projeção pela curva e os outros custos seguem o ritmo do último mês.`
          : "Sem data de despesca prevista (defina o peso de despesca do lote), a conta vende a biomassa de hoje."}{" "}
        É uma estimativa: confira com o custo do kg no fim de cada mês.
      </p>
    </div>
  );
}
