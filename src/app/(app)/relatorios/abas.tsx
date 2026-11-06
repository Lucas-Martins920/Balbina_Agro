import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getPermissoes } from "@/lib/permissoes";
import { doMesmoAssunto } from "@/lib/relatorios-catalogo";

// Topo de cada relatório: volta para a central e troca entre os relatórios do mesmo assunto.
export async function AbasRelatorio({ atual }: { atual: string }) {
  const { pode } = await getPermissoes();
  const irmaos = doMesmoAssunto(atual, pode);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/relatorios" className="inline-flex items-center gap-1 text-[13px] font-medium text-texto-suave hover:text-texto">
        <ChevronLeft size={15} aria-hidden /> Todos os relatórios
      </Link>
      {irmaos.length > 1 && (
        <nav aria-label="Relatórios do assunto" className="inline-flex max-w-full gap-0.5 self-start overflow-x-auto rounded-lg whitespace-nowrap bg-elevado/70 p-0.5 text-[13px]">
          {irmaos.map((r) => (
            <Link key={r.href} href={r.href} aria-current={atual === r.href ? "page" : undefined}
              className={`rounded-md px-3 py-1 font-medium transition-colors duration-150 ${atual === r.href ? "bg-superficie text-texto shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-texto-suave hover:text-texto"}`}>{r.curto}</Link>
          ))}
        </nav>
      )}
    </div>
  );
}
