import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Plus, Store } from "lucide-react";
import { CLASSE_CONTROLE, Etiqueta, Vazio, Faixa, Indicador, LinkBotao, Segmentos, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, formatarMoeda, hojeISO } from "@/lib/formato";
import { textoKg } from "@/lib/pescado";
import { createClient } from "@/lib/supabase/server";
import { lerTodas } from "@/lib/supabase/todas";
import { STATUS_PEDIDO, TOM_STATUS_PEDIDO } from "@/lib/vendas";
import { entregarPedido, faturarPedido } from "./actions";
import { exigirAcesso } from "@/lib/permissoes";

const FILTROS = [
  { valor: "abertos", nome: "Para faturar", status: ["aberto", "separado"] },
  { valor: "faturados", nome: "Para entregar", status: ["faturado"] },
  { valor: "entregues", nome: "Entregues", status: ["entregue"] },
  { valor: "todos", nome: "Todos", status: [] as string[] },
];

function Situacao({ status }: { status: string }) {
  return <Etiqueta tom={TOM_STATUS_PEDIDO[status] ?? "neutro"}>{STATUS_PEDIDO[status] ?? status}</Etiqueta>;
}

type Pedido = { id: string; numero: number; data: string; entrega_prevista: string | null; status: string; cliente_nome: string; itens: string | null; kg: number | null; total_cents: number; origem: string };

function Acao({ p }: { p: Pedido }) {
  if (["aberto", "separado"].includes(p.status)) {
    return <FormAcao acao={faturarPedido} botao="Faturar" variante="secundario" className="items-end"><input type="hidden" name="pedido_id" value={p.id} /></FormAcao>;
  }
  if (p.status === "faturado") {
    return <FormAcao acao={entregarPedido} botao="Entregue" variante="secundario" className="items-end"><input type="hidden" name="pedido_id" value={p.id} /></FormAcao>;
  }
  return null;
}

