"use client";

import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { formatarMoeda } from "@/lib/formato";

// Gráficos do painel em HTML + SVG, sem biblioteca. Regras (skill dataviz): marcas finas, cantos de 4px
// só na ponta do dado, grade de 1px recessiva, texto sempre na cor de texto (a cor fica na marca ao lado),
// dica ao passar o mouse e uma tabela escondida para leitor de tela.

export type Serie = { nome: string; cor: string; valores: number[] };

// R$ 12 mil, R$ 1,2 mi: para eixos, onde o valor exato fica na dica.
export function moedaCurta(centavos: number) {
  const v = centavos / 100, a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toFixed(1).replace(".", ",").replace(",0", "")} mi`;
  if (a >= 1e3) return `${s}R$ ${Math.round(a / 1e3)} mil`;
  return `${s}R$ ${Math.round(a)}`;
}

// Gráficos que não são dinheiro (kg de peixe e de ração, taxas) passam a unidade; o padrão continua sendo moeda.
export type Unidade = "moeda" | "numero" | "pct" | "kg";
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const umaCasa = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
function formatoLongo(v: number, u: Unidade) {
  return u === "moeda" ? formatarMoeda(v) : u === "pct" ? `${umaCasa.format(v)}%` : u === "kg" ? `${inteiro.format(v)} kg` : inteiro.format(v);
}
function formatoCurto(v: number, u: Unidade) {
  if (u === "moeda") return moedaCurta(v);
  if (u === "pct") return `${umaCasa.format(v)}%`;
  const a = Math.abs(v);
  if (u === "kg") return a >= 1e3 ? `${umaCasa.format(v / 1e3)} t` : `${inteiro.format(v)} kg`;
  return a >= 1e6 ? `${umaCasa.format(v / 1e6)} mi` : a >= 1e4 ? `${inteiro.format(v / 1e3)} mil` : inteiro.format(v);
}

// Escala com degraus redondos (1, 2, 2,5 ou 5 × 10^n) cobrindo [min, max].
export function escala(min: number, max: number, alvo = 4) {
  const bruto = Math.max(1, (max - min) / alvo);
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= bruto) ?? 10 * pot;
  const ini = Math.floor(min / passo) * passo, fim = Math.ceil(max / passo) * passo || passo;
  const marcas: number[] = [];
  for (let v = ini; v <= fim + passo / 2; v += passo) marcas.push(v);
  return { ini, fim, marcas };
}

export function Legenda({ series }: { series: { nome: string; cor: string; tracejado?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-suave">
      {series.map((s) => (
        <li key={s.nome} className="flex items-center gap-1.5">
          {s.tracejado ? <span aria-hidden className="w-3 border-t-2 border-dashed" style={{ borderColor: s.cor }} />
            : <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.cor }} />}
          {s.nome}
        </li>
      ))}
    </ul>
  );
}

function Dica({ x, children }: { x: number; children: ReactNode }) {
  // Presa dentro do gráfico: perto das bordas ela cresce para dentro.
  const desloc = x < 20 ? "0%" : x > 80 ? "-100%" : "-50%";
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-xl border border-borda bg-solido px-3 py-2 text-xs shadow-[var(--sombra)]"
      style={{ left: `${x}%`, transform: `translateX(${desloc})` }}
    >
      {children}
    </div>
  );
}

function LinhaDica({ cor, nome, valor }: { cor?: string; nome: string; valor: string }) {
  return (
    <p className="flex items-center gap-2 py-0.5">
      {cor ? <span aria-hidden className="size-2 rounded-full" style={{ background: cor }} /> : <span className="w-2" />}
      <span className="text-texto-suave">{nome}</span>
      <span className="ml-auto pl-3 font-medium tabular-nums">{valor}</span>
    </p>
  );
}

// Colunas agrupadas por período (ex.: receitas × despesas por mês). Valores em centavos, todos ≥ 0.
export function GraficoColunas({ rotulos, series, rotulo, diferenca, unidade = "moeda" }: { rotulos: string[]; series: Serie[]; rotulo: string; diferenca?: string; unidade?: Unidade }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const { fim, marcas } = escala(0, max);
  const y = (v: number) => (v / fim) * 100;
  const n = rotulos.length;

  return (
    <figure className="flex flex-col gap-3">
      <Legenda series={series} />
      <div className="relative h-72 pt-2 pb-6 pl-16" onPointerLeave={() => setAtivo(null)}>
        <div className="relative h-full">
          {marcas.map((m) => (
            <div key={m} className="absolute inset-x-0 border-t border-linha" style={{ bottom: `${y(m)}%` }}>
              <span className="absolute top-0 -left-16 w-14 -translate-y-1/2 text-right text-[11px] whitespace-nowrap text-texto-suave tabular-nums">{formatoCurto(m, unidade)}</span>
            </div>
          ))}
          <div className="absolute inset-0 flex">
            {rotulos.map((r, i) => (
              <div
                key={r}
                tabIndex={0}
                aria-label={`${r}: ${series.map((s) => `${s.nome} ${formatoLongo(s.valores[i], unidade)}`).join(", ")}`}
                onPointerEnter={() => setAtivo(i)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
                className={`crescer-y relative flex flex-1 items-end justify-center gap-[2px] rounded-lg outline-offset-0 transition-colors duration-150 ${ativo === i ? "bg-elevado/70" : ""}`}
                style={{ "--i": i } as CSSProperties}
              >
                {series.map((s) => (
                  <div
                    key={s.nome}
                    className="w-full max-w-[18px] rounded-t-[4px] transition-[height] duration-500 ease-out"
                    style={{ height: `${y(s.valores[i])}%`, background: s.cor, minHeight: s.valores[i] > 0 ? 2 : 0 }}
                  />
                ))}
                <span className="absolute -bottom-6 text-[11px] text-texto-suave">{r}</span>
              </div>
            ))}
          </div>
          {ativo !== null && (
            <Dica x={((ativo + 0.5) / n) * 100}>
              <p className="mb-1 font-medium">{rotulos[ativo]}</p>
              {series.map((s) => <LinhaDica key={s.nome} cor={s.cor} nome={s.nome} valor={formatoLongo(s.valores[ativo], unidade)} />)}
              {diferenca && series.length === 2 && (
                <div className="mt-1 border-t border-linha pt-1">
                  <LinhaDica nome={diferenca} valor={formatoLongo(series[0].valores[ativo] - series[1].valores[ativo], unidade)} />
                </div>
              )}
            </Dica>
          )}
        </div>
      </div>
      <table className="sr-only">
        <caption>{rotulo}</caption>
        <thead><tr><th>Período</th>{series.map((s) => <th key={s.nome}>{s.nome}</th>)}</tr></thead>
        <tbody>{rotulos.map((r, i) => <tr key={r}><td>{r}</td>{series.map((s) => <td key={s.nome}>{formatoLongo(s.valores[i], unidade)}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}

// Linha com área: saldo previsto ao longo do tempo. Pode ficar negativo; o zero ganha uma linha mais forte.
export function GraficoLinha({ pontos, cor, rotulo, unidade = "moeda", nome = "Saldo", vazio = "Sem lançamentos previstos no período." }: {
  pontos: { rotulo: string; valor: number }[]; cor: string; rotulo: string; unidade?: Unidade; nome?: string; vazio?: string;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  if (pontos.length < 2) return <p className="text-sm text-texto-suave">{vazio}</p>;
  const valores = pontos.map((p) => p.valor);
  const { ini, fim, marcas } = escala(Math.min(0, ...valores), Math.max(0, ...valores));
  const n = pontos.length;
  const x = (i: number) => (i / (n - 1)) * 100;
  const y = (v: number) => ((v - ini) / (fim - ini)) * 100;
  const caminho = pontos.map((p, i) => `${i ? "L" : "M"}${x(i) * 10},${300 - y(p.valor) * 3}`).join(" ");
  const area = `${caminho} L1000,${300 - y(Math.max(ini, 0)) * 3} L0,${300 - y(Math.max(ini, 0)) * 3} Z`;
  const id = `area-${rotulo.replace(/\W/g, "")}`;

  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    setAtivo(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - caixa.left) / caixa.width) * (n - 1)))));
  };
  const meio = Math.floor((n - 1) / 2);

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative h-60 pt-2 pb-6 pl-16">
        <div className="relative h-full">
          {marcas.map((m) => (
            <div key={m} className={`absolute inset-x-0 border-t ${m === 0 && ini < 0 ? "border-texto-suave/40" : "border-linha"}`} style={{ bottom: `${y(m)}%` }}>
              <span className="absolute top-0 -left-16 w-14 -translate-y-1/2 text-right text-[11px] whitespace-nowrap text-texto-suave tabular-nums">{formatoCurto(m, unidade)}</span>
            </div>
          ))}
          <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden className="revelar-x absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={cor} stopOpacity="0.22" />
                <stop offset="1" stopColor={cor} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${id})`} />
            <path d={caminho} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {[0, meio, n - 1].map((i, k) => (
            <span
              key={i}
              className={`absolute -bottom-6 text-[11px] whitespace-nowrap text-texto-suave ${k === 0 ? "" : k === 2 ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: `${x(i)}%` }}
            >
              {pontos[i].rotulo}
            </span>
          ))}
          {ativo !== null && (
            <>
              <div aria-hidden className="absolute inset-y-0 w-px bg-texto-suave/30" style={{ left: `${x(ativo)}%` }} />
              <div
                aria-hidden
                className="absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-[var(--solido)]"
                style={{ left: `${x(ativo)}%`, bottom: `${y(pontos[ativo].valor)}%`, background: cor }}
              />
              <Dica x={x(ativo)}>
                <p className="mb-1 font-medium">{pontos[ativo].rotulo}</p>
                <LinhaDica cor={cor} nome={nome} valor={formatoLongo(pontos[ativo].valor, unidade)} />
              </Dica>
            </>
          )}
          <div className="absolute inset-0 touch-pan-y" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setAtivo(null)} />
        </div>
      </div>
      <table className="sr-only">
        <caption>{rotulo}</caption>
        <tbody>{pontos.map((p) => <tr key={p.rotulo}><td>{p.rotulo}</td><td>{formatoLongo(p.valor, unidade)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

// Ranking em barras horizontais (despesa por categoria, por centro de custo). Uma série, uma cor.
export function BarrasRanking({ itens, cor, vazio }: { itens: { nome: string; valor: number; href?: string }[]; cor: string; vazio: string }) {
  if (itens.length === 0) return <p className="text-sm text-texto-suave">{vazio}</p>;
  const max = Math.max(1, ...itens.map((i) => i.valor));
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return (
    <ul className="-mx-2 flex flex-col">
      {itens.map((i) => (
        <li key={i.nome} className="rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-elevado/60">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{i.nome}</span>
            <span className="font-medium tabular-nums">{formatarMoeda(i.valor)}</span>
            <span className="w-10 text-right text-xs text-texto-suave tabular-nums">{Math.round((i.valor / Math.max(1, total)) * 100)}%</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-elevado">
            <div className="crescer-x h-2 rounded-full transition-[width] duration-500 ease-out" style={{ width: `${(i.valor / max) * 100}%`, background: cor }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Tendência pequena dentro de um cartão de indicador. O número fica no cartão; aqui é só a forma.
export function Mini({ valores, cor }: { valores: number[]; cor: string }) {
  if (valores.length < 2) return null;
  const min = Math.min(...valores), max = Math.max(...valores), faixa = max - min || 1;
  const pts = valores.map((v, i) => [(i / (valores.length - 1)) * 100, 34 - ((v - min) / faixa) * 30]);
  const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join(" ");
  const [ux, uy] = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden className="revelar-x h-9 w-full overflow-visible">
      <path d={`${d} L100,36 L0,36 Z`} fill={cor} fillOpacity="0.1" />
      <path d={d} fill="none" stroke={cor} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ux} cy={uy} r="3" fill={cor} stroke="var(--solido)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Barra dividida (ex.: a receber vencido × a vencer), com 2px de folga entre as partes.
export function BarraPartes({ partes }: { partes: { nome: string; valor: number; cor: string }[] }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="crescer-x flex h-2 gap-[2px] overflow-hidden rounded-full bg-elevado">
        {total > 0 && partes.filter((p) => p.valor > 0).map((p) => (
          <div key={p.nome} title={`${p.nome}: ${formatarMoeda(p.valor)}`} style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-texto-suave">
        {partes.map((p) => (
          <li key={p.nome} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: p.cor }} />
            {p.nome} <span className="tabular-nums text-texto">{moedaCurta(p.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
