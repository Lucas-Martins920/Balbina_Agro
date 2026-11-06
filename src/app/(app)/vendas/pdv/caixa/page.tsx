import Link from "next/link";
import { Botao, CLASSE_CONTROLE, Faixa, Indicador, LinkBotao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso } from "@/lib/permissoes";
import { formatarData, formatarMoeda, hojeISO } from "@/lib/formato";
import { carregarPontos } from "@/lib/pontos-dados";
import { createClient } from "@/lib/supabase/server";
import { FORMAS_PAGAMENTO } from "@/lib/titulos";

export default async function PaginaCaixaPdv({ searchParams }: PageProps<"/vendas/pdv/caixa">) {
  await exigirAcesso("pdv");
  const params = await searchParams;
  const { atual } = await getEmpresaAtual();
  const dia = typeof params.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.dia) ? params.dia : hojeISO(atual.fuso);
  const supabase = await createClient();
  const pontos = (await carregarPontos(atual.id)).filter((p) => p.ativo);
  const variosPontos = pontos.length > 1;
  const ponto = typeof params.ponto === "string" ? pontos.find((p) => p.id === params.ponto) : undefined;
  let consultaCaixa = supabase.from("caixa_pdv").select("forma, conta_nome, vendas, valor_cents, ponto_nome").eq("empresa_id", atual.id).eq("data", dia);
  let consultaVendas = supabase.from("pedidos").select("id, numero, cliente_nome, itens, total_cents, status, ponto_nome").eq("empresa_id", atual.id).eq("origem", "pdv").eq("data", dia);
  if (ponto) {
    consultaCaixa = consultaCaixa.eq("ponto_venda_id", ponto.id);
    consultaVendas = consultaVendas.eq("ponto_venda_id", ponto.id);
  }
  const [{ data: caixa }, { data: vendas }] = await Promise.all([
    consultaCaixa.order("ponto_nome").order("forma"),
    consultaVendas.order("numero", { ascending: false }),
  ]);
  const linhas = caixa ?? [];
  const total = linhas.reduce((s, c) => s + Number(c.valor_cents), 0);
  const porForma = new Map<string, number>();
  for (const c of linhas) porForma.set(c.forma, (porForma.get(c.forma) ?? 0) + Number(c.valor_cents));
  const validas = (vendas ?? []).filter((v) => v.status !== "cancelado");

  return (
    <div className="flex flex-col gap-6">
      <Titulo descricao={`Fechamento do PDV${ponto ? ` de ${ponto.nome}` : ""} em ${formatarData(dia)}. Confira o dinheiro na gaveta com a linha Dinheiro.`}
        acoes={
          <form className="flex items-center gap-2 text-sm">
            {variosPontos && (
              <select name="ponto" defaultValue={ponto?.id ?? ""} aria-label="Ponto de venda" className={`h-10 ${CLASSE_CONTROLE}`}>
                <option value="">Todos os pontos</option>
                {pontos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            )}
            <input type="date" name="dia" defaultValue={dia} aria-label="Dia" className={`h-10 ${CLASSE_CONTROLE}`} />
            <Botao type="submit" variante="secundario">Ver</Botao>
            <LinkBotao href="/vendas/pdv" variante="primario">Voltar ao PDV</LinkBotao>
          </form>
        }>
        Caixa do PDV
      </Titulo>

      <Faixa colunas={4}>
        <Indicador rotulo="Total recebido" valor={total ? `+${formatarMoeda(total)}` : "–"} tom={total ? "positivo" : undefined} detalhe={`${validas.length} vendas`} />
        {["dinheiro", "pix", "cartao"].map((f) => (
          <Indicador key={f} rotulo={FORMAS_PAGAMENTO[f] ?? f} valor={porForma.get(f) ? formatarMoeda(porForma.get(f) ?? 0) : "–"}
            detalhe={f === "dinheiro" ? "confira na gaveta" : undefined} />
        ))}
      </Faixa>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Por conta</h2>
        <Tabela cabecalho={[...(variosPontos && !ponto ? ["Ponto"] : []), "Forma", "Conta", "Vendas", "Valor"]} direita={["Vendas", "Valor"]} total={linhas.length} vazio="Nenhuma venda no PDV neste dia.">
          {linhas.map((c, i) => (
            <tr key={i} className="tabular-nums">
              {variosPontos && !ponto && <td>{c.ponto_nome}</td>}
              <td>{FORMAS_PAGAMENTO[c.forma] ?? c.forma}</td>
              <td>{c.conta_nome}</td>
              <td className="text-right">{c.vendas}</td>
              <td className="text-right text-positivo">+{formatarMoeda(Number(c.valor_cents))}</td>
            </tr>
          ))}
        </Tabela>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Vendas do dia</h2>
        <Tabela cabecalho={["Nº", "Cliente", "Itens", "Total"]} principal="Cliente" direita={["Total"]} total={vendas?.length ?? 0} vazio="Nenhuma venda.">
          {(vendas ?? []).map((v) => (
            <tr key={v.id} className={v.status === "cancelado" ? "text-texto-suave line-through" : ""}>
              <td className="tabular-nums"><Link href={`/vendas/${v.id}`} className="font-medium hover:underline">{v.numero}</Link></td>
              <td>{v.cliente_nome}{variosPontos && !ponto && <span className="text-xs text-texto-suave"> · {v.ponto_nome}</span>}</td>
              <td className="text-xs text-texto-suave">{v.itens}</td>
              <td className="text-right tabular-nums">{formatarMoeda(v.total_cents)}</td>
            </tr>
          ))}
        </Tabela>
      </section>
    </div>
  );
}
