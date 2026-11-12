import Link from "next/link";
import { BotaoLancamento } from "@/components/lancamento";
import { Campo, CLASSE_BOTAO_TEXTO, classeBotao, Etiqueta, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { diasAtrasISO, formatarData, formatarMoeda, formatarQuantidade } from "@/lib/formato";
import { DIAS_ALERTA_VALIDADE } from "@/lib/racao-estoque";
import { faixaClasse, textoKg } from "@/lib/pescado";
import { createClient } from "@/lib/supabase/server";
import { unidadeSaldo } from "@/lib/estoque";
import { contarPescado } from "./actions";
import { ListaEstoque, type ProdutoEstoque } from "@/components/movimento-estoque";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { AbasEstoque } from "@/components/abas-estoque";

const TIPOS: Record<string, string> = {
  despesca: "Despesca", venda: "Venda", ajuste: "Ajuste", perda: "Perda", transferencia: "Transferência",
  entrada_compra: "Entrada de compra", producao_racao: "Produção de ração", consumo_lote: "Consumo no viveiro", consumo_producao: "Consumo na fábrica",
};

export default async function PaginaEstoque() {
  await exigirAcesso("estoque");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: estoque }, { data: movimentos }, { data: lotes }, { data: produtos }, { data: saldosProdutos }, { data: saldosDeposito }, { data: depositos }, { data: outrosPontos }, { data: entradas }] = await Promise.all([
    supabase.from("estoque_peixe").select("classe_id, classe_nome, ordem, comercializavel, sem_classificacao, saldo, disponivel, peso_min_g, peso_max_g")
      .eq("empresa_id", atual.id).order("ordem"),
    supabase.from("movimentos_estoque").select("id, data, tipo, quantidade, observacao, produtos(nome, tipo, unidade, base_estoque), lotes(codigo)")
      .eq("empresa_id", atual.id).neq("tipo", "despesca")
      .gte("data", diasAtrasISO(30, atual.fuso)).order("data", { ascending: false }).order("created_at", { ascending: false }).limit(100),
    supabase.from("lotes").select("id, codigo").eq("empresa_id", atual.id).neq("fase", "encerrado").order("codigo"),
    supabase.from("produtos").select("id, nome, tipo, unidade, base_estoque, ativo, estoque_minimo, custo_medio_cents, proteina_pct, granulometria, saco_kg")
      .eq("empresa_id", atual.id).order("nome"),
    supabase.from("saldos_produtos").select("produto_id, saldo, valor_cents").eq("empresa_id", atual.id),
    supabase.from("estoque_produtos").select("produto_id, deposito_id, saldo").eq("empresa_id", atual.id),
    supabase.from("depositos").select("id, nome").eq("empresa_id", atual.id).neq("tipo", "peixe").order("nome"),
    supabase.from("estoque_peixe_ponto").select("ponto_venda_id, ponto_nome, saldo, disponivel").eq("empresa_id", atual.id).eq("sede", false).eq("ponto_ativo", true),
    supabase.from("racao_saldos").select("saldo_kg, dias_para_vencer").eq("empresa_id", atual.id).gt("saldo_kg", 0),
  ]);
  // Peixe que está nos outros pontos de venda (o resto da tela é o estoque da piscicultura)
  const pontos = new Map<string, { nome: string; saldo: number; disponivel: number }>();
  for (const e of outrosPontos ?? []) {
    const p = pontos.get(e.ponto_venda_id) ?? { nome: e.ponto_nome, saldo: 0, disponivel: 0 };
    p.saldo += Number(e.saldo);
    p.disponivel += Number(e.disponivel);
    pontos.set(e.ponto_venda_id, p);
  }
  const saldo = new Map((saldosProdutos ?? []).map((s) => [s.produto_id, s]));
  const itens: ProdutoEstoque[] = (produtos ?? []).map((p) => ({
    ...p,
    saldo: Number(saldo.get(p.id)?.saldo ?? 0),
    valor_cents: saldo.get(p.id)?.valor_cents == null ? null : Number(saldo.get(p.id)?.valor_cents),
    estoque_minimo: p.estoque_minimo === null ? null : Number(p.estoque_minimo),
    custo_medio_cents: Number(p.custo_medio_cents),
  }));
  const valorTotal = itens.reduce((s, p) => s + (p.valor_cents ?? 0), 0);
  const total = (estoque ?? []).reduce((s, e) => s + Number(e.saldo), 0);
  const disponivel = (estoque ?? []).filter((e) => e.comercializavel).reduce((s, e) => s + Number(e.disponivel), 0);
  const podeAjustar = pode("estoque.editar");

  // Ração: o resumo; o detalhe (entradas, FEFO, sacos, reserva, movimentos) fica em /racao
  const totalRacao = (entradas ?? []).reduce((s, e) => s + Number(e.saldo_kg), 0);
  const nEntradas = entradas?.length ?? 0;
  const vencidas = (entradas ?? []).filter((e) => e.dias_para_vencer !== null && Number(e.dias_para_vencer) < 0).length;
  const vencendo = (entradas ?? []).filter((e) => e.dias_para_vencer !== null && Number(e.dias_para_vencer) >= 0 && Number(e.dias_para_vencer) <= DIAS_ALERTA_VALIDADE).length;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <AbasEstoque ativa="pescado" />
      <Titulo descricao={`${textoKg(total)} de peixe em estoque${pontos.size ? " na piscicultura" : ""} · ${textoKg(disponivel)} disponíveis para venda`}
        acoes={<>
          <Link href="/despescas?lancar=despesca" className={classeBotao("primario", "md")}>Lançar despesca</Link>
          {podeAjustar && (estoque ?? []).length > 0 && (
            <BotaoLancamento rotulo="Contar o pescado" titulo="Contagem do pescado" acao={contarPescado} botao="Lançar contagem" variante="secundario" icone={null}
              descricao="Pese o que está na câmara ou no gelo. Para cada classe contada, o sistema lança o ajuste da diferença; classe em branco não muda.">
              <div className="grid grid-cols-2 gap-3">
                {(estoque ?? []).map((e) => (
                  <Campo key={e.classe_id} rotulo={`${e.classe_nome} (kg)`} id={`contado_${e.classe_id}`} name={`contado_${e.classe_id}`} inputMode="decimal"
                    placeholder={`sistema: ${textoKg(e.saldo, 2)}`} />
                ))}
              </div>
              <Campo rotulo="Observação" id="contagem_obs" name="observacao" placeholder="Ex.: inventário do fim do mês" />
            </BotaoLancamento>
          )}
        </>}>
        Estoque
      </Titulo>

      <section id="racao" className="flex scroll-mt-6 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Ração</h2>
          <Link href="/racao" className={classeBotao("secundario", "sm")}>Abrir o estoque de ração</Link>
        </div>
        <p className="text-sm text-texto-suave">
          {formatarQuantidade(totalRacao)} kg de ração em {nEntradas} {nEntradas === 1 ? "entrada" : "entradas"} com saldo
          {vencidas > 0 && <> · <Etiqueta tom="perigo">{vencidas} {vencidas === 1 ? "vencida" : "vencidas"}</Etiqueta></>}
          {vencendo > 0 && <> · <Etiqueta tom="alerta">{vencendo} {vencendo === 1 ? "vence" : "vencem"} em até {DIAS_ALERTA_VALIDADE} dias</Etiqueta></>}.
          Entradas, ordem de uso (FEFO), sacos, cobertura, reserva e movimentos ficam no estoque de ração.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Pescado por classe</h2>
        <Tabela cabecalho={["Classe", "Peso do peixe", "Em estoque", "Disponível"]} direita={["Em estoque", "Disponível"]} total={estoque?.length ?? 0}
          vazio="Nenhuma classe de pescado cadastrada.">
          {(estoque ?? []).map((e) => (
            <tr key={e.classe_id} className="tabular-nums">
              <td className="font-medium">{e.classe_nome}{!e.comercializavel && <span className="text-xs text-texto-suave"> (não comercial)</span>}</td>
              <td className="text-texto-suave">{e.sem_classificacao ? "sem separar por tamanho" : faixaClasse(e.peso_min_g, e.peso_max_g) || "–"}</td>
              <td className={`text-right ${Number(e.saldo) < 0 ? "text-perigo" : ""}`}>{textoKg(e.saldo)}</td>
              <td className="text-right font-medium">{e.comercializavel ? textoKg(e.disponivel) : "–"}</td>
            </tr>
          ))}
        </Tabela>
      </section>
      {pontos.size > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Nos pontos de venda</h2>
          <Tabela cabecalho={["Ponto", "Em estoque", "Disponível"]} direita={["Em estoque", "Disponível"]} principal="Ponto" total={pontos.size}>
            {[...pontos.entries()].map(([id, p]) => (
              <tr key={id} className="tabular-nums">
                <td className="font-medium"><Link href={`/pontos-de-venda/${id}`} className={CLASSE_BOTAO_TEXTO}>{p.nome}</Link></td>
                <td className="text-right">{textoKg(p.saldo)}</td>
                <td className="text-right">{textoKg(p.disponivel)}</td>
              </tr>
            ))}
          </Tabela>
        </section>
      )}
      <p className="text-xs text-texto-suave">
        O peixe entra pela <Link href="/despescas" className={CLASSE_BOTAO_TEXTO}>despesca</Link>, em kg, na classe de tamanho separada (ou como inteiro) e sai quando o pedido é faturado:
        o produto de venda diz quantos kg tem a unidade dele (kg ou caixa de 20 kg). Para acertar o saldo, use &quot;Contar o pescado&quot;.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Todos os produtos e insumos</h2>
        <p className="text-sm text-texto-suave">
          Todos os produtos do cadastro, com o saldo somado dos depósitos ({formatarMoeda(valorTotal)} ao custo médio). Clique num produto para lançar entrada, saída ou ajuste de saldo.
        </p>
        <ListaEstoque
          produtos={itens}
          depositos={depositos ?? []}
          saldos={(saldosDeposito ?? []).map((s) => ({ ...s, saldo: Number(s.saldo) }))}
          lotes={(lotes ?? []).map((l) => ({ id: l.id, nome: l.codigo }))}
          podeLancar={pode("estoque.editar") || pode("racao.editar")}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Entradas, saídas e ajustes dos últimos 30 dias</h2>
        <Tabela cabecalho={["Data", "Tipo", "Produto", "Lote", "Quantidade", "Observação"]} principal="Produto" total={movimentos?.length ?? 0} vazio="Nenhum lançamento no período.">
          {(movimentos ?? []).map((m) => {
            const produto = m.produtos as unknown as { nome: string; tipo: string; unidade: string; base_estoque: boolean } | null;
            const lote = m.lotes as unknown as { codigo: string } | null;
            return (
              <tr key={m.id} className="tabular-nums">
                <td>{formatarData(m.data)}</td>
                <td>{TIPOS[m.tipo] ?? m.tipo}</td>
                <td>{produto?.nome ?? "–"}</td>
                <td>{lote?.codigo ?? "–"}</td>
                <td className={Number(m.quantidade) < 0 ? "text-perigo" : ""}>
                  {formatarQuantidade(Number(m.quantidade))} {produto ? unidadeSaldo(produto) : ""}
                </td>
                <td className="text-texto-suave">{m.observacao ?? ""}</td>
              </tr>
            );
          })}
        </Tabela>
      </section>
    </div>
  );
}
