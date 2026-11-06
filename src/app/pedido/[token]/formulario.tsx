"use client";

import { useActionState } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import type { EstadoAcao } from "@/lib/acao";
import { formatarMoeda } from "@/lib/formato";
import { fazerPedido } from "./actions";

type Produto = { id: string; nome: string; unidade: string; preco_cents: number };

export function FormularioPedido({ token, produtos, hoje }: { token: string; produtos: Produto[]; hoje: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoAcao, FormData>(fazerPedido, {});
  if (estado.ok) return <Aviso tipo="info">{estado.ok}</Aviso>;
  return (
    <form action={enviar} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <ul className="flex flex-col divide-y divide-linha">
        {produtos.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-3">
            <div className="flex flex-col">
              <span className="font-medium">{p.nome}</span>
              <span className="text-sm text-texto-suave">{formatarMoeda(p.preco_cents)} por {p.unidade}</span>
            </div>
            <input type="hidden" name="produto_id" value={p.id} />
            <div className="w-24"><Campo rotulo="Quantidade" id={`q_${p.id}`} name="quantidade" inputMode="decimal" placeholder="0" /></div>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Entrega desejada" id="entrega" name="entrega" type="date" min={hoje} />
        <Campo rotulo="Observação" id="observacoes" name="observacoes" maxLength={500} />
      </div>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <Botao type="submit" disabled={pendente} className="self-start">{pendente ? "Enviando…" : "Enviar pedido"}</Botao>
    </form>
  );
}
