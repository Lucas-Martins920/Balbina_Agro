import Link from "next/link";
import { Wheat } from "lucide-react";
import { BotaoLancamento } from "@/components/lancamento";
import { ExcluirLinha } from "@/components/excluir-linha";
import { SelecaoComNovo } from "@/components/selecao-com-novo";
import { AreaTexto, Aviso, Campo, Cartao, CLASSE_BOTAO_TEXTO, Etiqueta, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, formatarMoeda, formatarQuantidade, hojeISO, somarDias } from "@/lib/formato";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { consumoPorRacao, filaDeConsumo, janelaReserva } from "@/lib/previsao-racao";
import { carregarPlanoRacao } from "@/lib/previsao-racao-dados";
import { descricaoRacao, numeroEntrada, sacosDoSaldo, situacaoValidade } from "@/lib/racao-estoque";
import { createClient } from "@/lib/supabase/server";
import { ajustarEntradaRacao, estornarSaidaRacao, excluirEntradaRacao, lancarEntradaRacao, salvarParametrosRacao } from "./actions";
import { AbasEstoque } from "@/components/abas-estoque";

const TIPOS_AJUSTE: Record<string, string> = {
  contagem: "Contagem", perda: "Perda", avaria: "Avaria (saco rasgado, molhado)", vencimento: "Vencimento", correcao: "Correção de lançamento", outro: "Outro",
};
const ORIGENS: Record<string, string> = {
  web: "Site", campo: "Campo", offline: "Campo (sem internet)", android: "Celular", ajuste: "Ajuste", importacao: "Planilha", conciliacao: "Conciliação", sistema: "Sistema",
};
const TIPOS_MOV: Record<string, string> = { entrada_compra: "Entrada", consumo_lote: "Trato", perda: "Perda", ajuste: "Ajuste" };

const kg = (v: number) => `${formatarQuantidade(v)} kg`;

