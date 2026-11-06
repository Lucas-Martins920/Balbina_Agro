import Link from "next/link";
import { Cartao, CLASSE_BOTAO_TEXTO, classeBotao, Faixa, Indicador, Segmentos, Tabela, Titulo, Vazio } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarInteiro, formatarNumero } from "@/lib/formato";
import { exigirAcesso } from "@/lib/permissoes";
import { textoKg, textoPeso } from "@/lib/pescado";
import { FASES } from "@/lib/rotulos";
import { createClient } from "@/lib/supabase/server";
import { AbasRelatorio } from "../abas";
import {
  DIAS_MINIMOS, FONTES_REFERENCIA, frasesLote, referenciaEspecie, resumoLote, resumoPorEspecie, semanasPorIndicador, UNIFORMIDADE_BAIXA,
  type ResumoZootecnico, type SemanaLote,
} from "@/lib/zootecnico";

const FILTROS_FASE = {
  ativos: { nome: "Povoados", fases: ["alevinagem", "recria", "engorda"] },
  engorda: { nome: "Em engorda", fases: ["engorda"] },
  encerrados: { nome: "Encerrados", fases: ["encerrado"] },
  todos: { nome: "Todos", fases: ["alevinagem", "recria", "engorda", "encerrado"] },
} as const;
type ChaveFase = keyof typeof FILTROS_FASE;

type Lote = { id: string; codigo: string; fase: string; especie_id: string; qtd_povoada: number; data_povoamento: string; peso_inicial_g: number | null; especies: unknown };

const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const fmt = (v: number | null, casas = 1, sufixo = "") => (v === null ? "–" : `${formatarNumero(v, casas)}${sufixo}`);
const peso = (v: number | null) => (v === null ? "–" : textoPeso(v));

