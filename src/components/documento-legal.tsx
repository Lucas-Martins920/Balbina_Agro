import type { ReactNode } from "react";
import Link from "next/link";
import { MarcaBalbina } from "@/components/marca";
import { SeletorTema } from "@/components/tema";
import { DOCUMENTOS_LEGAIS, VERSAO_TERMOS } from "@/lib/termos";

// Moldura dos documentos legais (páginas públicas).
export function DocumentoLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [a, m, d] = VERSAO_TERMOS.split("-");
  return (
    <main className="flex flex-1 flex-col px-5 py-6 sm:px-10">
      <header className="flex items-center justify-between">
        <Link href="/login"><MarcaBalbina /></Link>
        <SeletorTema />
      </header>
      <article className="vidro mx-auto my-10 w-full max-w-3xl rounded-3xl border border-borda p-7 text-[15px] leading-relaxed sm:p-10 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-[17px] [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 [&_ul]:mb-3">
        <h1 className="text-2xl font-semibold tracking-[-0.015em]">{titulo}</h1>
        <p className="text-sm text-texto-suave">Versão de {d}/{m}/{a}</p>
        {children}
      </article>
      <RodapeLegal />
    </main>
  );
}

export function RodapeLegal() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-texto-suave/70">
      <span>Balbina ERP · pisciculturas de engorda</span>
      {DOCUMENTOS_LEGAIS.map((d) => (
        <Link key={d.href} href={d.href} className="rounded-full px-2 py-1 transition-colors hover:bg-elevado hover:text-texto">{d.nome}</Link>
      ))}
    </footer>
  );
}
