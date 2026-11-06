import Link from "next/link";
import { Banknote, PiggyBank, TrendingDown, TrendingUp } from "lucide-react";
import { BarraPartes, GraficoColunas, GraficoLinha } from "@/components/graficos";
import { Aviso, Cartao, CartaoKpi, CLASSE_BOTAO_TEXTO, Etiqueta, Segmentos, Tabela, Titulo } from "@/components/ui";
import { formatarData, formatarInteiro, formatarMoeda, formatarNumero, rotuloMes } from "@/lib/formato";
import { textoKg, textoPeso } from "@/lib/pescado";
import { exigirAcesso } from "@/lib/permissoes";
import { CATEGORIAS, fluxoMensal, type Categoria } from "@/lib/planejamento";
import { carregarPlanejamento, estudosDoPlano } from "@/lib/planejamento-dados";
import { BarrasResultado, ColunasEmpilhadas } from "@/components/graficos-planejamento";
import { AbasPlanejamento, SemManejo } from "../linha-do-tempo";

const COR_CATEGORIA: Record<Categoria, string> = {
  racao: "var(--amarelo)", alevino: "var(--laranja)", vacina: "var(--verde)", medicamento: "var(--rosa)", mao_obra: "var(--azul)",
  energia: "var(--violeta)", embalagem: "var(--marca)", transporte: "var(--texto-suave)", manutencao: "var(--borda)", outros: "var(--linha)",
};

