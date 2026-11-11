import Link from "next/link";
import { BotaoLancamento } from "@/components/lancamento";
import { AreaTexto, Aviso, Campo, CLASSE_BOTAO_TEXTO, classeBotao, Etiqueta, Selecao, Tabela, Titulo } from "@/components/ui";
import { ExcluirLinha } from "@/components/excluir-linha";
import { getEmpresaAtual } from "@/lib/empresa";
import { diasAtrasISO, formatarData, formatarMoeda, formatarQuantidade, hojeISO } from "@/lib/formato";
import { descricaoRacao, numeroEntrada, situacaoValidade, textoSacos } from "@/lib/racao-estoque";
import { faixaClasse, textoKg } from "@/lib/pescado";
import { createClient } from "@/lib/supabase/server";
import { unidadeSaldo } from "@/lib/estoque";
import { contarPescado, excluirEntradaRacao, lancarEntradaRacao } from "./actions";
import { ListaEstoque, type ProdutoEstoque } from "@/components/movimento-estoque";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";

const TIPOS: Record<string, string> = {
  despesca: "Despesca", venda: "Venda", ajuste: "Ajuste", perda: "Perda", transferencia: "Transferência",
  entrada_compra: "Entrada de compra", producao_racao: "Produção de ração", consumo_lote: "Consumo no viveiro", consumo_producao: "Consumo na fábrica",
};

