import Link from "next/link";
import { BotaoLancamento } from "@/components/lancamento";
import { Cartao, CLASSE_BOTAO_TEXTO, Etiqueta, LinkBotao, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { diasAtrasISO, formatarData, formatarMoeda, hojeISO } from "@/lib/formato";
import { textoKg } from "@/lib/pescado";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { fretePorUnidade, pctPerda, TIPOS_PONTO } from "@/lib/pontos";
import { carregarPontos } from "@/lib/pontos-dados";
import { createClient } from "@/lib/supabase/server";
import { criarPonto } from "./actions";
import { CamposPonto } from "./campos";

type Resumo = { ponto_venda_id: string; vendas: number; vendido_cents: number; kg_vendidos: number; kg_recebidos: number; perda_kg: number; frete_cents: number };

export default async function PaginaPontosVenda() {
  await exigirAcesso("estoque");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const inicio = diasAtrasISO(30, atual.fuso);
  const [pontos, { data: estoque }, { data: resumo }, { data: caminho }] = await Promise.all([
    carregarPontos(atual.id),
    supabase.from("estoque_peixe_ponto").select("ponto_venda_id, saldo, disponivel").eq("empresa_id", atual.id),
    supabase.rpc("resumo_pontos_venda", { p_empresa: atual.id, p_inicio: inicio, p_fim: hojeISO(atual.fuso) }),
    supabase.from("transferencias_peixe").select("id, numero, data, kg_enviados, origem:pontos_venda!origem_id(nome), destino:pontos_venda!destino_id(nome)")
      .eq("empresa_id", atual.id).eq("status", "em_transito").order("data"),
  ]);
  const saldo = new Map<string, { saldo: number; disponivel: number }>();
  for (const e of estoque ?? []) {
    const s = saldo.get(e.ponto_venda_id) ?? { saldo: 0, disponivel: 0 };
    s.saldo += Number(e.saldo);
    s.disponivel += Number(e.disponivel);
    saldo.set(e.ponto_venda_id, s);
  }
  const porPonto = new Map(((resumo ?? []) as Resumo[]).map((r) => [r.ponto_venda_id, r]));
  const podeEditar = pode("estoque.editar") || pode("configuracoes.editar");

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo descricao="Onde a piscicultura vende: na própria piscicultura e em outros pontos (loja, feira, entreposto). Cada ponto tem estoque de pescado (em kg), caixa e centro de custo próprios."
        acoes={
          <>
            {podeEditar && (
              <BotaoLancamento rotulo="Novo ponto" titulo="Novo ponto de venda" acao={criarPonto} botao="Cadastrar ponto" variante="secundario"
                descricao="Um lugar desta mesma empresa onde você vende. Ele já nasce com estoque de pescado, caixa e centro de custo próprios.">
              <CamposPonto />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="criar_caixa" defaultChecked /> Criar um caixa (dinheiro da gaveta) só para este ponto
              </label>
            </BotaoLancamento>
            )}
            <LinkBotao href="/pontos-de-venda/transferencias">Transferir peixe</LinkBotao>
          </>
        }>
        Pontos de venda
      </Titulo>

      {(caminho ?? []).length > 0 && (
        <Cartao titulo="A caminho" descricao="Transferências que saíram e ainda não foram recebidas no destino."
          acoes={<LinkBotao href="/pontos-de-venda/transferencias" variante="secundario" tamanho="sm">Receber</LinkBotao>}>
          <ul className="flex flex-col gap-1 text-sm">
            {(caminho ?? []).map((t) => (
              <li key={t.id} className="tabular-nums">
                Nº {t.numero} · {formatarData(t.data)} · {(t.origem as unknown as { nome: string }).nome} → {(t.destino as unknown as { nome: string }).nome} · {textoKg(t.kg_enviados)}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pontos.map((p) => {
          const s = saldo.get(p.id) ?? { saldo: 0, disponivel: 0 };
          const r = porPonto.get(p.id);
          const frete = r ? fretePorUnidade(Number(r.frete_cents), Number(r.kg_recebidos)) : null;
          const perda = r ? pctPerda(Number(r.perda_kg), Number(r.kg_recebidos) + Number(r.perda_kg)) : null;
          return (
            <Link key={p.id} href={`/pontos-de-venda/${p.id}`}
              className={`vidro flex flex-col gap-3 rounded-2xl border border-borda p-5 transition-colors duration-150 hover:bg-elevado/50 ${p.ativo ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[17px] font-semibold">{p.nome}</p>
                  <p className="text-xs text-texto-suave">{TIPOS_PONTO[p.tipo] ?? p.tipo}{p.municipio ? ` · ${p.municipio}${p.uf ? `/${p.uf}` : ""}` : ""}</p>
                </div>
                {p.sede ? <Etiqueta tom="info">Piscicultura</Etiqueta> : !p.ativo && <Etiqueta>Inativo</Etiqueta>}
              </div>
              <div>
                <p className="text-[26px] leading-tight font-semibold tabular-nums">{textoKg(s.saldo)}</p>
                <p className="text-xs text-texto-suave tabular-nums">de pescado · {textoKg(s.disponivel)} disponíveis para venda</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
                <dt className="text-texto-suave">Vendas em 30 dias</dt><dd className="text-right">{formatarMoeda(Number(r?.vendido_cents ?? 0))}</dd>
                <dt className="text-texto-suave">Peixe vendido</dt><dd className="text-right">{textoKg(Number(r?.kg_vendidos ?? 0))}</dd>
                {!p.sede && (
                  <>
                    <dt className="text-texto-suave">Peixe recebido</dt><dd className="text-right">{textoKg(Number(r?.kg_recebidos ?? 0))}</dd>
                    <dt className="text-texto-suave">Frete por kg</dt><dd className="text-right">{frete === null ? "–" : formatarMoeda(frete)}</dd>
                    <dt className="text-texto-suave">Perda no transporte</dt><dd className="text-right">{perda === null ? "–" : `${perda.toLocaleString("pt-BR")}%`}</dd>
                  </>
                )}
              </dl>
            </Link>
          );
        })}
      </section>

      <Cartao titulo="Mesma empresa ou outra empresa?" className="max-w-3xl">
        <div className="flex flex-col gap-2 text-sm text-texto-suave">
          <p><strong className="text-texto">Ponto desta empresa</strong> (mesmo CPF ou mesmo CNPJ, ou filial): cadastre aqui. O peixe vai da piscicultura por <Link href="/pontos-de-venda/transferencias" className={CLASSE_BOTAO_TEXTO}>transferência</Link>, com o frete, e o PDV vende do estoque do ponto.</p>
          <p><strong className="text-texto">Outra empresa sua</strong> (CNPJ diferente): cadastre a empresa no Balbina (<Link href="/onboarding" className={CLASSE_BOTAO_TEXTO}>Outra empresa</Link>, no menu) e venda para ela como cliente (pelo CNPJ). Depois de faturar, a página do pedido lança a entrada na loja: peixe no estoque dela e contas a pagar para a piscicultura.</p>
          <p>Nota fiscal na transferência, CFOP e impostos dependem do contador. Veja a lista de perguntas em docs/pontos-de-venda.md.</p>
        </div>
      </Cartao>
    </div>
  );
}