export default async function PaginaViabilidade({ searchParams }: PageProps<"/planejamento/viabilidade">) {
  const [, filtros, d] = await Promise.all([exigirAcesso("planejamento"), searchParams, carregarPlanejamento()]);
  const incluirAtuais = filtros.atuais !== "nao";
  const { previsao, parametros: p, hoje } = d;
  if (!p || !previsao) {
    return (
      <div className="flex max-w-7xl flex-col gap-6">
        <Titulo descricao="Quanto cada lote vai custar e render do povoamento à despesca e o caixa da piscicultura mês a mês.">Planejamento</Titulo>
        <AbasPlanejamento atual="viabilidade" />
        <SemManejo />
      </div>
    );
  }
  const futuros = previsao.lotes.filter((l) => l.origem !== "real");
  const atuais = previsao.lotes.filter((l) => l.origem === "real");
  const estudos = await estudosDoPlano({ parametros: p, previsao, itens: d.itens });

  const doFluxo = [...(incluirAtuais ? atuais : []), ...futuros].map((l) => estudos.get(l.id)!);
  const fluxo = fluxoMensal(doFluxo, hoje, previsao.fim);
  const saldo: { rotulo: string; valor: number }[] = [];
  for (const f of fluxo) saldo.push({ rotulo: rotuloMes(f.mes), valor: (saldo.at(-1)?.valor ?? 0) + f.entradas - f.saidas });
  const pior = Math.min(0, ...saldo.map((s) => s.valor));
  // Com mais de um ano, as colunas agrupam por trimestre para os rótulos caberem
  const porTrimestre = fluxo.length > 12;
  const colunas: { rotulo: string; entradas: number; saidas: number }[] = [];
  for (const f of fluxo) {
    const rotulo = porTrimestre ? `T${Math.floor((Number(f.mes.slice(5, 7)) - 1) / 3) + 1}/${f.mes.slice(2, 4)}` : rotuloMes(f.mes);
    const ultima = colunas.at(-1);
    if (ultima?.rotulo === rotulo) {
      ultima.entradas += f.entradas;
      ultima.saidas += f.saidas;
    } else colunas.push({ rotulo, entradas: f.entradas, saidas: f.saidas });
  }
  const entradas = fluxo.reduce((s, f) => s + f.entradas, 0);
  const saidas = fluxo.reduce((s, f) => s + f.saidas, 0);
  const kgPeriodo = fluxo.reduce((s, f) => s + f.kg, 0);
  const faltando = [...new Set([...estudos.values()].flatMap((e) => e.faltando))];
  const primeiro = futuros[0];
  const exemplo = primeiro ? estudos.get(primeiro.id)! : null;

  return (
    <div className="flex max-w-7xl flex-col gap-6">
      <Titulo descricao="Quanto cada lote vai custar e render do povoamento à despesca, com os custos futuros que você cadastrou, e o caixa da piscicultura mês a mês no horizonte do plano.">
        Planejamento
      </Titulo>
      <AbasPlanejamento atual="viabilidade" />

      {faltando.length > 0 && (
        <Aviso tipo="alerta">
          Faltam premissas para o estudo ficar completo: {faltando.join(", ")}.{" "}
          <Link href="/planejamento/parametros" className={CLASSE_BOTAO_TEXTO}>Preencher</Link>
        </Aviso>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Caixa previsto de {formatarData(hoje)} a {formatarData(previsao.fim)}</h2>
        <Segmentos rotulo="Lotes no caixa" opcoes={[
          { href: "/planejamento/viabilidade", nome: "Lotes atuais e futuros", ativo: incluirAtuais },
          { href: "/planejamento/viabilidade?atuais=nao", nome: "Só os lotes futuros", ativo: !incluirAtuais },
        ]} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CartaoKpi rotulo="Entradas previstas" icone={TrendingUp} cor="verde" valor={formatarMoeda(entradas)}
          detalhe={kgPeriodo > 0 ? `Venda de ${textoKg(kgPeriodo, 0)} de peixe nas despescas` : "Venda do peixe nas despescas"} />
        <CartaoKpi rotulo="Saídas previstas" icone={TrendingDown} cor="laranja" valor={formatarMoeda(saidas)} detalhe="Alevinos, ração e custos cadastrados" />
        <CartaoKpi rotulo="Resultado no período" icone={Banknote} cor="azul" valor={formatarMoeda(entradas - saidas)} tom={entradas - saidas < 0 ? "perigo" : "positivo"} />
        <CartaoKpi rotulo="Maior necessidade de caixa" icone={PiggyBank} cor="violeta" valor={formatarMoeda(-pior)}
          detalhe="Quanto o caixa acumulado chega a ficar negativo até as despescas" tom={pior < 0 ? "perigo" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao titulo={`Entradas e saídas por ${porTrimestre ? "trimestre" : "mês"}`}>
          <GraficoColunas rotulo="Entradas e saídas previstas" rotulos={colunas.map((c) => c.rotulo)} diferenca="Resultado"
            series={[{ nome: "Entradas", cor: "var(--verde)", valores: colunas.map((c) => c.entradas) }, { nome: "Saídas", cor: "var(--laranja)", valores: colunas.map((c) => c.saidas) }]} />
        </Cartao>
        <Cartao titulo="Caixa acumulado" descricao="Soma do resultado mês a mês. O peixe só vira dinheiro na despesca: onde a linha fica abaixo de zero, a piscicultura precisa de capital próprio ou financiamento.">
          <GraficoLinha rotulo="Caixa acumulado previsto" cor="var(--azul)" pontos={saldo} />
        </Cartao>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao titulo="Peixe despescado previsto" descricao="Kg vendáveis por mês, pela curva de crescimento e já sem a perda na despesca.">
          <ColunasEmpilhadas rotulo="Peixe despescado previsto por mês" unidade="kg" rotulos={fluxo.map((f) => rotuloMes(f.mes))}
            series={[{ nome: "Peixe despescado", cor: "var(--azul)", valores: fluxo.map((f) => f.kg) }]} />
        </Cartao>
        <Cartao titulo="Resultado de cada lote futuro" descricao="Do povoamento à despesca: venda do peixe menos todos os custos.">
          <BarrasResultado itens={futuros.map((l) => ({ nome: l.codigo, detalhe: formatarData(l.povoamento), valor: estudos.get(l.id)!.resultado }))} />
        </Cartao>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Estudo por lote, do povoamento à despesca</h2>
          <p className="text-[13px] text-texto-suave">
            Lotes planejados e sugestões do plano. O peso e a ração seguem a curva de crescimento da espécie (sem curva cadastrada, a do tambaqui de
            referência), com a mortalidade informada nos parâmetros.
          </p>
        </div>
        <Tabela celular="rolar" cabecalho={["Lote", "Povoamento", "Despesca", "Alevinos", "Peso final", "Kg despescados", "Conversão", "Receita", "Custo total", "Resultado", "Custo do kg"]}
          direita={["Alevinos", "Peso final", "Kg despescados", "Conversão", "Receita", "Custo total", "Resultado", "Custo do kg"]}
          total={futuros.length} vazio="Nenhum lote futuro no plano. Cadastre viveiros e planeje lotes na aba Lotes e viveiros.">
          {futuros.map((l) => {
            const e = estudos.get(l.id)!;
            return (
              <tr key={l.id} className="tabular-nums">
                <td className="whitespace-nowrap"><span className="font-medium">{l.codigo}</span>{l.origem === "sugerido" && <Etiqueta tom="info" className="ml-1.5">sugestão</Etiqueta>}</td>
                <td>{formatarData(l.povoamento)}</td>
                <td>{formatarData(l.despesca)}</td>
                <td className="text-right">{formatarInteiro(l.peixes)}</td>
                <td className="text-right">{e.pesoFinalG === null ? "–" : textoPeso(e.pesoFinalG)}</td>
                <td className="text-right">{formatarInteiro(Math.round(e.kgDespescados))}</td>
                <td className="text-right">{e.conversao === null ? "–" : formatarNumero(e.conversao, 2)}</td>
                <td className="text-right">{formatarMoeda(e.receita)}</td>
                <td className="text-right">{formatarMoeda(e.custoTotal)}</td>
                <td className={`text-right font-medium ${e.resultado < 0 ? "text-perigo" : "text-positivo"}`}>{formatarMoeda(e.resultado)}</td>
                <td className="text-right">{e.custoKg === null ? "–" : formatarMoeda(e.custoKg)}</td>
              </tr>
            );
          })}
        </Tabela>
        <p className="text-xs text-texto-suave">
          Conversão: kg de ração por kg de peixe ganho. Custo do kg: custo total dividido pelos kg vendáveis; é também o preço mínimo para o lote empatar.
        </p>
      </section>

      {exemplo && primeiro && (
        <Cartao titulo={`Composição do custo: ${primeiro.codigo}`}
          descricao={`${formatarInteiro(primeiro.peixes)} alevinos povoados em ${formatarData(primeiro.povoamento)} · despesca em ${formatarData(primeiro.despesca)}${exemplo.pesoFinalG === null ? "" : ` com ${textoPeso(exemplo.pesoFinalG)} por peixe`}`}>
          <BarraPartes partes={(Object.keys(CATEGORIAS) as Categoria[]).filter((c) => exemplo.custos[c] > 0).sort((a, b) => exemplo.custos[b] - exemplo.custos[a])
            .map((c) => ({ nome: CATEGORIAS[c], valor: exemplo.custos[c], cor: COR_CATEGORIA[c] }))} />
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Receita da despesca", formatarMoeda(exemplo.receita)],
              ["Ração no ciclo", `${formatarNumero(exemplo.racaoKg / 1000, 1)} t`],
              ["Custo do juvenil na engorda", exemplo.custoAteEngorda > 0 ? `${formatarMoeda(Math.round(exemplo.custoAteEngorda / primeiro.peixes))} por alevino` : "–"],
              ["Capital empatado no pior momento", formatarMoeda(-exemplo.piorCaixa)],
            ].map(([r, v]) => (
              <div key={r}><dt className="text-[13px] text-texto-suave">{r}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>
            ))}
          </dl>
        </Cartao>
      )}

      {atuais.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold">Lotes povoados: o que ainda vem até a despesca</h2>
          <Tabela cabecalho={["Lote", "Despesca", "Kg a despescar", "Receita a entrar", "Custos a pagar", "Resultado restante"]}
            direita={["Kg a despescar", "Receita a entrar", "Custos a pagar", "Resultado restante"]} total={atuais.length}>
            {atuais.map((l) => {
              const sem = estudos.get(l.id)!.semanas.filter((s) => s.data >= hoje);
              const receita = sem.reduce((s, x) => s + x.receita, 0);
              const custo = sem.reduce((s, x) => s + Object.values(x.custos).reduce((a, b) => a + (b ?? 0), 0), 0);
              return (
                <tr key={l.id} className="tabular-nums">
                  <td><Link href={`/lotes/${l.id}`} className="font-medium hover:underline">{l.codigo}</Link></td>
                  <td>{formatarData(l.despesca)}{l.despesca < hoje && <Etiqueta tom="alerta" className="ml-1.5">atrasada</Etiqueta>}</td>
                  <td className="text-right">{formatarInteiro(Math.round(sem.reduce((s, x) => s + x.kg, 0)))}</td>
                  <td className="text-right">{formatarMoeda(receita)}</td>
                  <td className="text-right">{formatarMoeda(custo)}</td>
                  <td className={`text-right font-medium ${receita - custo < 0 ? "text-perigo" : ""}`}>{formatarMoeda(receita - custo)}</td>
                </tr>
              );
            })}
          </Tabela>
        </section>
      )}
    </div>
  );
}
