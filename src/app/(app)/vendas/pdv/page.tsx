import { escolherPontoPdv } from "@/app/(app)/vendas/actions";
import { Botao, CLASSE_CONTROLE, LinkBotao, Titulo } from "@/components/ui";
import { Pdv } from "@/components/vendas/pdv";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { formatarMoeda, hojeISO } from "@/lib/formato";
import { carregarPontos, pontoDoPdv } from "@/lib/pontos-dados";
import { createClient } from "@/lib/supabase/server";
import { carregarCatalogo } from "@/lib/vendas-dados";

export default async function PaginaPdv() {
  await exigirAcesso("pdv");
  const { atual } = await getEmpresaAtual();
  const hoje = hojeISO(atual.fuso);
  const supabase = await createClient();
  const pontos = await carregarPontos(atual.id);
  const ponto = await pontoDoPdv(atual.id, pontos);
  const ativos = pontos.filter((p) => p.ativo);
  const [catalogo, { data: caixa }, { data: empresa }, { noPlano }] = await Promise.all([
    carregarCatalogo(atual.id, ponto?.id),
    ponto
      ? supabase.from("caixa_pdv").select("vendas, valor_cents").eq("empresa_id", atual.id).eq("data", hoje).eq("ponto_venda_id", ponto.id)
      : supabase.from("caixa_pdv").select("vendas, valor_cents").eq("empresa_id", atual.id).eq("data", hoje),
    supabase.from("empresas").select("cnpj").eq("id", atual.id).single(),
    getPermissoes(),
  ]);
  // NFC-e no balcão: plano com notas e emitente com CNPJ (produtor rural pessoa física emite NF-e)
  const nfce = noPlano("notas") && empresa?.cnpj.length === 14;
  const vendidoHoje = (caixa ?? []).reduce((s, c) => s + Number(c.valor_cents), 0);
  const onde = ponto && ativos.length > 1 ? ` em ${ponto.nome}` : "";

  return (
    <div className="flex flex-col gap-4">
      <Titulo descricao={`Venda de balcão: toque nos produtos, receba e pronto. Hoje${onde}: ${formatarMoeda(vendidoHoje)}.`}
        acoes={
          <>
            {ativos.length > 1 && (
              <form action={escolherPontoPdv} className="flex items-center gap-2 text-sm">
                <select name="ponto_venda_id" defaultValue={ponto?.id} aria-label="Ponto de venda" className={`h-10 ${CLASSE_CONTROLE}`}>
                  {ativos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <Botao type="submit" variante="secundario">Trocar ponto</Botao>
              </form>
            )}
            <LinkBotao href={`/vendas/pdv/caixa${ponto && ativos.length > 1 ? `?ponto=${ponto.id}` : ""}`} variante="fantasma">Caixa de hoje</LinkBotao>
            <LinkBotao href="/vendas" variante="fantasma">Pedidos</LinkBotao>
          </>
        }>
        {ativos.length > 1 && ponto ? `PDV · ${ponto.nome}` : "PDV"}
      </Titulo>
      <Pdv clientes={catalogo.clientes} produtos={catalogo.produtos} precos={catalogo.precos} listas={catalogo.listas} contas={catalogo.contas} hoje={hoje} empresa={atual.id} nfce={nfce}
        ponto={ponto ? { id: ponto.id, nome: ponto.nome, sede: ponto.sede } : null} key={ponto?.id} />
    </div>
  );
}
