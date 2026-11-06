import Link from "next/link";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarClock, ChartColumn, ChartLine, ClipboardList, Coins, Fish,
  FolderTree, Landmark, Scale, Tags, TrendingUp, TriangleAlert, Waves, Wheat,
} from "lucide-react";
import { AssistentePainel } from "@/components/assistente-painel";
import { BarraPartes, BarrasRanking, GraficoColunas, GraficoLinha, Mini } from "@/components/graficos";
import { Cartao, CartaoKpi, Etiqueta, LinkBotao, Segmentos, Titulo, type TomEtiqueta } from "@/components/ui";
import { mostrarNoPainel } from "@/lib/assistente";
import { getAssistente } from "@/lib/assistente-dados";
import { getEmpresaAtual, nomeEmpresa } from "@/lib/empresa";
import { semanasFluxo } from "@/lib/fluxo";
import { diasAtrasISO, formatarData, formatarInteiro, formatarMoeda, formatarNumero, hojeISO, somarDias } from "@/lib/formato";
import { producaoPorDia, ranking, receitasDespesas, rotuloMes, type LinhaCaixa, type LinhaLoteDia } from "@/lib/painel";
import { custoKgMes, textoKg, textoPeso } from "@/lib/pescado";
import { getPermissoes } from "@/lib/permissoes";
import { carregarPrevisoes } from "@/lib/previsao-dados";
import { ultimosMeses } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";
import { lerTodas } from "@/lib/supabase/todas";

const PERIODOS = [
  { meses: 1, nome: "Este mês" },
  { meses: 3, nome: "3 meses" },
  { meses: 6, nome: "6 meses" },
];

const NIVEIS: Record<string, { nome: string; tom: TomEtiqueta }> = {
  critico: { nome: "Crítico", tom: "perigo" },
  atencao: { nome: "Atenção", tom: "alerta" },
  info: { nome: "Aviso", tom: "neutro" },
};

// Painel de acompanhamento: financeiro (estilo NIBO) em cima e a produção da piscicultura embaixo.
async function carregarFinanceiro(empresaId: string, mesesRanking: number) {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const hoje = hojeISO(atual.fuso);
  const meses = ultimosMeses(hoje.slice(0, 7), 6);
  const ate90 = somarDias(hoje, 90);
  const em7dias = somarDias(hoje, 7);
  const [{ data: caixa }, { data: competencia }, { data: saldos }, { data: abertos }, { data: previsto }, { data: centros }, { data: proximos }] = await Promise.all([
    lerTodas(() => supabase.from("resultado_caixa").select("mes, tipo, categoria, centro_custo_id, valor_cents").eq("empresa_id", empresaId).gte("mes", meses[0])
      .order("mes").order("tipo").order("categoria").order("centro_custo_id").order("valor_cents")),
    supabase.from("resultado_competencia").select("tipo, valor_cents").eq("empresa_id", empresaId).eq("mes", meses[5]),
    supabase.from("saldos_contas").select("saldo_cents, tipo").eq("empresa_id", empresaId).eq("arquivada", false),
    lerTodas(() => supabase.from("titulos").select("tipo, situacao, saldo_cents").eq("empresa_id", empresaId).in("status", ["aberto", "parcial"]).order("id")),
    lerTodas(() => supabase.from("fluxo_previsto").select("data, valor_cents").eq("empresa_id", empresaId).lte("data", ate90).order("agendamento_id")),
    supabase.from("centros_custo").select("id, nome").eq("empresa_id", empresaId),
    supabase.from("titulos").select("id, tipo, descricao, contato_nome, vencimento, saldo_cents")
      .eq("empresa_id", empresaId).in("situacao", ["aberto", "parcial"]).lte("vencimento", em7dias).order("vencimento").limit(6),
  ]);

  const linhas = (caixa ?? []) as LinhaCaixa[];
  const { receitas, despesas } = receitasDespesas(meses, linhas);
  const desde = meses[6 - mesesRanking];
  const doPeriodo = linhas.filter((l) => l.mes.slice(0, 10) >= desde);
  const nomeCentro = new Map((centros ?? []).map((c) => [c.id, c.nome]));
  const saldo = (saldos ?? []).filter((s) => s.tipo !== "cartao_credito").reduce((t, s) => t + Number(s.saldo_cents), 0);
  const somaAberto = (tipo: string, vencido: boolean) =>
    (abertos ?? []).filter((t) => t.tipo === tipo && (t.situacao === "vencido") === vencido).reduce((s, t) => s + Number(t.saldo_cents), 0);
  const semanas = semanasFluxo(saldo, hoje, ate90, (previsto ?? []).map((p) => ({ data: p.data, valor_cents: Number(p.valor_cents) })));

  return {
    meses,
    receitas,
    despesas,
    resultadoMes: receitas[5] - despesas[5],
    competenciaMes: (competencia ?? []).reduce((s, l) => s + (l.tipo === "receber" ? 1 : -1) * Number(l.valor_cents), 0),
    saldo,
    receber: { vencido: somaAberto("receber", true), aVencer: somaAberto("receber", false) },
    pagar: { vencido: somaAberto("pagar", true), aVencer: somaAberto("pagar", false) },
    semanas,
    porCategoria: ranking(doPeriodo, (l) => l.categoria),
    porCentro: ranking(doPeriodo, (l) => (l.centro_custo_id ? nomeCentro.get(l.centro_custo_id) ?? "Centro removido" : "Sem centro de custo")),
    proximos: proximos ?? [],
  };
}