export default async function PaginaRacao({ searchParams }: { searchParams: Promise<{ entrada?: string }> }) {
  await exigirAcesso("racao");
  const { entrada: filtroEntrada } = await searchParams;
  const { pode } = await getPermissoes();
  const podeLancar = pode("racao.editar") || pode("estoque.editar");
  const { atual } = await getEmpresaAtual();
  const hoje = hojeISO(atual.fuso);
  const supabase = await createClient();

  let qMov = supabase.from("racao_movimentos")
    .select("id, data, created_at, tipo, produto_id, entrada_id, entrada_numero, kg, custo_kg_cents, custo_cents, lote_id, baixa_id, estorno_de, origem_tabela, origem_lancamento, observacao, estornada, lotes(codigo)")
    .eq("empresa_id", atual.id);
  qMov = filtroEntrada ? qMov.eq("entrada_id", filtroEntrada) : qMov.gte("data", somarDias(hoje, -30));
  const [{ data: produtos }, { data: entradas }, { data: depositos }, { data: fornecedores }, { data: movimentos }, plano] = await Promise.all([
    supabase.from("produtos").select("id, nome, ativo, proteina_pct, granulometria, saco_kg, fase_recomendada, fabricante")
      .eq("empresa_id", atual.id).eq("tipo", "racao").order("nome"),
    supabase.from("racao_saldos")
      .select("id, numero, produto_id, deposito_id, data, lote_fabricacao, validade, kg, saldo_kg, dias_para_vencer, vencida, abertura, custo_kg_cents, ordem_consumo")
      .eq("empresa_id", atual.id).gt("saldo_kg", 0).order("validade", { ascending: true, nullsFirst: true }).order("data").order("numero"),
    supabase.from("depositos").select("id, nome").eq("empresa_id", atual.id).neq("tipo", "peixe").order("nome"),
    supabase.from("contatos").select("id, nome").eq("empresa_id", atual.id).eq("arquivado", false).contains("tipos", ["fornecedor"]).order("nome"),
    qMov.order("created_at", { ascending: false }).limit(200),
    carregarPlanoRacao(supabase, atual.id, hoje),
  ]);

  const racoes = produtos ?? [];
  const racaoDe = new Map(racoes.map((r) => [r.id, r]));
  const nomeDeposito = new Map((depositos ?? []).map((d) => [d.id, d.nome]));
  const consumo = new Map(consumoPorRacao(plano.lotes.map((l) => l.previsao)).map((c) => [c.racao.id, c.consumo]));
  const reservaDe = new Map(plano.reserva.map((r) => [r.racao.id, r]));

  // fila do FEFO por ração (só entradas dentro da validade) no ritmo previsto dos lotes
  const uso = new Map<string, ReturnType<typeof filaDeConsumo>[number]>();
  for (const r of racoes) {
    const c = consumo.get(r.id);
    if (!c) continue;
    const doProduto = (entradas ?? []).filter((e) => e.produto_id === r.id && !e.vencida)
      .map((e) => ({ racao_id: r.id, numero: e.numero, saldo_kg: Number(e.saldo_kg), dias_para_vencer: e.dias_para_vencer === null ? null : Number(e.dias_para_vencer) }));
    for (const u of filaDeConsumo(doProduto, c)) uso.set(`${r.id}:${u.numero}`, u);
  }

  // resumo por ração
  const resumo = racoes.map((r) => {
    const doProduto = (entradas ?? []).filter((e) => e.produto_id === r.id);
    const total = doProduto.reduce((s, e) => s + Number(e.saldo_kg), 0);
    const validos = doProduto.filter((e) => !e.vencida).reduce((s, e) => s + Number(e.saldo_kg), 0);
    const c = consumo.get(r.id) ?? [];
    const consumoDia = c.length ? c[0] : 0;
    let resta = validos, dia = 0;
    for (; dia < c.length && resta >= c[dia]; dia++) resta -= c[dia];
    const usaNoHorizonte = c.some((v) => v > 0);
    const falta = usaNoHorizonte && dia < c.length && c.slice(dia).some((v) => v > 0) ? somarDias(hoje, dia + 1) : null;
    return { r, total, validos, vencidos: total - validos, consumoDia, cobertura: usaNoHorizonte ? dia : null, falta, reserva: reservaDe.get(r.id) ?? null };
  }).filter((x) => x.total > 0 || x.consumoDia > 0 || x.r.ativo);

  const totalKg = resumo.reduce((s, x) => s + x.total, 0);
  const janela = janelaReserva(plano.parametros.prazo_entrega_dias);
  const entradaFiltrada = filtroEntrada ? (entradas ?? []).find((e) => e.id === filtroEntrada) : null;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <AbasEstoque ativa="racao" />
      <Titulo descricao={`${kg(totalKg)} de ração em estoque. O trato usa primeiro a entrada que vence primeiro (FEFO).`}
        acoes={podeLancar ? <>
          <BotaoLancamento rotulo="Entrada de ração" titulo="Entrada de ração" acao={lancarEntradaRacao} botao="Lançar entrada" chave="entrada-racao"
            descricao="Cada compra recebe um número (R-1, R-2…) para a rastreabilidade. Informe os sacos (o kg sai do peso do saco no cadastro) ou os kg.">
            <SelecaoComNovo novo="produto" subtipos={{ racao: "Ração" }} subtipoPadrao="racao" rotulo="Ração" id="er_produto" name="produto_id" required defaultValue="">
              <option value="" disabled>Escolha…</option>
              {racoes.filter((r) => r.ativo).map((r) => (
                <option key={r.id} value={r.id}>{descricaoRacao(r)}{r.saco_kg ? ` (saco de ${formatarQuantidade(Number(r.saco_kg))} kg)` : ""}</option>
              ))}
            </SelecaoComNovo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Sacos" id="er_sacos" name="sacos" inputMode="decimal" placeholder="Ex.: 10" />
              <Campo rotulo="ou kg" id="er_kg" name="kg" inputMode="decimal" placeholder="Ex.: 250" />
              <Campo rotulo="Lote de fabricação" id="er_lote" name="lote_fabricacao" placeholder="Impresso no saco" />
              <Campo rotulo="Validade" id="er_validade" name="validade" type="date" required />
              <Campo rotulo="Fabricação" id="er_fabricacao" name="fabricacao" type="date" />
              <Campo rotulo="Chegou em" id="er_data" name="data" type="date" defaultValue={hoje} max={hoje} required />
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
          {(entradas ?? []).length > 0 && (
            <BotaoLancamento rotulo="Ajustar entrada" titulo="Ajuste de uma entrada" acao={ajustarEntradaRacao} botao="Lançar ajuste" variante="secundario" icone={null}
              descricao="Informe o saldo contado da entrada. A diferença vira ajuste com o tipo e o motivo; o saldo antes e depois fica registrado. Ração vencida sai por aqui (tipo Vencimento).">
              <Selecao rotulo="Entrada" id="aj_entrada" name="entrada_id" required defaultValue={entradaFiltrada?.id ?? ""}>
                <option value="" disabled>Escolha…</option>
                {(entradas ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{numeroEntrada(e.numero)} · {racaoDe.get(e.produto_id)?.nome ?? "–"} · {kg(Number(e.saldo_kg))}{e.vencida ? " (vencida)" : ""}</option>
                ))}
              </Selecao>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Saldo contado (kg)" id="aj_kg" name="kg_contado" inputMode="decimal" required placeholder="Ex.: 63" />
                <Selecao rotulo="Tipo" id="aj_tipo" name="tipo" required defaultValue="">
                  <option value="" disabled>Escolha…</option>
                  {Object.entries(TIPOS_AJUSTE).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </Selecao>
              </div>
              <Campo rotulo="Motivo" id="aj_motivo" name="motivo" required placeholder="Ex.: contagem do depósito, 2 sacos molhados" />
            </BotaoLancamento>
          )}
          <BotaoLancamento rotulo="Reserva e amostra" titulo="Reserva de ração e amostra da biometria" acao={salvarParametrosRacao} botao="Salvar" variante="secundario" icone={null}
            descricao="A reserva é quantos sacos manter à frente, divididos entre a ração atual e a da próxima fase. O prazo do fornecedor entra na conta da compra.">
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Reserva (sacos)" id="pr_reserva" name="reserva_sacos" type="number" min={0} max={200} defaultValue={plano.parametros.reserva_sacos} required />
              <Campo rotulo="Prazo do fornecedor (dias)" id="pr_prazo" name="prazo_entrega_dias" type="number" min={0} max={90} defaultValue={plano.parametros.prazo_entrega_dias} required />
              <Campo rotulo="Amostra da biometria (%)" id="pr_pct" name="amostra_pct" inputMode="decimal" defaultValue={String(plano.parametros.amostra_pct).replace(".", ",")} required />
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Mínimo" id="pr_min" name="amostra_min" type="number" min={1} defaultValue={plano.parametros.amostra_min} required />
                <Campo rotulo="Máximo" id="pr_max" name="amostra_max" type="number" min={1} defaultValue={plano.parametros.amostra_max} required />
              </div>
            </div>
          </BotaoLancamento>
        </> : undefined}>
        Estoque de ração
      </Titulo>

      {racoes.length === 0 && (
        <Aviso tipo="info">Cadastre as rações com a ficha técnica (proteína, granulometria e peso do saco) em <Link href="/insumos" className={CLASSE_BOTAO_TEXTO}>Insumos</Link>.</Aviso>
      )}

      <Cartao titulo="Por ração" icone={Wheat} cor="verde"
        descricao={`Consumo previsto pelos lotes (biometria × tabela de arraçoamento). Reserva de até ${plano.parametros.reserva_sacos} sacos para os próximos ${janela} dias (prazo do fornecedor de ${plano.parametros.prazo_entrega_dias} dias + 15).`}>
        <Tabela cabecalho={["Ração", "Estoque", "Sacos", "Consumo/dia", "Cobertura", "Falta em", "Reserva", "Comprar"]}
          direita={["Estoque", "Consumo/dia", "Reserva", "Comprar"]} principal="Ração" total={resumo.length} vazio="Nenhuma ração cadastrada.">
          {resumo.map(({ r, total, vencidos, consumoDia, cobertura, falta, reserva }) => {
            const s = sacosDoSaldo(total, r.saco_kg === null ? null : Number(r.saco_kg));
            return (
              <tr key={r.id} className="tabular-nums">
                <td className="font-medium">{descricaoRacao(r)}{!r.ativo && <span className="text-xs text-texto-suave"> (inativa)</span>}</td>
                <td className="text-right">
                  {kg(total)}
                  {vencidos > 0 && <span className="block text-xs text-perigo">{kg(vencidos)} vencidos</span>}
                </td>
                <td>{s ? <>{s.fechados} fechados{s.abertoKg > 0 && <> + {kg(s.abertoKg)} no aberto</>}<span className="block text-xs text-texto-suave">{formatarQuantidade(s.equivalentes)} sacos</span></>
                  : <span className="text-xs text-texto-suave">sem peso do saco</span>}</td>
                <td className="text-right">{consumoDia > 0 ? kg(Math.round(consumoDia * 10) / 10) : "–"}</td>
                <td>{cobertura === null ? <span className="text-texto-suave">sem consumo previsto</span>
                  : cobertura >= 45 ? "mais de 45 dias" : <Etiqueta tom={cobertura < 7 ? "perigo" : cobertura < 15 ? "alerta" : "neutro"}>{cobertura} dias</Etiqueta>}</td>
                <td>{falta ? formatarData(falta) : "–"}</td>
                <td className="text-right">{reserva?.reservaSacos ?? "–"}</td>
                <td className="text-right">{reserva && reserva.comprarKg > 0
                  ? <>{reserva.comprarSacos !== null ? `${reserva.comprarSacos} sacos` : kg(reserva.comprarKg)}{reserva.venceAntesKg > 0 && <span className="block text-xs text-alerta">{kg(reserva.venceAntesKg)} vencem antes do uso</span>}</>
                  : "–"}</td>
              </tr>
            );
          })}
        </Tabela>
        {plano.lotes.some((l) => l.previsao.confianca === "indisponivel" || l.previsao.semDadosTecnicos) && (
          <p className="mt-3 text-xs text-texto-suave">
            Sem previsão para: {plano.lotes.filter((l) => l.previsao.confianca === "indisponivel" || l.previsao.semDadosTecnicos)
              .map((l) => `${l.codigo} (${l.previsao.motivos[0] ?? "dados insuficientes"})`).join("; ")}. O consumo desses lotes não entra na conta.
          </p>
        )}
      </Cartao>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Entradas com saldo</h2>
        <p className="text-sm text-texto-suave">A ordem é a ordem de uso: a que vence primeiro sai primeiro; na mesma validade, a que chegou antes.</p>
        <Tabela cabecalho={["Ordem", "Entrada", "Ração", "PB", "Granulometria", "Validade", "Saldo", "Sacos fechados", "Saco aberto", "Cobertura", "Alertas", ""]}
          direita={["Saldo"]} principal="Entrada" ocultarNoCelular={["PB", "Granulometria"]} total={entradas?.length ?? 0} vazio="Nenhuma entrada de ração com saldo.">
          {(entradas ?? []).map((e) => {
            const r = racaoDe.get(e.produto_id);
            const dias = e.dias_para_vencer === null ? null : Number(e.dias_para_vencer);
            const validade = situacaoValidade(dias);
            const s = sacosDoSaldo(Number(e.saldo_kg), r?.saco_kg === null || r?.saco_kg === undefined ? null : Number(r.saco_kg));
            const u = uso.get(`${e.produto_id}:${e.numero}`);
            const alertas: { texto: string; tom: "perigo" | "alerta" }[] = [];
            if (e.vencida) alertas.push({ texto: "vencida: só sai por ajuste", tom: "perigo" });
            else if (validade.tom !== "neutro") alertas.push({ texto: validade.texto, tom: validade.tom === "perigo" ? "perigo" : "alerta" });
            if (u && u.venceAntesKg > 0) alertas.push({ texto: `${kg(u.venceAntesKg)} vencem antes do uso`, tom: "perigo" });
            return (
              <tr key={e.id} className="tabular-nums">
                <td>{e.ordem_consumo ? `${e.ordem_consumo}º` : "–"}</td>
                <td className="font-medium">
                  {numeroEntrada(e.numero)}
                  <span className="block text-xs font-normal text-texto-suave">{e.abertura ? "saldo anterior" : `${formatarData(e.data)}${e.lote_fabricacao ? ` · lote ${e.lote_fabricacao}` : ""}`}</span>
                </td>
                <td>{r?.nome ?? "–"}<span className="block text-xs text-texto-suave">{nomeDeposito.get(e.deposito_id) ?? ""}</span></td>
                <td>{r?.proteina_pct ? `${formatarQuantidade(Number(r.proteina_pct))}%` : "–"}</td>
                <td>{r?.granulometria ?? "–"}</td>
                <td>{e.validade ? formatarData(e.validade) : "–"}</td>
                <td className="text-right">{kg(Number(e.saldo_kg))}{e.custo_kg_cents !== null && <span className="block text-xs text-texto-suave">{formatarMoeda(Number(e.custo_kg_cents))}/kg</span>}</td>
                <td>{s ? s.fechados : "–"}</td>
                <td>{s ? (s.abertoKg > 0 ? kg(s.abertoKg) : "–") : "–"}</td>
                <td>{e.vencida ? "–" : !u || u.comecaDia === null ? <span className="text-texto-suave">sem uso previsto</span>
                  : u.acabaDia === null ? `começa em ${u.comecaDia} ${u.comecaDia === 1 ? "dia" : "dias"}` : `acaba em ${formatarData(somarDias(hoje, u.acabaDia))}`}</td>
                <td>{alertas.length ? <span className="flex flex-col items-start gap-1">{alertas.map((a) => <Etiqueta key={a.texto} tom={a.tom}>{a.texto}</Etiqueta>)}</span> : "–"}</td>
                <td className="whitespace-nowrap">
                  <Link href={`/racao?entrada=${e.id}#movimentos`} className={CLASSE_BOTAO_TEXTO}>Movimentos</Link>
                  {podeLancar && !e.abertura && Number(e.saldo_kg) === Number(e.kg) && <ExcluirLinha acao={excluirEntradaRacao} id={e.id} />}
                </td>
              </tr>
            );
          })}
        </Tabela>
      </section>

      <section id="movimentos" className="flex scroll-mt-6 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{entradaFiltrada || filtroEntrada ? `Movimentos da entrada ${entradaFiltrada ? numeroEntrada(entradaFiltrada.numero) : ""}` : "Movimentos dos últimos 30 dias"}</h2>
          {filtroEntrada && <Link href="/racao#movimentos" className={CLASSE_BOTAO_TEXTO}>Ver todos</Link>}
        </div>
        <p className="text-sm text-texto-suave">Cada saída mostra de qual entrada saiu e a que custo. O trato se corrige pelo apontamento; as outras saídas se desfazem com o estorno.</p>
        <Tabela cabecalho={["Data", "Tipo", "Entrada", "Ração", "Lote", "kg", "Custo", "Origem", "Observação", ""]} direita={["kg", "Custo"]} principal="Ração"
          total={movimentos?.length ?? 0} vazio="Nenhum movimento de ração no período.">
          {(movimentos ?? []).map((m, i, todos) => {
            const lote = m.lotes as unknown as { codigo: string } | null;
            const qtd = Number(m.kg);
            // uma saída dividida entre entradas tem várias linhas com o mesmo baixa_id: o botão fica só na primeira
            const estornavel = podeLancar && qtd < 0 && m.baixa_id && !m.estornada && m.origem_tabela !== "apontamento_racoes"
              && todos.findIndex((x) => x.baixa_id === m.baixa_id) === i;
            return (
              <tr key={m.id} className="tabular-nums">
                <td>{formatarData(m.data)}</td>
                <td>{m.estorno_de ? "Estorno" : TIPOS_MOV[m.tipo] ?? m.tipo}{m.estornada && <Etiqueta tom="neutro" className="ml-1">estornada</Etiqueta>}</td>
                <td>{numeroEntrada(m.entrada_numero)}</td>
                <td>{racaoDe.get(m.produto_id)?.nome ?? "–"}</td>
                <td>{lote?.codigo ?? "–"}</td>
                <td className={`text-right ${qtd < 0 ? "text-perigo" : ""}`}>{formatarQuantidade(qtd)}</td>
                <td className="text-right">{m.custo_cents !== null ? formatarMoeda(Math.abs(Number(m.custo_cents))) : "–"}</td>
                <td className="text-texto-suave">{ORIGENS[m.origem_lancamento ?? ""] ?? "–"}</td>
                <td className="text-texto-suave">{m.observacao ?? ""}</td>
                <td>{estornavel && (
                  <BotaoLancamento rotulo="Estornar" titulo={`Estornar saída de ${kg(-qtd)}`} acao={estornarSaidaRacao} botao="Estornar" variante="secundario" tamanho="sm" icone={null}
                    chave={`estorno-${m.id}`} descricao="A ração volta para as mesmas entradas, com o mesmo custo. A saída original continua no histórico, marcada como estornada.">
                    <input type="hidden" name="baixa_id" value={m.baixa_id!} />
                    <Campo rotulo="Motivo" id={`es_${m.id}`} name="motivo" required placeholder="Ex.: lançado em dobro" />
                  </BotaoLancamento>
                )}</td>
              </tr>
            );
          })}
        </Tabela>
      </section>
    </div>
  );
}