export default async function PaginaIndicadores({ searchParams }: PageProps<"/relatorios/indicadores">) {
  await exigirAcesso("lotes");
  const params = await searchParams;
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();

  const fase: ChaveFase = (texto(params.fase) ?? "ativos") in FILTROS_FASE ? (texto(params.fase) as ChaveFase) ?? "ativos" : "ativos";
  const especieFiltro = texto(params.especie) ?? "";

  const { data: todosLotes } = await supabase.from("lotes")
    .select("id, codigo, fase, especie_id, qtd_povoada, data_povoamento, peso_inicial_g, especies(nome)")
    .eq("empresa_id", atual.id).in("fase", [...FILTROS_FASE[fase].fases]).order("data_povoamento", { ascending: false });
  const nomeEspecie = (l: Lote) => (l.especies as { nome: string } | null)?.nome ?? "Sem espécie";
  const especiesNoFiltro = [...new Map((todosLotes ?? []).map((l) => [l.especie_id, nomeEspecie(l as Lote)])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const lotes = ((todosLotes ?? []) as Lote[]).filter((l) => !especieFiltro || l.especie_id === especieFiltro);
  const ids = lotes.map((l) => l.id);

  const [{ data: semanas }, { data: biometrias }] = ids.length ? await Promise.all([
    supabase.from("indicadores_lote_semana").select("*").eq("empresa_id", atual.id).in("lote_id", ids).order("semana").limit(20000),
    supabase.from("biometrias").select("lote_id, data, uniformidade_pct").eq("empresa_id", atual.id).in("lote_id", ids)
      .not("uniformidade_pct", "is", null).order("data", { ascending: false }).limit(5000),
  ]) : [{ data: [] }, { data: [] }];

  const semanasDe = new Map<string, SemanaLote[]>();
  for (const s of semanas ?? []) semanasDe.set(s.lote_id, [...(semanasDe.get(s.lote_id) ?? []), s as SemanaLote]);
  const uniformidadeDe = new Map<string, number>();
  for (const p of biometrias ?? []) if (!uniformidadeDe.has(p.lote_id)) uniformidadeDe.set(p.lote_id, Number(p.uniformidade_pct));

  const linhas = lotes.map((l) => ({
    lote: l, especie: nomeEspecie(l),
    resumo: resumoLote(semanasDe.get(l.id) ?? [], { povoamento: l.data_povoamento, pesoInicialG: l.peso_inicial_g, uniformidade: uniformidadeDe.get(l.id) ?? null }),
  }));
  const comDados = linhas.filter((l) => l.resumo.semanaAtual !== null);
  const media = (f: (r: ResumoZootecnico) => number | null) => {
    const v = comDados.map((l) => f(l.resumo)).filter((x): x is number => x !== null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const soma = (f: (r: ResumoZootecnico) => number | null) => comDados.reduce((s, l) => s + (f(l.resumo) ?? 0), 0);

  // Lote que chega aberto na leitura semana a semana (link "Comparar com outros lotes" da ficha do lote)
  const abertos = new Set((texto(params.lotes) ?? "").split(",").filter((id) => ids.includes(id)));

  const href = (mudar: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const base = { fase, especie: especieFiltro, ...mudar };
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    return `/relatorios/indicadores?${q.toString()}`;
  };
  const porEspecie = resumoPorEspecie(comDados.map((l) => ({ especie: l.especie, resumo: l.resumo })));
  // vermelho quando pior que a referência: abaixo (peso, sobrevivência) ou acima (conversão)
  const tom = (real: number | null, ref: number | null, folga = 0) => (real !== null && ref !== null && real < ref - folga ? "font-semibold text-perigo" : "");

  return (
    <div className="flex max-w-7xl flex-col gap-6">
      <Titulo descricao="Peso, ganho diário, sobrevivência, ração e conversão alimentar de cada lote, escritos lote a lote e comparados com a curva de crescimento da espécie.">
        Indicadores zootécnicos
      </Titulo>
      <AbasRelatorio atual="/relatorios/indicadores" />

      <div className="flex flex-col gap-2">
        <Segmentos rotulo="Fase dos lotes" opcoes={Object.entries(FILTROS_FASE).map(([k, f]) => ({ href: href({ fase: k, especie: null }), nome: f.nome, ativo: k === fase }))} />
        {especiesNoFiltro.length > 1 && (
          <Segmentos rotulo="Espécie" opcoes={[
            { href: href({ especie: null }), nome: "Todas as espécies", ativo: !especieFiltro },
            ...especiesNoFiltro.map(([id, nome]) => ({ href: href({ especie: id }), nome, ativo: id === especieFiltro })),
          ]} />
        )}
      </div>

      {lotes.length === 0 ? (
        <Vazio>Nenhum lote nesta seleção. Povoe lotes em Lotes e lance o apontamento diário e as biometrias para ver os indicadores.</Vazio>
      ) : (
        <>
          <Faixa colunas={5}>
            <Indicador rotulo="Lotes com apontamento" valor={`${comDados.length} de ${lotes.length}`} detalhe={`${formatarInteiro(lotes.reduce((s, l) => s + l.qtd_povoada, 0))} peixes povoados`} />
            <Indicador rotulo="Biomassa" valor={textoKg(soma((r) => r.biomassaKg), 0)} detalhe={`${textoKg(soma((r) => r.kgDespescados), 0)} já despescados`} />
            <Indicador rotulo="Ganho diário médio" valor={fmt(media((r) => r.gpd), 1, " g")} detalhe="por peixe, desde o povoamento" />
            <Indicador rotulo="Sobrevivência média" valor={fmt(media((r) => r.sobrevivencia), 1, "%")} detalhe="peixes vivos sobre os povoados" />
            <Indicador rotulo="Conversão alimentar" valor={fmt(media((r) => r.conversao), 2)} detalhe="kg de ração por kg de peixe ganho" />
          </Faixa>

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-semibold">Lote a lote</h2>
              <p className="text-sm text-texto-suave">O que está acontecendo com cada lote, por escrito. Abra &quot;Semana a semana&quot; para ver cada indicador contra a curva da espécie.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {linhas.map(({ lote, especie, resumo }) => {
                const semanasLote = semanasPorIndicador(semanasDe.get(lote.id) ?? []);
                const ref = referenciaEspecie(nomeEspecie(lote));
                return (
                  <Cartao key={lote.id} titulo={`Lote ${lote.codigo}`}
                    descricao={`${especie} · ${FASES[lote.fase] ?? lote.fase} · ${formatarInteiro(lote.qtd_povoada)} peixes povoados`}
                    acoes={<Link href={`/lotes/${lote.id}`} className={classeBotao("secundario", "sm")}>Abrir lote</Link>}>
                    <ul className="flex flex-col gap-1.5 text-sm leading-relaxed">
                      {frasesLote(resumo, ref).map((f) => (
                        <li key={f.texto} className={`flex items-start gap-2 ${f.alerta ? "font-semibold text-perigo" : ""}`}>
                          <span aria-hidden className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${f.classificacao === "abaixo" ? "bg-perigo/15 text-perigo" : f.classificacao === "acima" ? "bg-positivo/15 text-positivo" : "bg-texto-suave/10 text-texto-suave"}`}>
                            {f.classificacao === "abaixo" ? "↓" : f.classificacao === "acima" ? "↑" : f.classificacao === "normal" ? "✓" : "·"}
                          </span>
                          <span>{f.texto}</span>
                        </li>
                      ))}
                    </ul>
                    {semanasLote.length > 0 && (
                      <details open={abertos.has(lote.id)} className="mt-4 border-t border-linha pt-3">
                        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">Semana a semana ({semanasLote.length} {semanasLote.length === 1 ? "semana" : "semanas"})</summary>
                        <div className="mt-2">
                          <Tabela celular="rolar" total={semanasLote.length}
                            cabecalho={["Semana", "Peso", "Curva", "Sobrevivência", "Padrão", "Mort. acum.", "g/peixe/dia", "Padrão", "% peso vivo", "Tabela", "Conversão"]}>
                            {semanasLote.map(({ semana, dias, valores: v }) => (
                              <tr key={semana} className={`tabular-nums ${dias < DIAS_MINIMOS ? "text-texto-suave" : ""}`}>
                                <td className="whitespace-nowrap">{semana}{dias < DIAS_MINIMOS ? ` (${dias} ${dias === 1 ? "dia" : "dias"})` : ""}</td>
                                <td className={tom(v.peso.real, v.peso.padrao === null ? null : v.peso.padrao * 0.85)}>{peso(v.peso.real)}</td>
                                <td className="text-texto-suave">{peso(v.peso.padrao)}</td>
                                <td className={tom(v.sobrevivencia.real, v.sobrevivencia.padrao, 1)}>{fmt(v.sobrevivencia.real, 1, "%")}</td>
                                <td className="text-texto-suave">{fmt(v.sobrevivencia.padrao, 1, "%")}</td>
                                <td>{fmt(v.mortalidade.real, 2, "%")}</td>
                                <td>{fmt(v.consumo.real, 1)}</td>
                                <td className="text-texto-suave">{fmt(v.consumo.padrao, 1)}</td>
                                <td>{fmt(v.taxa.real, 2)}</td>
                                <td className="text-texto-suave">{fmt(v.taxa.padrao, 2)}</td>
                                <td>{fmt(v.conversao.real, 2)}</td>
                              </tr>
                            ))}
                          </Tabela>
                        </div>
                      </details>
                    )}
                  </Cartao>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Todos os lotes lado a lado</h2>
            <Tabela celular="rolar" total={linhas.length}
              cabecalho={["Lote", "Espécie", "Fase", "Semana", "Peso", "Curva", "Desvio", "Ganho diário", "Curva", "Biomassa", "Sobrevivência", "Padrão", "Conversão", "Despescado", "Uniformidade"]}>
              {linhas.map(({ lote, especie, resumo: r }) => {
                const ref = referenciaEspecie(especie);
                return (
                  <tr key={lote.id} className="tabular-nums">
                    <td className="whitespace-nowrap"><Link href={`/lotes/${lote.id}`} className={CLASSE_BOTAO_TEXTO}>{lote.codigo}</Link></td>
                    <td className="whitespace-nowrap">{especie}</td>
                    <td>{FASES[lote.fase] ?? lote.fase}</td>
                    <td className="whitespace-nowrap">{r.semanaAtual === null ? "–" : `${r.semanaAtual}`}</td>
                    <td>{peso(r.pesoAtual)}</td>
                    <td className="text-texto-suave">{peso(r.padraoPeso)}</td>
                    <td className={r.desvioPesoPct !== null && r.desvioPesoPct < -10 ? "font-semibold text-perigo" : ""}>
                      {r.desvioPesoPct === null ? "–" : `${r.desvioPesoPct > 0 ? "+" : ""}${formatarNumero(r.desvioPesoPct, 1)}%`}
                    </td>
                    <td className={tom(r.gpd, r.padraoGpd === null ? null : r.padraoGpd * 0.9)}>{fmt(r.gpd, 1, " g")}</td>
                    <td className="text-texto-suave">{fmt(r.padraoGpd, 1, " g")}</td>
                    <td>{r.biomassaKg === null ? "–" : textoKg(r.biomassaKg, 0)}</td>
                    <td className={tom(r.sobrevivencia, r.padraoSobrevivencia, 1)}>{fmt(r.sobrevivencia, 1, "%")}</td>
                    <td className="text-texto-suave">{fmt(r.padraoSobrevivencia, 1, "%")}</td>
                    <td className={ref && r.conversao !== null && r.conversao > ref.conversao * 1.1 ? "font-semibold text-perigo" : ""}>{fmt(r.conversao, 2)}</td>
                    <td>{r.kgDespescados ? textoKg(r.kgDespescados, 0) : "–"}</td>
                    <td className={r.uniformidade !== null && r.uniformidade < UNIFORMIDADE_BAIXA ? "font-semibold text-perigo" : ""}>{fmt(r.uniformidade, 0, "%")}</td>
                  </tr>
                );
              })}
            </Tabela>
            <p className="text-xs text-texto-suave">
              Peso: última biometria levada pela curva até o fim da semana; desvio em vermelho quando mais de 10% abaixo da curva. Ganho diário desde o povoamento,
              comparado com o que a curva previa no mesmo período. Conversão: ração acumulada por kg de peixe ganho (o despescado entra no ganho), em vermelho quando
              10% acima da referência da Embrapa. Semanas com menos de {DIAS_MINIMOS} dias apontados (em cinza) não entram no consumo.
              A curva de crescimento fica em <Link href="/lotes/especies" className={CLASSE_BOTAO_TEXTO}>Espécies</Link>.
            </p>
          </section>

          {porEspecie.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">Por espécie</h2>
              <Tabela total={porEspecie.length} principal="Espécie" direita={["Lotes", "Peso médio", "Desvio da curva", "Ganho diário", "Sobrevivência", "Conversão"]}
                cabecalho={["Espécie", "Lotes", "Peso médio", "Desvio da curva", "Ganho diário", "Sobrevivência", "Conversão"]}>
                {porEspecie.map((l) => (
                  <tr key={l.especie} className="tabular-nums">
                    <td>{l.especie}</td>
                    <td className="text-right">{l.lotes}</td>
                    <td className="text-right">{peso(l.pesoMedio)}</td>
                    <td className="text-right">{l.desvioPesoMedio === null ? "–" : `${l.desvioPesoMedio > 0 ? "+" : ""}${formatarNumero(l.desvioPesoMedio, 1)}%`}</td>
                    <td className="text-right">{fmt(l.gpdMedio, 1, " g")}</td>
                    <td className="text-right">{fmt(l.sobrevivenciaMedia, 1, "%")}</td>
                    <td className="text-right">{fmt(l.conversaoMedia, 2)}</td>
                  </tr>
                ))}
              </Tabela>
              <p className="text-xs text-texto-suave">Média simples entre os lotes da espécie com apontamento; lotes em fases diferentes entram juntos, então compare com cuidado ou filtre pela fase.</p>
            </section>
          )}

          <section className="flex flex-col gap-2 rounded-2xl border border-borda bg-elevado/30 p-4">
            <h3 className="text-sm font-semibold">Legenda e referências</h3>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-texto-suave">
              <span className="flex items-center gap-1.5"><span className="inline-flex size-4 items-center justify-center rounded-full bg-positivo/15 text-[10px] font-bold text-positivo">↑</span> Melhor que o esperado</span>
              <span className="flex items-center gap-1.5"><span className="inline-flex size-4 items-center justify-center rounded-full bg-texto-suave/10 text-[10px] font-bold text-texto-suave">✓</span> Dentro do esperado</span>
              <span className="flex items-center gap-1.5"><span className="inline-flex size-4 items-center justify-center rounded-full bg-perigo/15 text-[10px] font-bold text-perigo">↓</span> Pior que o esperado</span>
            </div>
            <p className="text-xs text-texto-suave">
              Peso, ganho, ração e sobrevivência são comparados com a curva de crescimento cadastrada da espécie, a partir do peso do povoamento.
              A conversão alimentar do tambaqui e de seus híbridos é comparada com a referência publicada pela Embrapa. Fontes:
            </p>
            <ul className="list-disc pl-5 text-xs text-texto-suave">
              {FONTES_REFERENCIA.map((f) => <li key={f.assunto}><strong>{f.assunto}</strong>: {f.fonte}</li>)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
