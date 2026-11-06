"use client";

import { useState, type PointerEvent } from "react";
import { escala } from "@/components/graficos";
import type { LoteTanque } from "@/lib/campo/tipos";
import { fmt } from "./pecas";

const COR_REAL = "var(--marca)";
const COR_PADRAO = "var(--texto-suave)";

const peso = (g: number) => (g >= 1000 ? `${fmt(g / 1000, 2)} kg` : `${fmt(g, 0)} g`);
const pesoCurto = (g: number) => (g >= 1000 ? `${fmt(g / 1000, 1)} kg` : `${fmt(g, 0)} g`);

// Curva de crescimento do lote no celular: o peso do lote semana a semana (biometrias levadas pela curva) contra
// a curva padrão da espécie, com as biometrias marcadas. Arrastar o dedo mostra a semana.
export function GraficoCrescimento({ lote }: { lote: LoteTanque }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const pontos = [...lote.curva].sort((a, b) => a.semana - b.semana);
  const dia0 = Date.parse(`${lote.povoamento}T12:00:00Z`);
  const medidas = lote.biometrias
    .map((b) => ({ ...b, semana: (Date.parse(`${b.data}T12:00:00Z`) - dia0) / (7 * 86_400_000) }))
    .filter((b) => b.semana >= 0 && b.peso_g > 0);
  if (pontos.length < 2) {
    return <p className="rounded-2xl bg-elevado/60 px-4 py-6 text-center text-sm text-texto-suave">A curva aparece depois da primeira semana do lote.</p>;
  }

  const maxSemana = Math.max(1, pontos.at(-1)!.semana, ...medidas.map((m) => m.semana));
  const maxPeso = Math.max(1, ...pontos.flatMap((p) => [p.real ?? 0, p.padrao ?? 0]), ...medidas.map((m) => m.peso_g));
  const { fim, marcas } = escala(0, maxPeso, 3);
  const x = (semana: number) => (semana / maxSemana) * 100;
  const y = (g: number) => (g / fim) * 100;
  const caminho = (chave: "real" | "padrao") =>
    pontos.filter((p) => p[chave] !== null).map((p, i) => `${i ? "L" : "M"}${x(p.semana) * 10},${300 - y(p[chave]!) * 3}`).join(" ");

  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    const semana = ((e.clientX - caixa.left) / caixa.width) * maxSemana;
    let perto = 0;
    pontos.forEach((p, i) => { if (Math.abs(p.semana - semana) < Math.abs(pontos[perto].semana - semana)) perto = i; });
    setAtivo(perto);
  };
  const p = ativo !== null ? pontos[ativo] : null;
  const ultimo = [...pontos].reverse().find((q) => q.real !== null);
  const descricao = `Curva de crescimento do lote ${lote.codigo}: ${ultimo ? `${peso(ultimo.real!)} na semana ${ultimo.semana}` : "sem peso"}${ultimo?.padrao ? `, padrão da espécie ${peso(ultimo.padrao)}` : ""}.`;

  return (
    <figure className="flex flex-col gap-3">
      <div className="relative h-48 pt-2 pb-6 pl-11" role="img" aria-label={descricao}>
        <div className="relative h-full">
          {marcas.map((m) => (
            <div key={m} className="absolute inset-x-0 border-t border-linha" style={{ bottom: `${y(m)}%` }}>
              <span className="absolute top-0 -left-11 w-9 -translate-y-1/2 text-right text-[10px] whitespace-nowrap text-texto-suave tabular-nums">{pesoCurto(m)}</span>
            </div>
          ))}
          <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden className="revelar-x absolute inset-0 h-full w-full overflow-visible">
            <path d={caminho("padrao")} fill="none" stroke={COR_PADRAO} strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
            <path d={caminho("real")} fill="none" stroke={COR_REAL} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {medidas.map((m) => (
            <span key={m.data} aria-hidden className="absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-marca bg-solido"
              style={{ left: `${x(m.semana)}%`, bottom: `${y(m.peso_g)}%` }} />
          ))}
          {[0, maxSemana].map((s, k) => (
            <span key={s} className={`absolute -bottom-6 text-[10px] whitespace-nowrap text-texto-suave tabular-nums ${k ? "-translate-x-full" : ""}`} style={{ left: `${x(s)}%` }}>
              {k ? `semana ${fmt(maxSemana, 0)}` : "povoamento"}
            </span>
          ))}
          {p && (
            <>
              <div aria-hidden className="absolute inset-y-0 w-px bg-texto-suave/30" style={{ left: `${x(p.semana)}%` }} />
              <div aria-hidden className={`absolute top-0 z-10 min-w-36 rounded-xl bg-solido px-3 py-2 text-xs shadow-[var(--sombra-cristal)] ${x(p.semana) > 55 ? "-translate-x-full" : ""}`}
                style={{ left: `${x(p.semana)}%` }}>
                <p className="mb-0.5 font-semibold">Semana {p.semana}</p>
                {p.real !== null && <p className="flex justify-between gap-3"><span className="text-texto-suave">Lote</span><span className="font-medium tabular-nums">{peso(p.real)}</span></p>}
                {p.padrao !== null && <p className="flex justify-between gap-3"><span className="text-texto-suave">Padrão</span><span className="tabular-nums">{peso(p.padrao)}</span></p>}
              </div>
            </>
          )}
          <div className="absolute inset-0 touch-pan-y" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setAtivo(null)} />
        </div>
      </div>
      {/* Legenda com a mesma marca de cada série: linha cheia, linha tracejada e o ponto da pesagem */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-suave">
        <li className="flex items-center gap-1.5"><span aria-hidden className="w-3.5 rounded-full border-t-[2.5px]" style={{ borderColor: COR_REAL }} />Peso do lote</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="w-3.5 border-t-2 border-dashed opacity-60" style={{ borderColor: COR_PADRAO }} />Padrão da espécie</li>
        {medidas.length > 0 && <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-full border-2 border-marca bg-solido" />Biometria</li>}
      </ul>
      <table className="sr-only">
        <caption>Peso médio por semana do lote {lote.codigo}</caption>
        <thead><tr><th>Semana</th><th>Lote</th><th>Padrão</th></tr></thead>
        <tbody>
          {pontos.map((q) => (
            <tr key={q.semana}><td>{q.semana}</td><td>{q.real !== null ? peso(q.real) : "—"}</td><td>{q.padrao !== null ? peso(q.padrao) : "—"}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
