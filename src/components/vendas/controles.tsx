"use client";

import { useState, type ReactNode } from "react";

// Botão de opção (condição, forma de pagamento, filtros). Grande o bastante para o dedo.
export function Chip({ ativo, onClick, children, className = "" }: { ativo: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" aria-pressed={ativo} onClick={onClick}
      className={`min-h-10 rounded-full border px-4 text-sm font-medium transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] ${ativo ? "border-destaque bg-destaque text-destaque-texto" : "border-borda bg-superficie hover:bg-elevado/60"} ${className}`}>
      {children}
    </button>
  );
}

// − quantidade + ; o campo do meio aceita digitar. Com casas > 0 aceita fração (12,5 kg): enquanto a pessoa
// digita, o texto fica como está ("12," não vira "12"); se o valor mudar por fora (limite do estoque, botões),
// mostra o valor.
const arredondar = (v: number, casas: number) => Math.round(v * 10 ** casas) / 10 ** casas;
const textoValor = (v: number) => (v ? String(v).replace(".", ",") : "");

export function Contador({ valor, onChange, rotulo, max, casas = 0 }: { valor: number; onChange: (v: number) => void; rotulo: string; max?: number; casas?: number }) {
  const [texto, setTexto] = useState<string | null>(null);
  const lido = (t: string) => (t === "" ? 0 : Number(t.replace(",", ".")));
  const mostrado = texto !== null && lido(texto) === valor ? texto : textoValor(valor);
  const formato = casas > 0 ? new RegExp(`^\\d*(?:[.,]\\d{0,${casas}})?$`) : /^\d*$/;
  const botao = "flex size-10 items-center justify-center rounded-xl border border-borda bg-superficie text-lg font-semibold transition-transform duration-150 ease-out hover:bg-elevado/60 active:scale-[0.97] disabled:opacity-40";
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={botao} aria-label={`Menos ${rotulo}`} disabled={valor <= 0} onClick={() => onChange(Math.max(arredondar(valor - 1, casas), 0))}>−</button>
      <input aria-label={`Quantidade de ${rotulo}`} inputMode={casas > 0 ? "decimal" : "numeric"} value={mostrado} placeholder="0"
        onBlur={() => setTexto(null)}
        onChange={(e) => {
          const t = e.target.value.trim();
          if (!formato.test(t)) return;
          setTexto(t);
          const n = lido(t);
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
        className={`h-10 w-16 rounded-md border bg-superficie text-center tabular-nums ${max !== undefined && valor > max ? "border-perigo text-perigo" : "border-borda"}`} />
      <button type="button" className={botao} aria-label={`Mais ${rotulo}`} onClick={() => onChange(arredondar(valor + 1, casas))}>+</button>
    </div>
  );
}

// Interruptor com texto, para opções do tipo "já recebi"
export function Opcao({ marcado, onChange, titulo, detalhe }: { marcado: boolean; onChange: (v: boolean) => void; titulo: string; detalhe?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 vidro rounded-2xl border border-borda p-3">
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 accent-[var(--marca)]" />
      <span className="text-sm">
        <span className="block font-medium">{titulo}</span>
        {detalhe && <span className="text-texto-suave">{detalhe}</span>}
      </span>
    </label>
  );
}
