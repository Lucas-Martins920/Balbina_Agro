import type { EmbalagemPescado } from "@/lib/pescado";

// Ilustração genérica da embalagem do pescado (peixe na bandeja por kg, caixa térmica de 20 kg, outro item),
// para achar o produto de relance no PDV. Só tokens de globals.css.
type Props = { embalagem: EmbalagemPescado; className?: string };

export function EmbalagemPescadoIcone({ embalagem, className = "size-10" }: Props) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false" className={`shrink-0 text-texto-suave ${className}`} strokeWidth={1.5} strokeLinejoin="round">
      {embalagem === "kg" && <PorKg />}
      {embalagem === "caixa" && <Caixa />}
      {embalagem === "outros" && <rect x="9" y="11" width="22" height="20" rx="3" className="fill-current/15 stroke-current/50" />}
    </svg>
  );
}

// Peixe de perfil: corpo, cauda e olho
function Peixe({ x, y, escala = 1 }: { x: number; y: number; escala?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      <path d="M0 0 C5 -7 15 -7 20 0 C15 7 5 7 0 0 Z" className="fill-azul/35 stroke-current/50" />
      <path d="M20 0 L27 -5 L26 0 L27 5 Z" className="fill-azul/35 stroke-current/50" />
      <circle cx="5" cy="-1.2" r="1.1" className="fill-current/70" />
    </g>
  );
}

// Peixe inteiro na bandeja da balança
function PorKg() {
  return (
    <g>
      <path d="M4 27 H36 L33 32 H7 Z" className="fill-current/15 stroke-current/50" />
      <Peixe x={6} y={20} />
    </g>
  );
}

// Caixa térmica de 20 kg com a tampa entreaberta e o peixe aparecendo
function Caixa() {
  return (
    <g>
      <path d="M5 13 L35 9 L36 13 L6 17 Z" className="fill-papelao stroke-current/50" />
      <Peixe x={9} y={17} escala={0.8} />
      <rect x="5" y="17" width="30" height="17" rx="2" className="fill-papelao stroke-current/50" />
      <rect x="14" y="23" width="12" height="5" rx="1" className="fill-current/10 stroke-current/30" />
    </g>
  );
}