async function carregarProducao(empresaId: string, verCusto: boolean) {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: alocacoes }, { data: dias }, { data: custos }] = await Promise.all([
    supabase.from("alocacoes_atuais")
      .select("viveiro_nome, setor_nome, lote_codigo, peixes_atuais, dias_cultivo, peso_medio_g, biomassa_kg, ultimo_apontamento")
      .eq("empresa_id", empresaId).order("setor_nome").order("viveiro_nome").limit(200),
    lerTodas(() => supabase.from("indicadores_lote_dia").select("lote_id, data, peixes, baixas_peixes, racao_kg, biomassa_kg, oxigenio_min_mg_l")
      .eq("empresa_id", empresaId).gte("data", diasAtrasISO(30, atual.fuso)).order("data").order("lote_id")),
    verCusto
      ? supabase.from("custo_kg_lote").select("mes, custo_total_cents, ganho_kg, preco_kg_cents").eq("empresa_id", empresaId).order("mes", { ascending: false }).limit(100)
      : { data: null },
  ]);
  const lista = alocacoes ?? [];
  const peixes = lista.reduce((s, a) => s + Number(a.peixes_atuais ?? 0), 0);
  const biomassa = lista.reduce((s, a) => s + Number(a.biomassa_kg ?? 0), 0);
  // custo do kg produzido no último mês calculado: custo total dos lotes ÷ ganho de biomassa (kg)
  const ultimoMes = custos?.[0]?.mes;
  const doMes = (custos ?? []).filter((c) => c.mes === ultimoMes);
  const custoKg = custoKgMes(doMes)?.kgCents ?? null;
  const preco = doMes.find((c) => c.preco_kg_cents !== null)?.preco_kg_cents;
  return {
    alocacoes: lista,
    peixes,
    biomassa,
    pesoMedio: peixes > 0 ? (1000 * biomassa) / peixes : null,
    producao: producaoPorDia((dias ?? []) as LinhaLoteDia[]),
    custo: ultimoMes && custoKg !== null ? { mes: ultimoMes as string, kg: custoKg, preco: preco === null || preco === undefined ? null : Number(preco) } : null,
  };
}

