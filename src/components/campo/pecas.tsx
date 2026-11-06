"use client";

import { useCallback, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, CircleAlert, Info, Minus, Plus, TriangleAlert } from "lucide-react";

// Peças do app de campo: alvos grandes (48px), números legíveis no sol, um toque por decisão.

export const CLASSE_ENTRADA =
  "h-12 w-full rounded-2xl border border-borda bg-elevado/80 px-4 text-[17px] text-texto tabular-nums shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] outline-none! transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-texto-suave/70 focus:border-marca focus:bg-solido focus:ring-4 focus:ring-marca/20";

// Texto digitado no celular ("12,5", "1.250") vira número. null quando vazio ou inválido.
export function lerNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, "");
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export const fmt = (v: number | null | undefined, casas = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

export const dataCurta = (iso: string | null | undefined) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "—");

export function Rotulo({ texto, ajuda, children, className = "" }: { texto: ReactNode; ajuda?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-medium text-texto">{texto}</span>
      {children}
      {ajuda && <span className="text-xs text-texto-suave">{ajuda}</span>}
    </label>
  );
}

// Campo de número com a unidade dentro (kg, g, mg/L)
export function CampoNumero({ rotulo, unidade, ajuda, className = "", ...props }: ComponentProps<"input"> & { rotulo: ReactNode; unidade?: string; ajuda?: ReactNode }) {
  return (
    <Rotulo texto={rotulo} ajuda={ajuda} className={className}>
      <span className="relative block">
        <input inputMode="decimal" autoComplete="off" className={`${CLASSE_ENTRADA} ${unidade ? "pr-14" : ""}`} {...props} />
        {unidade && <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-sm text-texto-suave">{unidade}</span>}
      </span>
    </Rotulo>
  );
}

// − valor + : sacos, mortes. O número no meio também aceita digitação.
export function Passo({ rotulo, valor, mudar, passo = 1, min = 0, unidade, ajuda }: {
  rotulo: string; valor: number; mudar: (v: number) => void; passo?: number; min?: number; unidade?: string; ajuda?: ReactNode;
}) {
  const botao = "grid size-12 shrink-0 place-items-center rounded-2xl bg-elevado text-texto shadow-[inset_0_1px_0_var(--aresta),inset_0_0_0_1px_var(--brilho)] transition-transform duration-150 ease-out active:scale-[0.92] disabled:opacity-40";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{rotulo}</span>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Menos ${rotulo.toLowerCase()}`} className={botao} disabled={valor <= min} onClick={() => mudar(Math.max(min, +(valor - passo).toFixed(3)))}>
          <Minus size={20} strokeWidth={2.2} />
        </button>
        <span className="relative flex-1">
          <input aria-label={rotulo} inputMode="decimal" value={fmt(valor, 3)} onChange={(e) => { const n = lerNumero(e.target.value); if (n !== null && n >= min) mudar(n); }}
            className={`${CLASSE_ENTRADA} text-center text-xl font-semibold`} />
          {unidade && <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs text-texto-suave">{unidade}</span>}
        </span>
        <button type="button" aria-label={`Mais ${rotulo.toLowerCase()}`} className={botao} onClick={() => mudar(+(valor + passo).toFixed(3))}>
          <Plus size={20} strokeWidth={2.2} />
        </button>
      </div>
      {ajuda && <span className="text-xs text-texto-suave">{ajuda}</span>}
    </div>
  );
}

// Escolha de uma opção em cápsulas (turno, tipo de manejo, modo da despesca)
export function Escolha<T extends string>({ rotulo, opcoes, valor, mudar, colunas }: {
  rotulo: string; opcoes: { valor: T; nome: ReactNode }[]; valor: T; mudar: (v: T) => void; colunas?: number;
}) {
  const nome = useId(); // cada grupo de rádios com o seu nome, mesmo com vários cartões na tela
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{rotulo}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${colunas ?? Math.min(opcoes.length, 3)}, minmax(0, 1fr))` }}>
        {opcoes.map((o) => (
          <label key={o.valor}
            className="relative flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border border-borda bg-elevado/70 px-2 text-center text-[15px] font-medium transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.97] has-[:checked]:border-marca has-[:checked]:bg-marca-suave has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-marca/20">
            <input type="radio" name={nome} value={o.valor} checked={valor === o.valor} onChange={() => mudar(o.valor)} className="sr-only" />
            {o.nome}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Número grande com legenda (painel do viveiro, biometria)
export function Numero({ titulo, valor, detalhe, tom }: { titulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: "positivo" | "alerta" | "perigo" }) {
  const cor = tom === "positivo" ? "text-positivo" : tom === "alerta" ? "text-alerta" : tom === "perigo" ? "text-perigo" : "text-texto";
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-2xl bg-elevado/60 px-3 py-2.5">
      <span className="truncate text-xs text-texto-suave">{titulo}</span>
      <span className={`text-lg leading-tight font-semibold tabular-nums ${cor}`}>{valor}</span>
      {detalhe && <span className="truncate text-xs text-texto-suave">{detalhe}</span>}
    </div>
  );
}

// Botão principal da gaveta: largo e alto, para o polegar
export function BotaoGrande({ className = "", variante = "primario", ...props }: ComponentProps<"button"> & { variante?: "primario" | "perigo" | "secundario" }) {
  const cor = variante === "perigo" ? "bg-perigo text-white shadow-[0_10px_24px_-10px_var(--perigo)]"
    : variante === "secundario" ? "bg-elevado text-texto shadow-[inset_0_1px_0_var(--aresta),inset_0_0_0_1px_var(--brilho)]"
    : "bg-marca text-marca-texto shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_10px_24px_-10px_var(--marca)]";
  return (
    <button className={`flex h-14 w-full select-none items-center justify-center gap-2 rounded-2xl text-[17px] font-semibold transition-[transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 ${cor} ${className}`} {...props} />
  );
}

// Botão menor, em pílula, para ações de uma linha (tentar de novo, descartar). 44px de altura: cabe o polegar.
export function BotaoPilula({ className = "", variante = "secundario", ...props }: ComponentProps<"button"> & { variante?: "primario" | "perigo" | "secundario" }) {
  const cor = variante === "perigo" ? "bg-perigo/12 text-perigo"
    : variante === "primario" ? "bg-marca text-marca-texto"
    : "bg-elevado text-texto shadow-[inset_0_1px_0_var(--aresta),inset_0_0_0_1px_var(--brilho)]";
  return (
    <button type="button" className={`inline-flex h-11 select-none items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-[transform,opacity,background-color,color] duration-150 ease-out active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 ${cor} ${className}`} {...props} />
  );
}

// Ação que não volta atrás (fechar lote, descartar envio): o primeiro toque arma, o segundo confirma.
// Desarma sozinho depois de alguns segundos.
export function useDoisToques(ms = 4000) {
  const [armado, setArmado] = useState(false);
  const tempo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(tempo.current), []);
  const tocar = useCallback((acao: () => void) => {
    clearTimeout(tempo.current);
    if (armado) {
      setArmado(false);
      acao();
      return;
    }
    setArmado(true);
    tempo.current = setTimeout(() => setArmado(false), ms);
  }, [armado, ms]);
  return [armado, tocar] as const;
}

// Lista de opções (viveiro, ração, produto): o select nativo abre a roleta do próprio celular
export function Selecao({ rotulo, ajuda, children, className = "", ...props }: ComponentProps<"select"> & { rotulo: ReactNode; ajuda?: ReactNode }) {
  return (
    <Rotulo texto={rotulo} ajuda={ajuda} className={className}>
      <span className="relative block">
        <select className={`${CLASSE_ENTRADA} appearance-none truncate pr-11`} {...props}>{children}</select>
        <ChevronDown aria-hidden size={18} className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-texto-suave" />
      </span>
    </Rotulo>
  );
}

// Texto ou data, com o mesmo visual dos números
export function Entrada({ rotulo, ajuda, className = "", ...props }: ComponentProps<"input"> & { rotulo: ReactNode; ajuda?: ReactNode }) {
  return (
    <Rotulo texto={rotulo} ajuda={ajuda} className={className}>
      <input className={CLASSE_ENTRADA} {...props} />
    </Rotulo>
  );
}

export function Observacoes({ valor, mudar, rotulo = "Observações", ajuda = "Opcional." }: { valor: string; mudar: (v: string) => void; rotulo?: string; ajuda?: ReactNode }) {
  return (
    <Rotulo texto={rotulo} ajuda={ajuda}>
      <textarea value={valor} onChange={(e) => mudar(e.target.value)} rows={2} maxLength={500}
        className={`${CLASSE_ENTRADA} h-auto min-h-20 py-3 leading-snug`} />
    </Rotulo>
  );
}

const AVISO = {
  info: { fundo: "bg-marca-suave", cor: "text-marca", Icone: Info },
  alerta: { fundo: "bg-alerta/12", cor: "text-alerta", Icone: TriangleAlert },
  perigo: { fundo: "bg-perigo/12", cor: "text-perigo", Icone: CircleAlert },
} as const;

// Aviso dentro da tela (oxigênio baixo, carência, erro do formulário)
export function AvisoCampo({ tom = "info", titulo, children, className = "" }: { tom?: keyof typeof AVISO; titulo?: ReactNode; children?: ReactNode; className?: string }) {
  const { fundo, cor, Icone } = AVISO[tom];
  return (
    <div role={tom === "perigo" ? "alert" : undefined} className={`flex gap-2.5 rounded-2xl px-3.5 py-3 text-sm leading-snug ${fundo} ${className}`}>
      <Icone aria-hidden size={18} strokeWidth={2.2} className={`mt-px shrink-0 ${cor}`} />
      <div className="min-w-0">
        {titulo && <p className="font-semibold text-texto">{titulo}</p>}
        {children && <div className={titulo ? "mt-0.5 text-texto-suave" : "text-texto"}>{children}</div>}
      </div>
    </div>
  );
}

export { RodapeFolha } from "./folha";

// Título de bloco dentro das telas do campo
export function Subtitulo({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between gap-3 px-1">
      <h2 className="text-[13px] font-semibold tracking-[0.06em] text-texto-suave uppercase">{children}</h2>
      {acao}
    </div>
  );
}

export const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

// "hoje 08:10", "ontem 17:02", "03/11 08:10" (a data é a do celular)
export function quando(iso: string, hoje: string) {
  const d = new Date(iso);
  const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ontem = new Date(`${hoje}T12:00:00`);
  ontem.setDate(ontem.getDate() - 1);
  const diaOntem = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, "0")}-${String(ontem.getDate()).padStart(2, "0")}`;
  const prefixo = dia === hoje ? "hoje" : dia === diaOntem ? "ontem" : dataCurta(dia);
  return `${prefixo} ${hora(iso)}`;
}

// Controle segmentado (filtro da lista, ração ou insumos): um toque troca, a pílula ativa desliza
export function Segmentado<T extends string>({ rotulo, opcoes, valor, mudar }: {
  rotulo: string; opcoes: { valor: T; nome: ReactNode }[]; valor: T; mudar: (v: T) => void;
}) {
  const indice = Math.max(0, opcoes.findIndex((o) => o.valor === valor));
  return (
    <div role="group" aria-label={rotulo} className="relative grid rounded-full bg-elevado/70 p-1 shadow-[inset_0_0_0_1px_var(--brilho)]"
      style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}>
      <span aria-hidden className="absolute inset-y-1 left-1 rounded-full bg-solido shadow-[0_1px_3px_rgb(0_0_0/0.12)] transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `calc((100% - 0.5rem) / ${opcoes.length})`, transform: `translateX(${indice * 100}%)` }} />
      {opcoes.map((o) => (
        <button key={o.valor} type="button" aria-pressed={o.valor === valor} onClick={() => mudar(o.valor)}
          className={`relative h-10 rounded-full px-2 text-sm font-semibold transition-colors duration-200 ${o.valor === valor ? "text-texto" : "text-texto-suave"}`}>
          {o.nome}
        </button>
      ))}
    </div>
  );
}
