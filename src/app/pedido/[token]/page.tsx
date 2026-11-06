import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Cartao } from "@/components/ui";
import { formatarData, formatarMoeda, hojeISO } from "@/lib/formato";
import { createAdminClient } from "@/lib/supabase/admin";
import { FormularioPedido } from "./formulario";

export const metadata: Metadata = { title: "Pedido · Balbina", robots: { index: false, follow: false } };

type Portal = {
  empresa: string; cliente: string;
  produtos: { id: string; nome: string; unidade: string; preco_cents: number }[];
  pedidos: { numero: number; data: string; entrega: string | null; status: string; total_cents: number }[];
};
const SITUACAO: Record<string, string> = { aberto: "recebido", faturado: "faturado", entregue: "entregue", cancelado: "cancelado" };

// D3: página do cliente para fazer o pedido com os preços dele (link enviado pela piscicultura, sem login).
export default async function PaginaPedidoCliente({ params }: PageProps<"/pedido/[token]">) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const { data } = await createAdminClient().rpc("portal_cliente", { p_token: token });
  const portal = data as Portal | null;
  if (!portal) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-texto-suave">{portal.empresa}</p>
        <h1 className="text-2xl font-semibold">Pedido de {portal.cliente}</h1>
      </header>
      <Cartao titulo="Novo pedido" descricao="Preços da sua tabela. A piscicultura confere o pedido e confirma a entrega e o pagamento.">
        {portal.produtos.length ? (
          <FormularioPedido token={token} produtos={portal.produtos} hoje={hojeISO()} />
        ) : (
          <p className="text-sm text-texto-suave">Nenhum produto com preço para você ainda. Fale com a piscicultura.</p>
        )}
      </Cartao>
      {portal.pedidos.length > 0 && (
        <Cartao titulo="Últimos pedidos">
          <ul className="flex flex-col gap-2 text-sm">
            {portal.pedidos.map((p) => (
              <li key={p.numero} className="flex justify-between gap-3">
                <span>Nº {p.numero} · {formatarData(p.data)}{p.entrega ? ` · entrega ${formatarData(p.entrega)}` : ""}</span>
                <span className="text-texto-suave">{formatarMoeda(p.total_cents)} · {SITUACAO[p.status] ?? p.status}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </main>
  );
}
