import Link from "next/link";
import { ArrowRight, ChartLine, Coins, Fish, ShoppingCart, TriangleAlert, Wheat } from "lucide-react";
import { BotaoCopiar } from "@/components/vendas/botao-copiar";
import { textoListaCompra } from "@/lib/abastecimento";
import { Aviso, Cartao, CLASSE_BOTAO_TEXTO, Etiqueta, Faixa, Indicador, LinkBotao, Tabela, Titulo, type TomEtiqueta } from "@/components/ui";
import { formatarData, formatarInteiro, formatarMoeda, formatarNumero, somarDias } from "@/lib/formato";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { textoKg, textoPeso } from "@/lib/pescado";
import { COBERTURA_ATENCAO, COBERTURA_CRITICA, LIMITES } from "@/lib/previsao";
import { carregarPrevisoes, DIAS_CONSUMO, SEMANAS_PROJECAO } from "@/lib/previsao-dados";
import { FASES } from "@/lib/rotulos";

const NIVEL: Record<string, { nome: string; tom: TomEtiqueta }> = {
  critico: { nome: "Crítico", tom: "perigo" },
  atencao: { nome: "Atenção", tom: "alerta" },
};

// Previsões sem IA: crescimento do lote projetado pela curva, data de despesca, alertas por desvio de tendência,
// cobertura de ração, caixa e margem da semana no viveiro. Tudo sugestão: a tela mostra o motivo de cada número
// e não muda nada sozinha.
export default async function PaginaPrevisoes() {
  const [, { pode }] = await Promise.all([exigirAcesso("planejamento"), getPermissoes()]);
  const verCaixa = pode("relatorios.ver");
  const verCusto = pode("custo-do-kg.ver");
  const d = await carregarPrevisoes({ projetar: true, verCaixa, verCusto, abastecer: true });
  const ab = d.abastecimento;

  // Biomassa somada de todos os lotes, semana a semana a partir de hoje
  const semanas = Array.from({ length: SEMANAS_PROJECAO }, (_, i) => ({
    data: d.lotes.find((l) => l.projecao.pontos[i])?.projecao.pontos[i].data ?? null,
    kg: d.lotes.reduce((s, l) => s + (l.projecao.pontos[i]?.biomassaKg ?? 0), 0),
  })).filter((s): s is { data: string; kg: number } => s.data !== null);
  const maxKg = Math.max(1, ...semanas.map((s) => s.kg));
  const biomassaHoje = d.lotes.reduce((s, l) => s + (l.biomassaKg ?? 0), 0);
  const biomassa4 = semanas[3]?.kg ?? null;
  const racao4 = d.lotes.reduce((s, l) => s + l.projecao.pontos.slice(0, 4).reduce((t, p) => t + (p.racaoKg ?? 0), 0), 0);
  const limite60 = somarDias(d.hoje, 60);
  const despescas60 = d.lotes.filter((l) => l.projecao.despesca && l.projecao.despesca.data <= limite60);
  const pontoDespesca = d.lotes.filter((l) => l.margem?.semanaNegativa !== null && l.margem?.semanaNegativa !== undefined);
  const racaoCurta = d.cobertura.filter((c) => c.nivel);

  return (
    <div className="flex max-w-7xl flex-col gap-6">
      <Titulo descricao="Contas sobre o que a piscicultura já lança: curva da espécie, biometria, apontamento, estoque, contas e custo do kg. Cada número mostra de onde vem; nada aqui muda sozinho."
        acoes={<LinkBotao href="/planejamento" variante="secundario" tamanho="sm">Planejamento</LinkBotao>}>
        Previsões e alertas
      </Titulo>

      <Faixa colunas={4}>
        <Indicador rotulo="Sinais fora do normal" valor={formatarInteiro(d.tendencia.length)} tom={d.tendencia.some((a) => a.nivel === "critico") ? "perigo" : undefined}
          detalhe={d.tendencia.length ? `${d.tendencia.filter((a) => a.nivel === "critico").length} crítico(s)` : "nenhum lote fora da tendência"} />
        <Indicador rotulo="Biomassa em 4 semanas" valor={biomassa4 === null ? "–" : textoKg(biomassa4, 0)}
          detalhe={`hoje ${textoKg(biomassaHoje, 0)} em ${d.lotes.length} ${d.lotes.length === 1 ? "lote" : "lotes"}`} />
        <Indicador rotulo="Despescas em 60 dias" valor={formatarInteiro(despescas60.length)}
          detalhe={despescas60.length ? despescas60.map((l) => l.codigo).join(", ") : "nenhum lote chega ao peso de despesca"} href="#lotes" />
        {verCaixa && d.fluxo ? (
          <Indicador rotulo="Caixa em 60 dias" valor={formatarMoeda(d.fluxo.semanas.at(-1)?.saldo ?? d.fluxo.saldo)} tom={d.fluxo.negativa ? "perigo" : undefined}
            detalhe={d.fluxo.negativa ? `fica negativo na semana até ${formatarData(d.fluxo.negativa.fim)}` : "sem semana negativa"} href="/fluxo-de-caixa" />
        ) : (
          <Indicador rotulo="Ração e insumos curtos" valor={formatarInteiro(racaoCurta.length)} tom={racaoCurta.some((c) => c.nivel === "critico") ? "perigo" : undefined}
            detalhe={`menos de ${COBERTURA_ATENCAO} dias de estoque`} href="#racao" />
        )}
      </Faixa>

      <Cartao titulo="Sinais fora do normal" icone={TriangleAlert} cor="laranja"
        descricao={`Últimos ${LIMITES.diasRecentes} dias de cada lote contra os ${LIMITES.diasBase} anteriores. Um sinal é atenção; dois no mesmo lote, crítico.`}>
        {d.tendencia.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhum lote fora da tendência. O alerta precisa de pelo menos {LIMITES.diasRecentes + LIMITES.diasBase} dias apontados.</p>
        ) : (
          <ul className="-my-2 divide-y divide-linha text-sm">
            {d.tendencia.map((a) => (
              <li key={a.lote_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <Etiqueta tom={NIVEL[a.nivel].tom}>{NIVEL[a.nivel].nome}</Etiqueta>
                <Link href={`/lotes/${a.lote_id}`} className="font-medium hover:underline">{a.titulo}</Link>
                <span className="text-texto-suave">{a.detalhe}</span>
              </li>
            ))}
          </ul>
        )}
        <details className="mt-4 text-[13px] text-texto-suave">
          <summary className="cursor-pointer">O que conta como sinal</summary>
          <ul className="mt-2 list-disc pl-5">
            <li>Ração aceita por peixe caiu {LIMITES.quedaRacaoPct}% ou mais: o peixe estressado come menos antes de morrer.</li>
            <li>Mortalidade do dia no dobro da normal e acima de {formatarNumero(LIMITES.mortalidadeMinPct, 2)}% ao dia.</li>
            <li>Oxigênio mínimo do dia caiu {formatarNumero(LIMITES.quedaOxigenio, 0)} mg/L ou mais e ficou abaixo de {formatarNumero(LIMITES.oxigenioAtencao, 0)} mg/L (quando a água é medida no apontamento).</li>
          </ul>
          <p className="mt-2">Oxigênio abaixo de 4 mg/L, amônia e pH fora da faixa já aparecem como alertas no painel no mesmo dia. Sinal é convite para olhar o viveiro, não diagnóstico.</p>
        </details>
      </Cartao>

      <Cartao titulo="Biomassa prevista" icone={Fish} cor="azul"
        descricao={`Próximas ${SEMANAS_PROJECAO} semanas, somando os lotes: o peso segue a curva da espécie no ritmo que cada lote mostrou nas biometrias, e os peixes caem pela mortalidade recente.`}>
        {d.lotes.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhum lote povoado.</p>
        ) : semanas.length === 0 ? (
          <p className="text-sm text-texto-suave">Cadastre a curva de crescimento da espécie em <Link href="/lotes/especies" className={CLASSE_BOTAO_TEXTO}>Espécies</Link> e o peso do povoamento para prever a biomassa.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm" aria-label="Biomassa prevista por semana">
            {semanas.map((s) => (
              <li key={s.data} className="grid grid-cols-[5.5rem_minmax(0,1fr)_7rem] items-center gap-3">
                <span className="text-texto-suave tabular-nums">{formatarData(s.data).slice(0, 5)}</span>
                <span className="h-3 overflow-hidden rounded-full bg-elevado">
                  <span className="block h-full rounded-full bg-azul" style={{ width: `${(s.kg / maxKg) * 100}%` }} />
                </span>
                <span className="text-right font-medium tabular-nums">{textoKg(s.kg, 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <section id="lotes" className="flex scroll-mt-6 flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Lotes</h2>
          <p className="text-sm text-texto-suave">
            Ritmo de crescimento contra a curva, quando o lote chega ao peso de despesca e, para quem vê o custo do kg, a margem de cada semana a mais
            no viveiro: o kg que o peixe ganha, pelo preço de venda, menos a ração e os outros custos variáveis. Margem negativa é hora de avaliar a despesca.
          </p>
        </div>
        <Tabela cabecalho={["Lote", "Fase", "Peixes", "Peso hoje", "Ritmo da curva", "Biomassa em 4 sem.", "Chega ao peso de despesca", ...(verCusto ? ["Margem da semana", "Margem negativa"] : [])]}
          direita={["Peixes", "Peso hoje", "Ritmo da curva", "Biomassa em 4 sem.", "Margem da semana"]}
          total={d.lotes.length} vazio="Nenhum lote povoado.">
          {d.lotes.map((l) => {
            const margemAgora = l.margem?.semanas[0]?.margemCents;
            const em4 = l.projecao.pontos[3]?.biomassaKg;
            return (
              <tr key={l.id} className="tabular-nums">
                <td><Link href={`/lotes/${l.id}`} className="font-medium hover:underline">{l.codigo}</Link><span className="text-texto-suave"> · {l.semanaAtual} sem</span></td>
                <td>{FASES[l.fase] ?? l.fase}</td>
                <td className="text-right">{formatarInteiro(l.peixes)}</td>
                <td className="text-right">{textoPeso(l.pesoAtualG)}</td>
                <td className="text-right">
                  {l.projecao.base === "padrao" ? <span className="text-texto-suave">sem biometria</span>
                    : <span className={l.projecao.fator < 0.9 ? "font-semibold text-perigo" : ""}>{formatarNumero(l.projecao.fator * 100, 0)}%</span>}
                </td>
                <td className="text-right">{em4 === undefined ? <span className="text-texto-suave">sem curva</span> : textoKg(em4, 0)}</td>
                <td>
                  {l.pesoAlvoG === null ? <span className="text-texto-suave">sem peso de despesca no lote</span>
                    : l.projecao.despesca ? `${formatarData(l.projecao.despesca.data)} · ${textoPeso(l.projecao.despesca.pesoG)}`
                      : <span className="text-texto-suave">a curva não chega a {textoPeso(l.pesoAlvoG)}</span>}
                </td>
                {verCusto && (
                  <>
                    <td className="text-right">{margemAgora === undefined ? "–" : <span className={margemAgora < 0 ? "text-perigo" : ""}>{formatarMoeda(margemAgora)}</span>}</td>
                    <td>
                      {!l.margem ? <span className="text-texto-suave">sem custo do kg</span>
                        : l.margem.semanaNegativa === null ? <span className="text-texto-suave">não nas próximas semanas</span>
                          : <Etiqueta tom="alerta">semana {l.margem.semanaNegativa} de cultivo</Etiqueta>}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </Tabela>
        {verCusto && pontoDespesca.length > 0 && (
          <p className="text-sm text-texto-suave">
            {pontoDespesca.length === 1 ? "O lote" : "Os lotes"} {pontoDespesca.map((l) => l.codigo).join(", ")} {pontoDespesca.length === 1 ? "passa" : "passam"} a ganhar menos do que custa{pontoDespesca.length === 1 ? "" : "m"} nas próximas semanas.
          </p>
        )}
        {verCusto && (
          <p className="text-xs text-texto-suave">
            Preço do kg vendido e custo do último mês calculado em <Link href="/custo-do-kg" className={CLASSE_BOTAO_TEXTO}>Custo do kg</Link>
            {d.lotes.find((l) => l.margem) ? ` (no lote ${d.lotes.find((l) => l.margem)!.codigo}: peixe a ${formatarMoeda(d.lotes.find((l) => l.margem)!.margem!.precoKgCents)} o kg)` : ""}.
            A ração da semana segue a taxa da curva sobre a biomassa prevista.
          </p>
        )}
      </section>

      <div id="racao" className="scroll-mt-6">
        <Cartao titulo="Ração" icone={Wheat} cor="verde"
          descricao={`Quantos dias o estoque de ração dura no consumo médio dos lotes nos últimos ${DIAS_CONSUMO} dias.`}
          acoes={<LinkBotao href="/estoque#racao" tamanho="sm" variante="fantasma">Estoque de ração <ArrowRight size={14} aria-hidden /></LinkBotao>}>
          {d.cobertura.length === 0 ? (
            <p className="text-sm text-texto-suave">Nenhuma ração com estoque cadastrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-[13px] text-texto-suave">
                <tr>
                  <th scope="col" className="pb-2 font-medium">Ração</th>
                  <th scope="col" className="pb-2 text-right font-medium">Saldo</th>
                  <th scope="col" className="pb-2 text-right font-medium max-sm:hidden">Consumo por dia</th>
                  <th scope="col" className="pb-2 text-right font-medium">Dura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linha [&_td]:py-2">
                {d.cobertura.map((c) => (
                  <tr key={c.produto_id} className="tabular-nums">
                    <td className="font-medium">{c.nome}</td>
                    <td className="text-right">{formatarNumero(c.saldo, 0)} {c.unidade}</td>
                    <td className="text-right text-texto-suave max-sm:hidden">{c.consumoDia ? `${formatarNumero(c.consumoDia, 1)} ${c.unidade}` : "–"}</td>
                    <td className="text-right">
                      {c.dias === null ? <span className="text-texto-suave">sem consumo</span>
                        : c.nivel ? <Etiqueta tom={NIVEL[c.nivel].tom}>{formatarNumero(c.dias, 0)} dias</Etiqueta>
                          : `${formatarNumero(c.dias, 0)} dias`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-texto-suave">
            Abaixo de {COBERTURA_ATENCAO} dias pede atenção; abaixo de {COBERTURA_CRITICA}, é crítico.
            {racao4 > 0 && ` Pela curva, os lotes devem comer ${textoKg(racao4, 0)} de ração nas próximas 4 semanas.`}
          </p>
        </Cartao>
      </div>

      {ab && ab.comprar.length > 0 && (
        <Cartao titulo="Abastecimento sugerido" icone={ShoppingCart} cor="verde"
          descricao={`Pelo consumo médio: a ração a comprar para ${ab.diasCompra} dias. Os dias mudam em Configurações › Automações.`}
          acoes={ab.comprar.length > 0 ? <BotaoCopiar texto={textoListaCompra(ab.comprar, ab.empresa)} rotulo="Copiar lista de compra" /> : undefined}>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Comprar</h3>
              {ab.comprar.length === 0 ? <p className="text-sm text-texto-suave">Nada a comprar no período.</p> : (
                <ul className="divide-y divide-linha text-sm">
                  {ab.comprar.map((c) => (
                    <li key={c.produto_id} className="flex justify-between gap-3 py-2 tabular-nums">
                      <span className="font-medium">{c.nome}</span>
                      <span>{formatarNumero(c.quantidade, 0)} {c.unidade}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-texto-suave">Sugestão: nada é comprado sozinho. Quantidade em kg arredondada de 10 em 10.</p>
        </Cartao>
      )}

      {verCaixa && d.fluxo && (
        <Cartao titulo="Caixa" icone={ChartLine} cor="azul" descricao="Saldo de hoje mais o que está a pagar e a receber nos próximos 60 dias."
          acoes={<LinkBotao href="/fluxo-de-caixa" tamanho="sm" variante="fantasma">Fluxo de caixa <ArrowRight size={14} aria-hidden /></LinkBotao>}>
          {d.fluxo.negativa ? (
            <Aviso tipo="alerta">
              O saldo previsto fica em {formatarMoeda(d.fluxo.negativa.saldo)} na semana até {formatarData(d.fluxo.negativa.fim)}. Veja no fluxo de caixa quais pagamentos mover ou recebimentos antecipar.
            </Aviso>
          ) : (
            <p className="text-sm text-texto-suave">Nenhuma semana com saldo negativo nos próximos 60 dias. Menor saldo previsto: {formatarMoeda(Math.min(d.fluxo.saldo, ...d.fluxo.semanas.map((s) => s.saldo)))}.</p>
          )}
        </Cartao>
      )}

      {!verCusto && !verCaixa && (
        <p className="flex items-center gap-2 text-xs text-texto-suave"><Coins size={14} aria-hidden /> Margem dos lotes e caixa aparecem para quem vê o custo do kg e os relatórios financeiros.</p>
      )}
    </div>
  );
}
