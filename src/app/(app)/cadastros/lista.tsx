"use client";

import Link from "next/link";
import { useState } from "react";
import { Campo, Cartao } from "@/components/ui";

export function ListaCadastros({ itens }: { itens: { slug: string; nome: string; descricao: string }[] }) {
  const [termo, setTermo] = useState("");
  const busca = termo.trim().toLowerCase();
  const achados = itens.filter((i) => !busca || `${i.nome} ${i.descricao}`.toLowerCase().includes(busca));
  return (
    <div className="flex flex-col gap-4">
      <Campo id="busca-cadastros" rotulo="Buscar cadastro" placeholder="Ex.: fornecedor, produto, centro de custo" value={termo} onChange={(e) => setTermo(e.target.value)} />
      {achados.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhum cadastro com &ldquo;{termo.trim()}&rdquo;.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {achados.map((i) => (
            <Link key={i.slug} href={`/${i.slug}`} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca">
              <Cartao titulo={i.nome} descricao={i.descricao}>{null}</Cartao>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
