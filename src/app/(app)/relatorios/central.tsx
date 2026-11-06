"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ChartColumn, Fish, Search, ShoppingCart, Wallet, type LucideIcon } from "lucide-react";
import { CLASSE_CONTROLE, Etiqueta, Ficha, Vazio, classeBotao, type Cor } from "@/components/ui";
import { AREAS, buscarRelatorios, type Area, type LinkRapido, type Relatorio } from "@/lib/relatorios-catalogo";

const VISUAL: Record<Area, { icone: LucideIcon; cor: Cor }> = {
  geral: { icone: ChartColumn, cor: "marca" },
  financeiro: { icone: Wallet, cor: "verde" },
  producao: { icone: Fish, cor: "amarelo" },
  comercial: { icone: ShoppingCart, cor: "azul" },
  contabil: { icone: BookOpen, cor: "rosa" },
};

export type ItemCentral = Relatorio & { links: LinkRapido[] };

// Lista da central com busca na hora: digitar "abc" ou "contadora" já deixa só o que interessa.
export function CentralRelatorios({ itens }: { itens: ItemCentral[] }) {
  const [termo, setTermo] = useState("");
  const achados = buscarRelatorios(termo, itens) as ItemCentral[];
  const areas = AREAS.filter((a) => achados.some((r) => r.area === a.chave));

  return (
    <div className="flex flex-col gap-6">
      <label className="relative block max-w-md">
        <span className="sr-only">Buscar relatório</span>
        <Search aria-hidden size={17} strokeWidth={1.9} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-suave" />
        <input type="search" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar relatório (ex.: DRE, curva ABC, manutenção)"
          className={`h-10 w-full pl-9 ${CLASSE_CONTROLE}`} />
      </label>

      {areas.length === 0 && <Vazio>Nenhum relatório com “{termo}”.</Vazio>}

      {areas.map((a) => (
        <section key={a.chave} aria-labelledby={`area-${a.chave}`} className="flex flex-col gap-3">
          <h2 id={`area-${a.chave}`} className="text-[13px] font-semibold tracking-wide text-texto-suave uppercase">{a.nome}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {achados.filter((r) => r.area === a.chave).map((r) => <CartaoRelatorio key={r.href} r={r} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function CartaoRelatorio({ r }: { r: ItemCentral }) {
  const { icone, cor } = VISUAL[r.area];
  const temTela = r.formatos.includes("Tela");
  return (
    <article data-relatorio={r.href} className="vidro flex flex-col gap-3 rounded-2xl border border-borda p-4">
      <div className="flex items-start gap-3">
        <Ficha icone={icone} cor={cor} />
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-texto">{r.nome}</h3>
          <p className="mt-0.5 text-[13px] text-texto-suave">{r.descricao}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {r.formatos.map((f) => <Etiqueta key={f}>{f}</Etiqueta>)}
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Link href={r.href} className={classeBotao("primario", "sm")}>{temTela ? "Abrir" : "Escolher período"}</Link>
        {r.links.map((l) => (
          <a key={l.href} href={l.href} download className={classeBotao("secundario", "sm")}>{l.nome}</a>
        ))}
      </div>
    </article>
  );
}