export default async function PaginaVendas({ searchParams }: PageProps<"/vendas">) {
  await exigirAcesso("vendas");
  const filtros = await searchParams;
  const filtro = FILTROS.find((f) => f.valor === filtros.ver) ?? FILTROS[0];
  const busca = typeof filtros.q === "string" ? filtros.q.trim() : "";
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const hoje = hojeISO(atual.fuso);

  let consulta = supabase.from("pedidos").select("id, numero, data, entrega_prevista, status, cliente_nome, itens, kg, total_cents, origem")
    .eq("empresa_id", atual.id).order("numero", { ascending: false }).limit(200);
  if (filtro.status.length) consulta = consulta.in("status", filtro.status);
  if (busca) consulta = /^\d+$/.test(busca) ? consulta.eq("numero", Number(busca)) : consulta.ilike("cliente_nome", `%${busca}%`);

  const [{ data: pedidos }, { data: pendentes }, { data: doDia }, { data: estoque }] = await Promise.all([
    consulta,
    lerTodas(() => supabase.from("pedidos_venda").select("status, total_cents").eq("empresa_id", atual.id).in("status", ["aberto", "separado", "faturado"]).order("id")),
    lerTodas(() => supabase.from("pedidos_venda").select("total_cents").eq("empresa_id", atual.id).eq("data", hoje).neq("status", "cancelado").order("id")),
    supabase.from("estoque_peixe").select("classe, disponivel").eq("empresa_id", atual.id).eq("comercializavel", true).order("ordem"),
  ]);

  const soma = (l: { total_cents: number }[]) => l.reduce((s, p) => s + Number(p.total_cents), 0);
  const paraFaturar = (pendentes ?? []).filter((p) => p.status !== "faturado");
  const paraEntregar = (pendentes ?? []).filter((p) => p.status === "faturado");
  const contagem: Record<string, number> = { abertos: paraFaturar.length, faturados: paraEntregar.length };
  const lista = (pedidos ?? []) as Pedido[];
  const link = (ver: string) => {
    const q = new URLSearchParams();
    if (ver !== "abertos") q.set("ver", ver);
    if (busca) q.set("q", busca);
    return `/vendas${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <Titulo descricao={`Disponível para venda: ${(estoque ?? []).filter((e) => Number(e.disponivel) > 0).map((e) => `${e.classe} ${textoKg(e.disponivel)}`).join(" · ") || "sem peixe em estoque"}`}
        acoes={
          <>
            <LinkBotao href="/vendas/fixos">Pedidos fixos</LinkBotao>
            <LinkBotao href="/vendas/links">Links de pedido</LinkBotao>
            <LinkBotao href="/vendas/pdv"><Store size={16} strokeWidth={1.75} aria-hidden /> PDV</LinkBotao>
            <LinkBotao href="/vendas/nova" variante="primario"><Plus size={16} strokeWidth={1.75} aria-hidden /> Nova venda</LinkBotao>
          </>
        }>
        Vendas
      </Titulo>

      <Faixa colunas={3}>
        <Indicador rotulo="Vendido hoje" valor={formatarMoeda(soma(doDia ?? []))} detalhe={`${doDia?.length ?? 0} pedidos`} />
        <Indicador rotulo="Para faturar" valor={formatarMoeda(soma(paraFaturar))} detalhe={`${paraFaturar.length} pedidos`} href="/vendas" />
        <Indicador rotulo="Para entregar" valor={formatarMoeda(soma(paraEntregar))} detalhe={`${paraEntregar.length} pedidos`} href="/vendas?ver=faturados" />
      </Faixa>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-texto-suave">
        <Link href="/tabelas-de-preco" className="hover:text-texto">Tabelas de preço</Link>
        <Link href="/vendas/pdv/caixa" className="hover:text-texto">Caixa do PDV</Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentos rotulo="Situação" opcoes={FILTROS.map((f) => ({
          href: link(f.valor), ativo: filtro.valor === f.valor,
          nome: `${f.nome}${contagem[f.valor] ? ` (${contagem[f.valor]})` : ""}`,
        }))} />
        <form className="flex gap-2">
          {filtro.valor !== "abertos" && <input type="hidden" name="ver" value={filtro.valor} />}
          <input type="search" name="q" defaultValue={busca} placeholder="Cliente ou nº do pedido" aria-label="Buscar pedido"
            className={`h-10 w-56 ${CLASSE_CONTROLE}`} />
        </form>
      </div>

      {/* Celular: cartões */}
      <ul className="flex flex-col gap-2 md:hidden">
        {lista.length === 0 && <li><Vazio acao={<LinkBotao href="/vendas/nova" tamanho="sm">Nova venda</LinkBotao>}>Nenhum pedido aqui.</Vazio></li>}
        {lista.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-3 vidro rounded-2xl border border-borda p-3">
            <Link href={`/vendas/${p.id}`} className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-xs text-texto-suave">nº {p.numero} · {formatarData(p.data)} <Situacao status={p.status} /></p>
              <p className="truncate font-semibold">{p.cliente_nome}</p>
              <p className="truncate text-xs text-texto-suave">{p.itens}</p>
              <p className="mt-1 font-semibold tabular-nums">{formatarMoeda(p.total_cents)}</p>
            </Link>
            <Acao p={p} />
          </li>
        ))}
      </ul>

      {/* Computador: tabela */}
      <div className="hidden md:block">
        <Tabela cabecalho={["Nº", "Data", "Cliente", "Itens", "Kg", "Total", "Situação", ""]} principal="Cliente" ocultarNoCelular={["Itens"]} direita={["Kg", "Total"]} total={lista.length} vazio="Nenhum pedido aqui.">
          {lista.map((p) => (
            <tr key={p.id}>
              <td className="tabular-nums"><Link href={`/vendas/${p.id}`} className="font-medium hover:underline">{p.numero}</Link></td>
              <td className="whitespace-nowrap tabular-nums">
                {formatarData(p.data)}
                {p.entrega_prevista && p.entrega_prevista !== p.data && <span className="block text-xs text-texto-suave">entrega {formatarData(p.entrega_prevista)}</span>}
              </td>
              <td><Link href={`/vendas/${p.id}`} className="hover:underline">{p.cliente_nome}</Link></td>
              <td className="max-w-64 text-xs text-texto-suave">{p.itens}</td>
              <td className="text-right tabular-nums">{Number(p.kg) > 0 ? textoKg(p.kg) : "–"}</td>
              <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatarMoeda(p.total_cents)}</td>
              <td className="whitespace-nowrap"><Situacao status={p.status} />{p.origem !== "web" && <span className="text-xs text-texto-suave"> {p.origem === "pdv" ? "PDV" : p.origem === "portal" ? "pelo cliente" : "vendedor"}</span>}</td>
              <td><Acao p={p} /></td>
            </tr>
          ))}
        </Tabela>
      </div>
    </div>
  );
}
