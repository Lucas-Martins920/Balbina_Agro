"use client";

import { useState, type CSSProperties } from "react";
import { formatarInteiro, formatarMoeda } from "@/lib/formato";
import { escala, Legenda, moedaCurta, type Serie } from "@/components/graficos";

// Gráficos do planejamento, no mesmo desenho de graficos.tsx (HTML, grade fina, dica ao passar o mouse, tabela para leitor
// de tela), mas com colunas empilhadas e unidades além de dinheiro.

// "moeda", ou o sufixo da quantidade ("peixes", "ct", "cx", "dz")
type Unidade = "moeda" | "peixes" | (string & {});

function curto(v: number, u: Unidade) {
  if (u === "moeda") return moedaCurta(v);
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1).replace(".", ",").replace(",0", "")} mi`;
  if (a >= 1e3) return `${Math.round(v / 1e3)} mil`;
  return String(Math.round(v));
}
function cheio(v: number, u: Unidade) {
  return u === "moeda" ? formatarMoeda(v) : `${formatarInteiro(Math.round(v))} ${u}`;
}

// Colunas empilhadas por período, com uma linha de referência opcional (ex.: capacidade dos viveiros).
export function ColunasEmpilhadas({ rotulos, series, unidade, rotulo, referencia }: {
  rotulos: string[]; series: Serie[]; unidade: Unidade; rotulo: string; referencia?: { nome: string; valor: number; cor: string };
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const totais = rotulos.map((_, i) => series.reduce((s, x) => s + x.valores[i], 0));
  const { fim, marcas } = escala(0, Math.max(1, ...totais, referencia?.valor ?? 0));
  const y = (v: number) => (v / fim) * 100;
  const n = rotulos.length;
  const passoRotulo = n > 18 ? 3 : n > 12 ? 2 : 1;

  return (
    <figure className="flex flex-col gap-3">
      <Legenda series={[...series, ...(referencia ? [{ nome: referencia.nome, cor: referencia.cor, tracejado: true }] : [])]} />
      <div className="relative h-64 pt-2 pb-6 pl-14" onPointerLeave={() => setAtivo(null)}>
        <div className="relative h-full">
          {marcas.map((m) => (
            <div key={m} className="absolute inset-x-0 border-t border-linha" style={{ bottom: `${y(m)}%` }}>
              <span className="absolute top-0 -left-14 w-12 -translate-y-1/2 text-right text-[11px] whitespace-nowrap text-texto-suave tabular-nums">{curto(m, unidade)}</span>
            </div>
          ))}
          {referencia && (
            <div aria-hidden className="absolute inset-x-0 border-t-2 border-dashed" style={{ bottom: `${y(referencia.valor)}%`, borderColor: referencia.cor }} />
          )}
          <div className="absolute inset-0 flex">
            {rotulos.map((r, i) => (
              <div key={r} tabIndex={0} aria-label={`${r}: ${series.map((s) => `${s.nome} ${cheio(s.valores[i], unidade)}`).join(", ")}`}
                onPointerEnter={() => setAtivo(i)} onFocus={() => setAtivo(i)} onBlur={() => setAtivo(null)}
                className={`crescer-y relative flex flex-1 flex-col-reverse items-center rounded-lg transition-colors duration-150 ${ativo === i ? "bg-elevado/70" : ""}`}
                style={{ "--i": i } as CSSProperties}>
                {series.map((s, k) => (
                  <div key={s.nome} className={`w-[70%] max-w-[22px] ${k === series.length - 1 || series.slice(k + 1).every((x) => !x.valores[i]) ? "rounded-t-[4px]" : ""}`}
                    style={{ height: `${y(s.valores[i])}%`, background: s.cor, marginTop: s.valores[i] > 0 ? 1 : 0 }} />
                ))}
                {/* no celular só metade dos rótulos cabe */}
                {i % passoRotulo === 0 && (
                  <span className={`absolute -bottom-6 text-[11px] whitespace-nowrap text-texto-suave ${i % (passoRotulo * 2) ? "hidden sm:inline" : ""}`}>{r}</span>
                )}
              </div>
            ))}
          </div>
          {ativo !== null && (
            <div role="status" className="pointer-events-none absolute top-0 z-10 min-w-44 rounded-xl border border-borda bg-solido px-3 py-2 text-xs shadow-[var(--sombra)]"
              style={{ left: `${((ativo + 0.5) / n) * 100}%`, transform: `translateX(${ativo / n < 0.2 ? "0%" : ativo / n > 0.8 ? "-100%" : "-50%"})` }}>
              <p className="mb-1 font-medium">{rotulos[ativo]}</p>
              {series.map((s) => (
                <p key={s.nome} className="flex items-center gap-2 py-0.5">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: s.cor }} />
                  <span className="text-texto-suave">{s.nome}</span>
                  <span className="ml-auto pl-3 font-medium tabular-nums">{cheio(s.valores[ativo], unidade)}</span>
                </p>
              ))}
              {series.length > 1 && (
                <p className="mt-1 flex border-t border-linha pt-1"><span className="text-texto-suave">Total</span><span className="ml-auto font-medium tabular-nums">{cheio(totais[ativo], unidade)}</span></p>
              )}
            </div>
          )}
        </div>
      </div>
      <table className="sr-only">
        <caption>{rotulo}</caption>
        <thead><tr><th>Período</th>{series.map((s) => <th key={s.nome}>{s.nome}</th>)}</tr></thead>
        <tbody>{rotulos.map((r, i) => <tr key={r}><td>{r}</td>{series.map((s) => <td key={s.nome}>{cheio(s.valores[i], unidade)}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}

// Barras horizontais com sinal: resultado de cada lote, verde quando dá lucro e vermelho quando dá prejuízo.
export function BarrasResultado({ itens }: { itens: { nome: string; valor: number; detalhe?: string }[] }) {
  if (itens.length === 0) return <p className="text-sm text-texto-suave">Nenhum lote futuro no plano.</p>;
  const max = Math.max(1, ...itens.map((i) => Math.abs(i.valor)));
  const temNegativo = itens.some((i) => i.valor < 0);
  return (
    <ul className="-mx-2 flex flex-col">
      {itens.map((i) => (
        <li key={i.nome} className="rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-elevado/60">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{i.nome}{i.detalhe && <span className="ml-1.5 text-xs text-texto-suave">{i.detalhe}</span>}</span>
            <span className={`font-medium tabular-nums ${i.valor < 0 ? "text-perigo" : "text-positivo"}`}>{formatarMoeda(i.valor)}</span>
          </div>
          <div className="mt-1.5 flex h-2">
            {temNegativo && (
              <div className="flex w-1/2 justify-end rounded-l-full bg-elevado">
                {i.valor < 0 && <div className="crescer-x h-2 rounded-l-full bg-perigo [transform-origin:right]" style={{ width: `${(-i.valor / max) * 100}%` }} />}
              </div>
            )}
            <div className={`flex ${temNegativo ? "w-1/2 rounded-r-full" : "w-full rounded-full"} bg-elevado`}>
              {i.valor > 0 && <div className="crescer-x h-2 rounded-full bg-positivo" style={{ width: `${(i.valor / max) * 100}%` }} />}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