async function contar(tabela: string, empresaId: string) {
  const supabase = await createClient();
  const { count } = await supabase.from(tabela).select("*", { count: "exact", head: true }).eq("empresa_id", empresaId);
  return count ?? 0;
}

export default async function Painel({ searchParams }: PageProps<"/painel">) {
  const [filtros, { atual }, { pode, master }] = await Promise.all([searchParams, getEmpresaAtual(), getPermissoes()]);
  const mesesRanking = PERIODOS.find((p) => p.meses === Number(filtros.periodo))?.meses ?? 3;
  // Números de dinheiro só para quem vê os relatórios financeiros
  const verFinanceiro = pode("relatorios.ver");
  const supabase = await createClient();
  const [{ data: alertas }, { data: seguranca }, previsoes, fin, prod, setores, viveiros, lotes, assistente] = await Promise.all([
    supabase.from("alertas").select("*").eq("empresa_id", atual.id).limit(50),
    // senha errada em sequência, chave da API revogada em uso, avisos da API e extrato parados (só o master)
    master ? supabase.rpc("alertas_seguranca", { p_empresa: atual.id }) : { data: null },
    // sinais fora da tendência, ração acabando e caixa negativo, calculados na hora (src/lib/previsao.ts)
    carregarPrevisoes({ projetar: false, verCaixa: verFinanceiro, verCusto: false }),
    verFinanceiro ? carregarFinanceiro(atual.id, mesesRanking) : null,
    carregarProducao(atual.id, pode("custo-do-kg.ver")),
    contar("setores", atual.id),
    contar("viveiros", atual.id),
    contar("lotes", atual.id),
    getAssistente(),
  ]);
  const ordem: Record<string, number> = { critico: 0, atencao: 1, info: 2 };
  const listaAlertas = [...(alertas ?? []), ...((seguranca as typeof alertas) ?? []), ...previsoes.alertas].sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);

  const hoje = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());
  const sinal = (v: number) => (v < 0 ? "perigo" : undefined);
  const ultimoDia = prod.producao.at(-1);
  const virada = fin ? fin.meses[0].slice(0, 4) !== fin.meses[5].slice(0, 4) : false;
  const periodo = PERIODOS.find((p) => p.meses === mesesRanking)!.nome.toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <Titulo
        descricao={`${hoje.charAt(0).toUpperCase()}${hoje.slice(1)}`}
        acoes={
          <>
            <LinkBotao href="/contas-a-pagar" variante="secundario">Lançar conta</LinkBotao>
            <LinkBotao href="/apontamentos" variante="primario">
              <ClipboardList size={16} aria-hidden /> Apontar o dia
            </LinkBotao>
          </>
        }
      >
        {nomeEmpresa(atual)}
      </Titulo>

      {mostrarNoPainel(assistente) && <AssistentePainel situacao={assistente} />}

      {listaAlertas.length > 0 && (
        <section aria-label="Alertas" className="vidro overflow-hidden rounded-2xl border border-borda">
          <header className="flex items-center gap-2 border-b border-linha px-4 py-3">
            <TriangleAlert size={16} aria-hidden className="text-marca" />
            <h2 className="text-[15px] font-semibold">Pede sua atenção</h2>
            <span className="rounded-full bg-marca/16 px-2 text-xs font-medium tabular-nums">{listaAlertas.length}</span>
          </header>
          <ul className="divide-y divide-linha">
            {listaAlertas.slice(0, 4).map((a, i) => (
              <li key={i}>
                <Link
                  href={a.link}
                  className="group flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm transition-colors duration-150 hover:bg-elevado/50"
                >
                  <Etiqueta tom={NIVEIS[a.nivel]?.tom ?? "neutro"}>{NIVEIS[a.nivel]?.nome ?? a.nivel}</Etiqueta>
                  <span className="font-medium">{a.titulo}</span>
                  <span className="text-texto-suave">{a.detalhe}</span>
                  <ArrowRight size={14} aria-hidden className="ml-auto text-texto-suave transition-transform duration-150 group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fin && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <CartaoKpi
              rotulo="Saldo em contas"
              valor={formatarMoeda(fin.saldo)}
              tom={sinal(fin.saldo)}
              icone={Landmark}
              cor="azul"
              href="/contas"
              detalhe={<>em 90 dias: <span className="tabular-nums text-texto">{formatarMoeda(fin.semanas.at(-1)?.saldo ?? fin.saldo)}</span></>}
            >
              <Mini valores={[fin.saldo, ...fin.semanas.map((s) => s.saldo)]} cor="var(--azul)" />
            </CartaoKpi>
            <CartaoKpi rotulo="A receber" valor={formatarMoeda(fin.receber.vencido + fin.receber.aVencer)} icone={ArrowDownLeft} cor="verde" href="/contas-a-receber">
              <BarraPartes partes={[
                { nome: "A vencer", valor: fin.receber.aVencer, cor: "var(--verde)" },
                { nome: "Vencido", valor: fin.receber.vencido, cor: "var(--amarelo)" },
              ]} />
            </CartaoKpi>
            <CartaoKpi rotulo="A pagar" valor={formatarMoeda(fin.pagar.vencido + fin.pagar.aVencer)} icone={ArrowUpRight} cor="laranja" href="/contas-a-pagar">
              <BarraPartes partes={[
                { nome: "A vencer", valor: fin.pagar.aVencer, cor: "var(--laranja)" },
                { nome: "Vencido", valor: fin.pagar.vencido, cor: "var(--perigo)" },
              ]} />
            </CartaoKpi>
            <CartaoKpi
              rotulo={`Resultado de ${rotuloMes(fin.meses[5])} · caixa`}
              valor={formatarMoeda(fin.resultadoMes)}
              tom={sinal(fin.resultadoMes)}
              icone={TrendingUp}
              cor="violeta"
              href="/relatorios/dre?regime=caixa"
              detalhe={<>competência: <span className="tabular-nums text-texto">{formatarMoeda(fin.competenciaMes)}</span></>}
            >
              <Mini valores={fin.receitas.map((r, i) => r - fin.despesas[i])} cor="var(--violeta)" />
            </CartaoKpi>
          </div>

          {/* Análise do mês: no celular fica para a versão completa. */}
          <div className="so-completo grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Cartao
              titulo="Receitas x despesas"
              descricao="Pago e recebido nos últimos 6 meses"
              icone={ChartColumn}
              cor="azul"
              acoes={<LinkBotao href="/relatorios/dre" tamanho="sm" variante="fantasma">DRE <ArrowRight size={14} aria-hidden /></LinkBotao>}
            >
              <GraficoColunas
                rotulo="Receitas e despesas por mês"
                rotulos={fin.meses.map((m, i) => rotuloMes(m, virada && (i === 0 || m.endsWith("-01-01"))))}
                series={[
                  { nome: "Receitas", cor: "var(--verde)", valores: fin.receitas },
                  { nome: "Despesas", cor: "var(--laranja)", valores: fin.despesas },
                ]}
                diferenca="Resultado"
              />
            </Cartao>
            <Cartao
              titulo="Despesas por categoria"
              descricao={`Pagas · ${periodo}`}
              icone={Tags}
              cor="laranja"
            >
              <div className="flex flex-col gap-3">
                <Segmentos
                  rotulo="Período"
                  opcoes={PERIODOS.map((p) => ({ href: `/painel?periodo=${p.meses}`, nome: p.nome, ativo: p.meses === mesesRanking }))}
                />
                <BarrasRanking itens={fin.porCategoria} cor="var(--laranja)" vazio="Nenhuma despesa paga no período." />
              </div>
            </Cartao>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Cartao
              className="so-completo"
              titulo="Fluxo de caixa previsto"
              descricao="Saldo semana a semana com o que está a pagar e a receber"
              icone={ChartLine}
              cor="azul"
              acoes={<LinkBotao href="/fluxo-de-caixa" tamanho="sm" variante="fantasma">Detalhar <ArrowRight size={14} aria-hidden /></LinkBotao>}
            >
              <GraficoLinha
                rotulo="Saldo previsto por semana"
                cor="var(--azul)"
                pontos={[{ rotulo: "Hoje", valor: fin.saldo }, ...fin.semanas.map((s) => ({ rotulo: `até ${formatarData(s.fim).slice(0, 5)}`, valor: s.saldo }))]}
              />
            </Cartao>
            <Cartao titulo="Próximos 7 dias" descricao="O que vence a pagar e a receber" icone={CalendarClock} cor="violeta">
              {fin.proximos.length === 0 ? (
                <p className="text-sm text-texto-suave">Nada vence nos próximos 7 dias.</p>
              ) : (
                <ul className="-my-2 divide-y divide-linha text-sm">
                  {fin.proximos.map((t) => (
                    <li key={t.id}>
                      <Link href={t.tipo === "pagar" ? "/contas-a-pagar" : "/contas-a-receber"} className="flex items-center gap-3 py-2.5">
                        <span aria-hidden className={`size-2 shrink-0 rounded-full ${t.tipo === "receber" ? "bg-verde" : "bg-laranja"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{t.descricao}</span>
                          <span className="block truncate text-xs text-texto-suave">{t.contato_nome ?? "Sem contato"} · {formatarData(t.vencimento)}</span>
                        </span>
                        <span className={`shrink-0 font-medium tabular-nums ${t.tipo === "receber" ? "text-positivo" : ""}`}>
                          {t.tipo === "receber" ? "+" : "−"}{formatarMoeda(t.saldo_cents)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </div>
        </>
      )}

      <section aria-label="Produção" className="flex flex-col gap-4">
        <h2 className="mt-2 text-base font-semibold">Produção</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CartaoKpi
            rotulo="Peixes nos viveiros"
            valor={formatarInteiro(prod.peixes)}
            icone={Fish}
            cor="azul"
            href="/lotes"
            detalhe={`${lotes} ${lotes === 1 ? "lote" : "lotes"} em ${viveiros} ${viveiros === 1 ? "viveiro" : "viveiros"}`}
          >
            <Mini valores={prod.producao.map((d) => d.peixes)} cor="var(--azul)" />
          </CartaoKpi>
          <CartaoKpi
            rotulo="Biomassa estimada"
            valor={textoKg(prod.biomassa, 0)}
            icone={Scale}
            cor="verde"
            href="/relatorios/indicadores"
            detalhe={prod.pesoMedio !== null ? <>peso médio <span className="tabular-nums text-texto">{textoPeso(prod.pesoMedio)}</span>, pela biometria e a curva</> : "Povoe um viveiro para estimar"}
          >
            <Mini valores={prod.producao.map((d) => d.biomassaKg)} cor="var(--verde)" />
          </CartaoKpi>
          <CartaoKpi
            rotulo="Ração no último dia"
            valor={ultimoDia ? textoKg(ultimoDia.racaoKg) : "–"}
            icone={Wheat}
            cor="amarelo"
            href="/apontamentos"
            detalhe={ultimoDia
              ? `${formatarData(ultimoDia.data)}${ultimoDia.taxaPct !== null ? ` · ${formatarNumero(ultimoDia.taxaPct, 1)}% da biomassa` : ""} · ${formatarInteiro(ultimoDia.baixas)} ${ultimoDia.baixas === 1 ? "baixa" : "baixas"}${ultimoDia.oxigenioMin !== null ? ` · OD mín. ${formatarNumero(ultimoDia.oxigenioMin, 1)}` : ""}`
              : "Sem apontamento nos últimos 30 dias"}
          >
            <Mini valores={prod.producao.map((d) => d.racaoKg)} cor="var(--amarelo)" />
          </CartaoKpi>
          <CartaoKpi
            rotulo={prod.custo ? `Custo do kg · ${rotuloMes(prod.custo.mes)}` : "Custo do kg"}
            valor={prod.custo ? formatarMoeda(prod.custo.kg) : "–"}
            icone={Coins}
            cor="marca"
            href="/custo-do-kg"
            detalhe={prod.custo?.preco
              ? <>vendido a <span className="tabular-nums text-texto">{formatarMoeda(prod.custo.preco)}</span>/kg · margem {formatarNumero(((prod.custo.preco - prod.custo.kg) / prod.custo.preco) * 100, 0)}%</>
              : "Calcule em Custo do kg"}
          />
        </div>

        <div className={`grid grid-cols-1 gap-4 ${fin ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}`}>
          <Cartao
            titulo="Viveiros povoados"
            descricao={`${setores} ${setores === 1 ? "setor" : "setores"} · ${viveiros} ${viveiros === 1 ? "viveiro" : "viveiros"} · ${lotes} ${lotes === 1 ? "lote" : "lotes"}`}
            icone={Waves}
            cor="azul"
            acoes={<LinkBotao href="/lotes" tamanho="sm" variante="fantasma">Ver lotes <ArrowRight size={14} aria-hidden /></LinkBotao>}
          >
            {prod.alocacoes.length === 0 ? (
              <p className="text-sm text-texto-suave">Nenhum lote povoado ainda.</p>
            ) : (
              <table className="-mx-1 w-[calc(100%+0.5rem)] text-sm">
                <thead className="text-left text-[13px] text-texto-suave">
                  <tr>
                    <th scope="col" className="px-1 pb-2 font-medium">Viveiro</th>
                    <th scope="col" className="px-1 pb-2 font-medium max-sm:hidden">Lote</th>
                    <th scope="col" className="px-1 pb-2 text-right font-medium">Peixes</th>
                    <th scope="col" className="px-1 pb-2 text-right font-medium max-sm:hidden">Peso médio</th>
                    <th scope="col" className="px-1 pb-2 text-right font-medium max-sm:hidden">Cultivo</th>
                    <th scope="col" className="px-1 pb-2 text-right font-medium"><span className="sm:hidden">Apontado</span><span className="max-sm:hidden">Último apontamento</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha [&_td]:px-1 [&_td]:py-2">
                  {prod.alocacoes.slice(0, 8).map((g) => {
                    const atrasado = !g.ultimo_apontamento || g.ultimo_apontamento < hojeISO(atual.fuso);
                    return (
                      <tr key={`${g.setor_nome}-${g.viveiro_nome}`}>
                        <td><span className="font-medium">{g.viveiro_nome}</span> <span className="text-texto-suave">· {g.setor_nome}</span></td>
                        <td className="text-texto-suave max-sm:hidden">{g.lote_codigo}</td>
                        <td className="text-right">{formatarInteiro(g.peixes_atuais)}</td>
                        <td className="text-right max-sm:hidden">{g.peso_medio_g !== null ? textoPeso(g.peso_medio_g) : "–"}</td>
                        <td className="text-right text-texto-suave max-sm:hidden">{g.dias_cultivo} dias</td>
                        <td className="text-right">
                          {atrasado ? <Etiqueta tom="alerta">{g.ultimo_apontamento ? formatarData(g.ultimo_apontamento) : "nunca"}</Etiqueta>
                            : <span className="text-texto-suave">{formatarData(g.ultimo_apontamento)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Cartao>
          {fin && (
            <Cartao className="so-completo" titulo="Despesas por centro de custo" descricao={`Pagas · ${periodo}`} icone={FolderTree} cor="violeta">
              <BarrasRanking itens={fin.porCentro} cor="var(--violeta)" vazio="Nenhuma despesa paga no período." />
            </Cartao>
          )}
        </div>
      </section>
    </div>
  );
}
