import type { ReactNode } from "react";
import { MarcaBalbina } from "@/components/marca";
import { SeletorTema } from "@/components/tema";
import { RodapeLegal } from "@/components/documento-legal";

// Moldura das telas fora do app (login, cadastro da empresa): um cartão de vidro sobre o fundo de luz,
// com a frase do Balbina ao lado no desktop. Segue o tema escolhido, como o resto do sistema.
export function TelaAcesso({ titulo, descricao, children }: { titulo: string; descricao: ReactNode; children: ReactNode }) {
  return (
    <main className="relative flex flex-1 flex-col px-5 py-6 sm:px-10">
      <header className="flex items-center justify-between">
        <MarcaBalbina />
        <SeletorTema />
      </header>
      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 py-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="hidden max-w-md lg:block">
          <p className="text-[40px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance">
            Do viveiro ao caixa, o custo de cada <span className="text-marca">quilo</span>.
          </p>
          <p className="mt-5 text-[15px] leading-relaxed text-texto-suave">
            Arraçoamento, biometria e despesca, financeiro conciliado com o banco e vendas no mesmo lugar, para saber quanto custa e quanto rende cada lote.
          </p>
        </div>
        <section className="vidro w-full rounded-3xl border border-borda p-7 sm:p-9">
          <h1 className="text-2xl font-semibold tracking-[-0.015em]">{titulo}</h1>
          <p className="mt-1.5 mb-8 text-sm text-texto-suave">{descricao}</p>
          {children}
        </section>
      </div>
      <RodapeLegal />
    </main>
  );
}
