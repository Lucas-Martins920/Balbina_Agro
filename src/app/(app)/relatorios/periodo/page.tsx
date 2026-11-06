import type { ReactNode } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, ChartColumn, Coins, FileDown, Fish, HeartPulse, Lightbulb, Minus, Presentation, Receipt, Scale, ShoppingCart, Tags, TrendingUp, Wallet, Wheat,
} from "lucide-react";
import { BarrasRanking, GraficoColunas, GraficoLinha, Mini } from "@/components/graficos";
import { Campo, Cartao, classeBotao, Ficha, LinkBotao, Segmentos, Titulo, type Cor } from "@/components/ui";
import { destaques, manchete, PERIODOS, sinalPct, sinalPontos, variacao, type Comparado, type Destaque } from "@/lib/analise-periodo";
import { carregarAnalise } from "@/lib/analise-periodo-dados";
import { formatarInteiro, formatarMoeda, formatarNumero, rotuloMes } from "@/lib/formato";
import { numeroKg, textoKg } from "@/lib/pescado";
import { exigirAcesso } from "@/lib/permissoes";
import { AbasRelatorio } from "../abas";

// Análise do período no padrão dos relatórios de BI: visão geral em cima (manchete e indicadores com
// comparação e tendência), o porquê no meio (gráficos, variações, destaques) e o detalhe embaixo.

