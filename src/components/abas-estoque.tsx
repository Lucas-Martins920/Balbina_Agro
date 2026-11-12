import Link from "next/link";

// Abas do estoque: pescado, ração, insumos e medicamentos ficam uma ao lado da outra, em vez de espalhados no menu.
const ABAS = [
  { chave: "pescado", nome: "Pescado", href: "/estoque" },
  { chave: "racao", nome: "Ração", href: "/racao" },
  { chave: "insumos", nome: "Insumos", href: "/insumos" },
  { chave: "medicamentos", nome: "Medicamentos", href: "/medicamentos" },
] as const;

export function AbasEstoque({ ativa }: { ativa: (typeof ABAS)[number]["chave"] }) {
  return (
    <nav aria-label="Estoque" className="mb-4 flex flex-wrap gap-1 border-b border-borda">
      {ABAS.map((a) => {
        const on = a.chave === ativa;
        return (
          <Link
            key={a.chave}
            href={a.href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${on ? "border-marca font-semibold text-texto" : "border-transparent text-texto-suave hover:text-texto"}`}
          >
            {a.nome}
          </Link>
        );
      })}
    </nav>
  );
}
