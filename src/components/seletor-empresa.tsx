"use client";

import { useId } from "react";
import { ChevronsUpDown } from "lucide-react";
import { trocarEmpresa } from "@/app/(app)/actions";

type Opcao = { id: string; nome: string };

function Cracha({ nome }: { nome: string }) {
  return (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg border border-borda bg-solido text-xs font-semibold">
      {nome.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function SeletorEmpresa({ atual, opcoes }: { atual: string; opcoes: Opcao[] }) {
  const id = useId();
  const nomeAtual = opcoes.find((o) => o.id === atual)?.nome ?? opcoes[0]?.nome ?? "";

  if (opcoes.length < 2) {
    return (
      <div className="flex h-10 items-center gap-2.5 px-1.5">
        <Cracha nome={nomeAtual} />
        <p className="truncate text-sm font-medium">{nomeAtual}</p>
      </div>
    );
  }
  // O select nativo fica por cima, transparente: teclado e leitor de tela continuam funcionando.
  return (
    <form action={trocarEmpresa} className="relative flex h-10 items-center gap-2.5 rounded-xl px-1.5 transition-colors duration-150 hover:bg-elevado">
      <Cracha nome={nomeAtual} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{nomeAtual}</span>
      <ChevronsUpDown size={14} aria-hidden className="text-texto-suave" />
      <label htmlFor={id} className="sr-only">Empresa</label>
      <select
        id={id}
        name="empresa_id"
        defaultValue={atual}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>{o.nome}</option>
        ))}
      </select>
    </form>
  );
}