export default async function AnalisePeriodo({ searchParams }: PageProps<"/relatorios/periodo">) {
  await exigirAcesso("relatorios");
  const filtros = await searchParams;
  const { analise } = await carregarAnalise(filtros);
  const { periodos: p, regime, financeiro: f, producao: pr, custo: c, vendas: v } = analise;
  const lista = destaques(analise);

  const base = { periodo: p.chave, ...(p.chave === "personalizado" ? { de: p.atual.de, ate: p.atual.ate } : {}), regime };
  const link = (extra: Record<string, string>) => `/relatorios/periodo?${new URLSearchParams({ ...base, ...extra })}`;
  const exportar = (formato: string) => `/relatorios/apresentacao?${new URLSearchParams({ ...base, formato })}`;
  const rotulos = p.atual.meses.map(rotuloMes);
  const varios = p.atual.meses.length > 1;
  // em 12 meses o período anterior já é o do ano passado: uma comparação só
  const comparacao = { anterior: p.anterior.nome, anoAnterior: p.anoAnterior.de === p.anterior.de ? null : p.anoAnterior.nome };
  return (
    <div className="flex max-w-7xl flex-col gap-6">
      <Titulo descricao="O resultado de um período em uma tela: financeiro, produção, custo do kg e vendas, comparados com o período anterior e com o mesmo período do ano passado. Exporte como apresentação pronta.">
        Relatórios
      </Titulo>
      <AbasRelatorio atual="/relatorios/periodo" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Segmentos rotulo="Período" opcoes={(Object.keys(PERIODOS) as (keyof typeof PERIODOS)[]).map((k) => ({
            href: `/relatorios/periodo?${new URLSearchParams({ periodo: k, regime })}`, nome: PERIODOS[k], ativo: p.chave === k,
          }))} />
          <Segmentos rotulo="Regime" opcoes={(["caixa", "competencia"] as const).map((r) => ({ href: link({ regime: r }), nome: r === "caixa" ? "Caixa" : "Competência", ativo: regime === r }))} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="periodo" value="personalizado" />
            <input type="hidden" name="regime" value={regime} />
            <Campo rotulo="De" id="de" name="de" type="month" defaultValue={p.atual.de} required />
            <Campo rotulo="Até" id="ate" name="ate" type="month" defaultValue={p.atual.ate} required />
            <button type="submit" className={classeBotao("secundario")}>Aplicar</button>
          </form>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {/* downloads são arquivos, não páginas: <a download> em vez de <Link> */}
            <a download href={exportar("pdf")} className={classeBotao("primario")}><Presentation size={16} aria-hidden /> Apresentação em PDF</a>
            <a download href={exportar("pptx")} className={classeBotao("secundario")}><FileDown size={16} aria-hidden /> PowerPoint</a>
          </div>
        </div>
      </div>

      <section aria-label="Resumo" className="vidro rounded-2xl border border-borda p-5 sm:p-6">
        <p className="text-[13px] text-texto-suave">
          {regime === "caixa" ? "Regime de caixa" : "Regime de competência"} · comparado com {comparacao.anterior}{comparacao.anoAnterior && ` e ${comparacao.anoAnterior}`}
        </p>
        <p className="mt-1 text-lg leading-snug font-semibold tracking-[-0.015em] text-pretty sm:text-xl">{manchete(analise)}</p>
      </section>

      {f && (
        <section aria-label="Financeiro" className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">Financeiro</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi rotulo="Receita operacional" icone={Wallet} cor="verde" corSerie="var(--verde)" cmp={f.receita} formatar={formatarMoeda} comparacao={comparacao}
              meta={f.meta?.receita ? { valor: f.meta.receita, texto: formatarMoeda(f.meta.receita) } : undefined} />
            <Kpi rotulo="Custos e despesas" icone={Receipt} cor="laranja" corSerie="var(--laranja)" cmp={f.gastos} formatar={formatarMoeda} comparacao={comparacao} melhorSobe={false}
              meta={f.meta?.gastos ? { valor: f.meta.gastos, texto: formatarMoeda(f.meta.gastos), teto: true } : undefined} />
            <Kpi rotulo="Resultado operacional" icone={TrendingUp} cor="violeta" corSerie="var(--violeta)" cmp={f.resultado} formatar={formatarMoeda} comparacao={comparacao}
              detalhe={f.caixa.valor !== null ? <>variação de caixa total: <span className="tabular-nums text-texto">{formatarMoeda(f.caixa.valor)}</span></> : undefined} />
            <Kpi rotulo="Margem operacional" icone={ChartColumn} cor="azul" corSerie="var(--azul)" cmp={f.margem} formatar={(x) => `${formatarNumero(x, 1)}%`} comparacao={comparacao} emPontos />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Cartao titulo={varios ? "Receita × custos mês a mês" : "Receita × custos comparados"} descricao={varios ? "A diferença entre as colunas é o resultado operacional" : `${p.atual.nome}, ${comparacao.anterior} e ${p.anoAnterior.nome}`} icone={ChartColumn} cor="azul">
              <GraficoColunas
                rotulo="Receita operacional e custos por mês"
                rotulos={varios ? rotulos : [rotuloMes(p.anoAnterior.meses[0]), rotuloMes(p.anterior.meses[0]), rotuloMes(p.atual.meses[0])]}
                series={[
                  { nome: "Receita", cor: "var(--verde)", valores: varios ? f.receita.serie.map((x) => x ?? 0) : [f.receita.anoAnterior ?? 0, f.receita.anterior ?? 0, f.receita.valor ?? 0] },
                  { nome: "Custos e despesas", cor: "var(--laranja)", valores: varios ? f.gastos.serie.map((x) => x ?? 0) : [f.gastos.anoAnterior ?? 0, f.gastos.anterior ?? 0, f.gastos.valor ?? 0] },
                ]}
                diferenca="Resultado"
              />
            </Cartao>
            <Destaques lista={lista} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Cartao titulo="O que mais mudou nos gastos" descricao={`Por categoria, sobre ${comparacao.anterior}`} icone={TrendingUp} cor="laranja">
              <BarrasVariacao itens={f.variacoes} />
            </Cartao>
            <Cartao titulo="Para onde foi o dinheiro" descricao={`Custos e despesas operacionais · ${p.atual.nome}`} icone={Tags} cor="violeta"
              acoes={<LinkBotao href={`/relatorios/dre?regime=${regime}&ano=${p.atual.ate.slice(0, 4)}`} tamanho="sm" variante="fantasma">DRE <ArrowRight size={14} aria-hidden /></LinkBotao>}>
              <BarrasRanking itens={f.categorias} cor="var(--violeta)" vazio="Nenhum custo ou despesa no período." />
            </Cartao>
          </div>
        </section>
      )}

      {!f && <Destaques lista={lista} />}

      {(pr || c) && (
        <section aria-label="Produção e custo" className="flex flex-col gap-4">
          <h2 className="mt-2 text-base font-semibold">Produção e custo do kg</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {pr && (
              <>
                <Kpi rotulo="Ração dada" icone={Wheat} cor="amarelo" corSerie="var(--amarelo)" cmp={pr.racao} formatar={(x) => textoKg(x, 0)} comparacao={comparacao} melhorSobe={null}
                  detalhe={pr.taxa.valor !== null ? <><span className="tabular-nums text-texto">{formatarNumero(pr.taxa.valor, 1)}%</span> da biomassa por dia, em média</> : undefined} />
                <Kpi rotulo="Biomassa estimada" icone={Scale} cor="verde" corSerie="var(--verde)" cmp={pr.biomassa} formatar={(x) => textoKg(x, 0)} comparacao={comparacao}
                  detalhe={`no último dia apontado · ${formatarInteiro(pr.peixesMedios)} peixes em média`} />
                <Kpi rotulo="Mortalidade" icone={HeartPulse} cor="rosa" corSerie="var(--rosa)" cmp={pr.mortalidade} formatar={(x) => `${formatarNumero(x, 2)}%`} comparacao={comparacao} emPontos melhorSobe={false}
                  detalhe="baixas sobre a média de peixes no período" />
              </>
            )}
            {c && (
              <Kpi rotulo="Custo do kg produzido" icone={Coins} cor="marca" corSerie="var(--marca)" cmp={c.custoKg} formatar={(x) => formatarMoeda(Math.round(x))} comparacao={comparacao} melhorSobe={false}
                detalhe={v?.precoKg.valor && c.custoKg.valor !== null
                  ? <>vendido a <span className="tabular-nums text-texto">{formatarMoeda(Math.round(v.precoKg.valor))}</span> · margem {formatarNumero(((v.precoKg.valor - c.custoKg.valor) / v.precoKg.valor) * 100, 0)}%{c.conversao.valor !== null ? ` · conversão ${formatarNumero(c.conversao.valor, 2)}` : ""}</>
                  : c.vazio ? "Calcule em Custo do kg" : undefined} />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {pr && (varios ? (
              <Cartao titulo="Produção mês a mês" descricao="Ração dada e taxa de alimentação (% da biomassa por dia)" icone={Fish} cor="amarelo">
                <div className="flex flex-col gap-4">
                  <GraficoColunas rotulo="Ração dada por mês" unidade="kg" rotulos={rotulos}
                    series={[{ nome: "Ração", cor: "var(--amarelo)", valores: pr.racao.serie.map((x) => Math.round(x ?? 0)) }]} />
                  <GraficoLinha rotulo="Taxa de alimentação por mês" unidade="pct" nome="Taxa" cor="var(--verde)" vazio="Sem apontamentos no período."
                    pontos={pr.taxa.serie.map((x, i) => ({ rotulo: rotulos[i], valor: x ?? 0 }))} />
                </div>
              </Cartao>
            ) : (
              <Cartao titulo="Produção comparada" descricao={`Ração dada em ${p.atual.nome}, ${comparacao.anterior} e ${p.anoAnterior.nome}`} icone={Fish} cor="amarelo">
                <GraficoColunas rotulo="Ração dada nos três períodos" unidade="kg"
                  rotulos={[rotuloMes(p.anoAnterior.meses[0]), rotuloMes(p.anterior.meses[0]), rotuloMes(p.atual.meses[0])]}
                  series={[{ nome: "Ração", cor: "var(--amarelo)", valores: [pr.racao.anoAnterior, pr.racao.anterior, pr.racao.valor].map((x) => Math.round(x ?? 0)) }]} />
              </Cartao>
            ))}
            {c && (
              <Cartao titulo="Custo do kg por lote" descricao={p.atual.nome} icone={Coins} cor="marca"
                acoes={<LinkBotao href="/custo-do-kg" tamanho="sm" variante="fantasma">Detalhar <ArrowRight size={14} aria-hidden /></LinkBotao>}>
                {c.lotes.length === 0 ? (
                  <p className="text-sm text-texto-suave">Custo ainda não calculado no período. Recalcule em Custo do kg.</p>
                ) : (
                  <div className="flex flex-col gap-5">
                    <table className="w-full text-sm">
                      <thead className="text-left text-[13px] text-texto-suave">
                        <tr>
                          <th scope="col" className="pb-2 font-medium">Lote</th>
                          <th scope="col" className="pb-2 text-right font-medium">Ganho (kg)</th>
                          <th scope="col" className="pb-2 text-right font-medium">Custo/kg</th>
                          <th scope="col" className="pb-2 text-right font-medium">vs média</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-linha [&_td]:py-2">
                        {c.lotes.slice(0, 8).map((l) => {
                          const d = variacao(l.custoKg!, c.custoKg.valor);
                          return (
                            <tr key={l.lote}>
                              <td className="font-medium">{l.lote}</td>
                              <td className="text-right tabular-nums">{numeroKg(l.ganhoKg, 0)}</td>
                              <td className="text-right tabular-nums">{formatarMoeda(Math.round(l.custoKg!))}</td>
                              <td className={`text-right tabular-nums ${d !== null && d >= 5 ? "text-perigo" : "text-texto-suave"}`}>{d === null ? "–" : sinalPct(d)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div>
                      <p className="mb-1 text-[13px] font-medium text-texto-suave">Composição do custo</p>
                      <BarrasRanking itens={c.composicao} cor="var(--marca)" vazio="Sem composição no período." />
                    </div>
                  </div>
                )}
              </Cartao>
            )}
          </div>
        </section>
      )}

      {v && (
        <section aria-label="Vendas" className="flex flex-col gap-4">
          <h2 className="mt-2 text-base font-semibold">Vendas</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi rotulo="Faturamento" icone={ShoppingCart} cor="azul" corSerie="var(--azul)" cmp={v.faturamento} formatar={formatarMoeda} comparacao={comparacao}
              detalhe={`${formatarInteiro(v.numClientes)} ${v.numClientes === 1 ? "cliente" : "clientes"} compraram`} />
            <Kpi rotulo="Peixe vendido" icone={Fish} cor="amarelo" corSerie="var(--amarelo)" cmp={v.kg} formatar={(x) => textoKg(x, 0)} comparacao={comparacao} />
            <Kpi rotulo="Preço médio do kg" icone={Coins} cor="verde" corSerie="var(--verde)" cmp={v.precoKg} formatar={(x) => formatarMoeda(Math.round(x))} comparacao={comparacao} />
          </div>
          <Cartao titulo="Maiores clientes" descricao={v.numClientes >= 4 ? `Os 3 maiores somam ${formatarNumero(v.concentracaoTop3, 0)}% do faturamento` : p.atual.nome} icone={ShoppingCart} cor="azul"
            acoes={<LinkBotao href={`/relatorios/vendas?de=${p.atual.de}&ate=${p.atual.ate}`} tamanho="sm" variante="fantasma">Curva ABC <ArrowRight size={14} aria-hidden /></LinkBotao>}>
            <BarrasRanking itens={v.clientes.map((x) => ({ nome: x.nome, valor: x.valor }))} cor="var(--azul)" vazio="Nenhuma venda faturada no período." />
          </Cartao>
        </section>
      )}
    </div>
  );
}

// Indicador: valor, comparação com as duas bases (seta + sinal + cor, nunca só a cor) e tendência mês a mês.
function Kpi({
  rotulo, icone, cor, corSerie, cmp, formatar, comparacao, melhorSobe = true, emPontos = false, detalhe, meta,
}: {
  rotulo: string; icone: Parameters<typeof Ficha>[0]["icone"]; cor: Cor; corSerie: string; cmp: Comparado; formatar: (v: number) => string;
  // melhorSobe null: a variação não é boa nem ruim por si (ex.: ração dada cresce com o peixe), fica sem cor
  comparacao: { anterior: string; anoAnterior: string | null }; melhorSobe?: boolean | null; emPontos?: boolean; detalhe?: ReactNode;
  meta?: { valor: number; texto: string; teto?: boolean };
}) {
  const serie = cmp.serie.filter((x): x is number => x !== null);
  const progresso = meta && cmp.valor !== null ? (cmp.valor / meta.valor) * 100 : null;
  return (
    <div className="vidro relative flex flex-col overflow-hidden rounded-2xl border border-borda p-5">
      <div className="flex items-center gap-2.5">
        <Ficha icone={icone} cor={cor} />
        <p className="text-[13px] font-medium text-texto-suave">{rotulo}</p>
      </div>
      <p className="mt-3 text-[28px] leading-tight font-semibold tracking-[-0.025em] tabular-nums">{cmp.valor === null ? "–" : formatar(cmp.valor)}</p>
      <ul className="mt-2 flex flex-col gap-1 text-xs">
        <Delta nome={comparacao.anterior} valor={cmp.valor} base={cmp.anterior} melhorSobe={melhorSobe} emPontos={emPontos} formatar={formatar} />
        {comparacao.anoAnterior && <Delta nome={comparacao.anoAnterior} valor={cmp.valor} base={cmp.anoAnterior} melhorSobe={melhorSobe} emPontos={emPontos} formatar={formatar} />}
      </ul>
      {meta && progresso !== null && (
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-elevado">
            <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, progresso)}%`, background: (meta.teto ? progresso > 100 : progresso < 100) ? "var(--perigo)" : corSerie }} />
          </div>
          <p className="mt-1 text-xs text-texto-suave">{formatarNumero(progresso, 0)}% {meta.teto ? "do teto orçado" : "da meta"} de <span className="tabular-nums text-texto">{meta.texto}</span></p>
        </div>
      )}
      {detalhe && <p className="mt-2 text-xs text-texto-suave">{detalhe}</p>}
      {serie.length > 1 && <div className="mt-auto pt-3"><Mini valores={serie} cor={corSerie} /></div>}
    </div>
  );
}

function Delta({ nome, valor, base, melhorSobe, emPontos, formatar }: {
  nome: string; valor: number | null; base: number | null; melhorSobe: boolean | null; emPontos: boolean; formatar: (v: number) => string;
}) {
  if (valor === null || base === null) return <li className="text-texto-suave">vs {nome}: sem dados</li>;
  const d = emPontos ? valor - base : variacao(valor, base);
  if (d === null) return <li className="text-texto-suave">vs {nome}: {formatar(base)}</li>;
  const neutro = Math.abs(d) < (emPontos ? 0.005 : 0.5);
  const bom = neutro || melhorSobe === null ? null : (d > 0) === melhorSobe;
  const Icone = neutro ? Minus : d > 0 ? ArrowUp : ArrowDown;
  return (
    <li className="flex items-center gap-1.5">
      <span className={`inline-flex shrink-0 items-center gap-0.5 font-medium whitespace-nowrap tabular-nums ${bom === null ? "text-texto-suave" : bom ? "text-positivo" : "text-perigo"}`}>
        <Icone size={12} aria-hidden />{emPontos ? sinalPontos(d) : sinalPct(d)}
      </span>
      <span className="min-w-0 truncate text-texto-suave" title={`${nome}: ${formatar(base)}`}>vs {nome}</span>
    </li>
  );
}

function Destaques({ lista }: { lista: Destaque[] }) {
  return (
    <Cartao titulo="Destaques e próximos passos" descricao="Calculados com os números desta tela" icone={Lightbulb} cor="amarelo">
      {lista.length === 0 ? (
        <p className="text-sm text-texto-suave">Nada fora do comum no período. Os destaques aparecem quando algum número muda de forma relevante.</p>
      ) : (
        <ul className="-my-2 divide-y divide-linha text-sm">
          {lista.map((d, i) => (
            <li key={i} className="flex gap-3 py-2.5">
              <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${d.tom === "positivo" ? "bg-positivo" : d.tom === "perigo" ? "bg-perigo" : "bg-texto-suave"}`} />
              <span className="sr-only">{d.tom === "positivo" ? "Bom sinal:" : d.tom === "perigo" ? "Atenção:" : "Observação:"}</span>
              <span className="min-w-0">
                <span className="block">{d.texto}</span>
                {d.acao && <span className="mt-0.5 block text-[13px] text-texto-suave">→ {d.acao}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

// Barras divergentes: aumento de gasto para a direita (atenção), queda para a esquerda.
function BarrasVariacao({ itens }: { itens: { nome: string; delta: number; pct: number | null; atual: number; anterior: number }[] }) {
  if (itens.length === 0) return <p className="text-sm text-texto-suave">Sem variação nos gastos sobre o período anterior.</p>;
  const max = Math.max(1, ...itens.map((i) => Math.abs(i.delta)));
  return (
    <ul className="flex flex-col gap-2.5">
      {itens.map((i) => (
        <li key={i.nome}>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{i.nome}</span>
            <span className={`font-medium tabular-nums ${i.delta > 0 ? "text-perigo" : "text-positivo"}`}>{i.delta > 0 ? "+" : "−"}{formatarMoeda(Math.abs(i.delta))}</span>
            <span className="w-14 text-right text-xs text-texto-suave tabular-nums">{i.pct === null ? "novo" : sinalPct(i.pct)}</span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-[2px]" title={`${formatarMoeda(i.anterior)} → ${formatarMoeda(i.atual)}`}>
            <div className="flex h-2 justify-end rounded-l-full bg-elevado">
              {i.delta < 0 && <div className="h-2 rounded-l-full bg-positivo" style={{ width: `${(Math.abs(i.delta) / max) * 100}%` }} />}
            </div>
            <div className="h-2 rounded-r-full bg-elevado">
              {i.delta > 0 && <div className="h-2 rounded-r-full bg-perigo" style={{ width: `${(i.delta / max) * 100}%` }} />}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