export default async function PaginaEstoque() {
  await exigirAcesso("estoque");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: estoque }, { data: movimentos }, { data: lotes }, { data: produtos }, { data: saldosProdutos }, { data: saldosDeposito }, { data: depositos }, { data: outrosPontos }, { data: entradas }, { data: fornecedores }] = await Promise.all([
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
    // entradas de ração com saldo pelo FEFO: a que vence primeiro é a próxima a sair
    supabase.from("racao_saldos").select("id, numero, produto_id, deposito_id, lote_fabricacao, validade, kg, saldo_kg, dias_para_vencer, abertura")
      .eq("empresa_id", atual.id).gt("saldo_kg", 0).order("validade", { ascending: true, nullsFirst: true }).order("numero"),
    supabase.from("contatos").select("id, nome").eq("empresa_id", atual.id).eq("arquivado", false).contains("tipos", ["fornecedor"]).order("nome"),
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
  const podeRacao = pode("estoque.editar") || pode("racao.editar");

  // Ração: entradas numeradas com saldo; o saldo do produto acima da soma das entradas é ração sem número
  const racoes = (produtos ?? []).filter((p) => p.tipo === "racao");
  const racaoDe = new Map(racoes.map((r) => [r.id, r]));
  const nomeDeposito = new Map((depositos ?? []).map((d) => [d.id, d.nome]));
  const naEntrada = new Map<string, number>();
  for (const e of entradas ?? []) naEntrada.set(e.produto_id, (naEntrada.get(e.produto_id) ?? 0) + Number(e.saldo_kg));
  const semNumero = racoes
    .map((r) => ({ nome: r.nome, kg: Number(saldo.get(r.id)?.saldo ?? 0) - (naEntrada.get(r.id) ?? 0) }))
    .filter((r) => r.kg > 0.0005);
  const totalRacao = (entradas ?? []).reduce((s, e) => s + Number(e.saldo_kg), 0) + semNumero.reduce((s, r) => s + r.kg, 0);

  return (
    <div className="flex max-w-6xl flex-col gap-6">
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

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Ração</h2>
          {podeRacao && racoes.some((r) => r.ativo) && (
            <BotaoLancamento rotulo="Entrada de ração" titulo="Entrada de ração" acao={lancarEntradaRacao} botao="Lançar entrada" tamanho="sm" chave="entrada-racao"
              descricao="Cada compra recebe um número (R-1, R-2…) para a rastreabilidade. Informe os sacos (o kg sai do peso do saco no cadastro) ou os kg.">
              <Selecao rotulo="Ração" id="er_produto" name="produto_id" defaultValue="" required>
                <option value="" disabled>Escolha…</option>
                {racoes.filter((r) => r.ativo).map((r) => (
                  <option key={r.id} value={r.id}>{descricaoRacao(r)}{r.saco_kg ? ` (saco de ${formatarQuantidade(Number(r.saco_kg))} kg)` : ""}</option>
                ))}
              </Selecao>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Sacos" id="er_sacos" name="sacos" inputMode="decimal" placeholder="Ex.: 10" />
                <Campo rotulo="ou kg" id="er_kg" name="kg" inputMode="decimal" placeholder="Ex.: 250" />
                <Campo rotulo="Lote de fabricação" id="er_lote" name="lote_fabricacao" placeholder="Impresso no saco" />
                <Campo rotulo="Validade" id="er_validade" name="validade" type="date" required />
                <Campo rotulo="Fabricação" id="er_fabricacao" name="fabricacao" type="date" />
                <Campo rotulo="Chegou em" id="er_data" name="data" type="date" defaultValue={hojeISO(atual.fuso)} max={hojeISO(atual.fuso)} required />
                <Campo rotulo="Valor total (R$)" id="er_custo" name="custo_total" inputMode="decimal" placeholder="0,00" />
                <Selecao rotulo="Depósito" id="er_deposito" name="deposito_id" defaultValue="">
                  <option value="">Padrão</option>
                  {(depositos ?? []).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </Selecao>
              </div>
              <Selecao rotulo="Fornecedor" id="er_fornecedor" name="fornecedor_id" defaultValue="">
                <option value="">Não informado</option>
                {(fornecedores ?? []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </Selecao>
              <AreaTexto rotulo="Observação" id="er_obs" name="observacoes" rows={2} />
            </BotaoLancamento>
          )}
        </div>
        <p className="text-sm text-texto-suave">
          {formatarQuantidade(totalRacao)} kg de ração em estoque. O trato usa primeiro a entrada que vence primeiro (FEFO): a ordem abaixo é a ordem de uso.
          {racoes.length === 0 && <> Cadastre as rações (com a ficha técnica) em <Link href="/insumos" className={CLASSE_BOTAO_TEXTO}>Insumos</Link>.</>}
        </p>
        <Tabela cabecalho={["Entrada", "Ração", "Lote", "Validade", "Saldo", "Depósito", ""]} direita={["Saldo"]} principal="Ração"
          total={entradas?.length ?? 0} vazio="Nenhuma entrada de ração com saldo.">
          {(entradas ?? []).map((e) => {
            const r = racaoDe.get(e.produto_id);
            const validade = situacaoValidade(e.dias_para_vencer === null ? null : Number(e.dias_para_vencer));
            return (
              <tr key={e.id} className="tabular-nums">
                <td className="font-medium">{numeroEntrada(e.numero)}</td>
                <td>{r ? descricaoRacao(r) : "–"}</td>
                <td className="text-texto-suave">{e.abertura ? "saldo anterior" : e.lote_fabricacao ?? "–"}</td>
                <td>
                  {e.validade ? formatarData(e.validade) : "–"}{" "}
                  {validade.tom !== "neutro" && <Etiqueta tom={validade.tom}>{validade.texto}</Etiqueta>}
                </td>
                <td className="text-right">
                  {formatarQuantidade(Number(e.saldo_kg))} kg
                  {r?.saco_kg ? <span className="block text-xs whitespace-nowrap text-texto-suave">{textoSacos(Number(e.saldo_kg), Number(r.saco_kg))}</span> : null}
                </td>
                <td className="text-texto-suave">{nomeDeposito.get(e.deposito_id) ?? "–"}</td>
                <td>{podeRacao && !e.abertura && Number(e.saldo_kg) === Number(e.kg) && <ExcluirLinha acao={excluirEntradaRacao} id={e.id} />}</td>
              </tr>
            );
          })}
        </Tabela>
        {semNumero.length > 0 && (
          <Aviso tipo="info">
            Ração sem entrada numerada (ajuste de saldo para mais): {semNumero.map((r) => `${r.nome}: ${formatarQuantidade(r.kg)} kg`).join("; ")}.
          </Aviso>
        )}
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
