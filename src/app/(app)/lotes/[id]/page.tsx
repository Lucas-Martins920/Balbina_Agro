import Link from "next/link";
import { Calculator } from "lucide-react";
import { notFound } from "next/navigation";
import { AcaoConfirmada } from "@/components/acao-confirmada";
import { ExcluirLinha } from "@/components/excluir-linha";
import { BotaoLancamento } from "@/components/lancamento";
import { AreaTexto, Aviso, Campo, Cartao, CLASSE_BOTAO_TEXTO, classeBotao, Etiqueta, Selecao, Tabela, Titulo } from "@/components/ui";
import { resumoCausas } from "@/lib/causas-morte";
import { crescimentoLote, fatorCrescimento, type Biometria } from "@/lib/crescimento";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, formatarInteiro, formatarMoeda, formatarNumero, hojeISO } from "@/lib/formato";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { textoKg, textoPeso } from "@/lib/pescado";
import { baseDoCiclo, custoSemanalVariavel, mortalidadeSemanal, precoRacaoKg, projetarLote, type CurvaPadrao } from "@/lib/previsao";
import { FASES } from "@/lib/rotulos";
import { createClient } from "@/lib/supabase/server";
import { frasesLote, referenciaEspecie, resumoLote, taxaSemana, type SemanaLote } from "@/lib/zootecnico";
import { encerrarLote, excluirBiometria, reabrirLote, registrarBiometria } from "../actions";
import { SimuladorCiclo } from "./simulador";
import { ViveirosDoLote, type Alocacao, type Transferencia } from "./viveiros";

type RacaoSugerida = {
  peixes: number | null; peso_medio_g: number | null; biomassa_kg: number | null; fase_tabela: string | null; taxa_pct: number | null;
  racao_kg: number | null; refeicoes: number | null; racao_por_refeicao_kg: number | null; proteina_pct: number | null; granulo: string | null;
  ultima_biometria: string | null; oxigenio_min_mg_l: number | null; alerta: string | null;
};

export default async function PaginaLote({ params }: PageProps<"/lotes/[id]">) {
  await exigirAcesso("lotes");
  const { id } = await params;
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const hoje = hojeISO(atual.fuso);

  const { data: lote } = await supabase
    .from("lotes")
    .select("id, codigo, fase, especie_id, data_povoamento, qtd_povoada, peso_inicial_g, peso_alvo_g, previsao_despesca, custo_aquisicao_cents, encerrado_em, motivo_encerramento, especies(nome, nome_cientifico)")
    .eq("empresa_id", atual.id).eq("id", id).maybeSingle();
  if (!lote) notFound();

  const [{ data: semanas }, { data: ocupacao }, { data: alocacoes }, { data: transferencias }, { data: viveiros }, { pode }, { data: biometrias }, { data: curva }, { data: causas }, { data: despescas }, { data: custos }] = await Promise.all([
    supabase.from("indicadores_lote_semana").select("*").eq("lote_id", id).order("semana"),
    supabase.from("alocacoes_atuais").select("lote_id, lote_codigo, viveiro_id, viveiro_nome, setor_nome, peixes_atuais, dias_cultivo, peso_medio_g, biomassa_kg, peixes_m2, kg_m3, ultima_biometria, carencia_ate").eq("empresa_id", atual.id),
    supabase.from("lote_alocacoes").select("id, viveiro_id, qtd_peixes, periodo, motivo, transferencia_id").eq("lote_id", id),
    supabase.from("lote_transferencias").select("id, data, viveiro_origem_id, peixes_origem, observacoes").eq("lote_id", id).order("data").order("created_at"),
    supabase.from("viveiros").select("id, nome, finalidade, capacidade_peixes, ativo, setores(nome)").eq("empresa_id", atual.id).order("nome"),
    getPermissoes(),
    supabase.from("biometrias").select("id, data, viveiro_id, peixes_amostrados, peso_medio_g, comprimento_medio_cm, uniformidade_pct, observacoes").eq("lote_id", id).order("data").order("created_at"),
    supabase.from("curvas_crescimento").select("semana, peso_g, taxa_alimentacao_pct").eq("especie_id", lote.especie_id).not("peso_g", "is", null).order("semana"),
    supabase.from("mortalidade_causas").select("causa, peixes").eq("empresa_id", atual.id).eq("lote_id", id),
    supabase.from("despescas").select("id, data, viveiro_id, tipo, qtd_peixes, kg_total, peso_medio_g, peixes_perdidos").eq("lote_id", id).order("data"),
    supabase.from("custo_kg_lote").select("mes, custo_total_cents, alevinos_cents, indiretos_rateados_cents, racao_cents, racao_kg, preco_kg_cents, custo_acumulado_cents")
      .eq("lote_id", id).order("mes", { ascending: false }).limit(24),
  ]);
  const locais = (ocupacao ?? []).filter((o) => o.lote_id === id);
  const sugestoes = await Promise.all(locais.map(async (l) => {
    const { data } = await supabase.rpc("racao_sugerida", { p_viveiro: l.viveiro_id, p_data: hoje });
    return { local: l, sugestao: ((Array.isArray(data) ? data[0] : data) ?? null) as RacaoSugerida | null };
  }));

  const nomeViveiro = (g: { nome: string; setores: unknown }) => `${(g.setores as { nome: string } | null)?.nome ?? ""} / ${g.nome}`;
  const nomes = new Map((viveiros ?? []).map((g) => [g.id, nomeViveiro(g)]));
  const especie = lote.especies as unknown as { nome: string; nome_cientifico: string | null } | null;
  const encerrado = lote.fase === "encerrado";
  const peixes = locais.reduce((s, a) => s + (a.peixes_atuais ?? 0), 0);
  const biomassa = locais.reduce((s, a) => s + Number(a.biomassa_kg ?? 0), 0);
  const pesoHoje = peixes > 0 ? (biomassa * 1000) / peixes : null;
  const listaSemanas = (semanas ?? []) as SemanaLote[];
  const curvaLote = (curva ?? []) as CurvaPadrao[];

  const pontos = crescimentoLote({ povoamento: lote.data_povoamento, pesoInicialG: lote.peso_inicial_g, biometrias: (biometrias ?? []) as Biometria[], curva: curvaLote });
  const medido = pontos.some((p) => p.peso !== null && p.esperado !== null);
  const projecao = encerrado ? null : projetarLote({
    curva: curvaLote, hoje, povoamento: lote.data_povoamento, pesoAtualG: pesoHoje, peixes,
    fator: fatorCrescimento(pontos, lote.peso_inicial_g), base: medido ? "lote" : "padrao",
    mortalidadeSemanaPct: mortalidadeSemanal(listaSemanas), pesoAlvoG: lote.peso_alvo_g, semanasAFrente: 8,
  });

  // Simulador do resultado do ciclo: projeção até a data da despesca (ou a biomassa de hoje, sem peso de despesca).
  const semanasAteDespesca = projecao?.despesca
    ? Math.max(0, Math.ceil((Date.parse(projecao.despesca.data) - Date.parse(hoje)) / (7 * 86_400_000)))
    : 0;
  const ateDespesca = projecao && semanasAteDespesca > 0 ? projetarLote({
    curva: curvaLote, hoje, povoamento: lote.data_povoamento, pesoAtualG: pesoHoje, peixes,
    fator: projecao.fator, base: projecao.base, mortalidadeSemanaPct: mortalidadeSemanal(listaSemanas),
    pesoAlvoG: lote.peso_alvo_g, semanasAFrente: semanasAteDespesca,
  }).pontos : [];
  const custoMes = custos?.[0] ?? null;
  const precoVenda = (custos ?? []).find((c) => c.preco_kg_cents !== null && Number(c.preco_kg_cents) > 0)?.preco_kg_cents ?? null;

  const ultimaUniformidade = [...(biometrias ?? [])].reverse().find((p) => p.uniformidade_pct !== null)?.uniformidade_pct ?? null;
  const resumo = resumoLote(listaSemanas, {
    povoamento: lote.data_povoamento, pesoInicialG: lote.peso_inicial_g,
    uniformidade: ultimaUniformidade === null ? null : Number(ultimaUniformidade),
  });
  const frases = frasesLote(resumo, referenciaEspecie(especie?.nome));

  const baixas = listaSemanas.reduce((s, x) => s + Number(x.baixas ?? 0), 0);
  const porCausa = resumoCausas((causas ?? []) as { causa: string; peixes: number }[], baixas);
  const kgDespescados = (despescas ?? []).reduce((s, d) => s + Number(d.kg_total ?? 0), 0);
  const carencia = locais.map((l) => l.carencia_ate).filter(Boolean).sort().at(-1) ?? null;
  const podeEditar = pode("lotes.editar");
  const podeBiometria = podeEditar || pode("apontamentos.editar");
  const diasCultivo = locais[0]?.dias_cultivo ?? null;
  const baseCiclo = encerrado || peixes === 0 ? null : baseDoCiclo({
    pontos: ateDespesca,
    custoAteAgoraCents: Number(custoMes?.custo_acumulado_cents ?? lote.custo_aquisicao_cents ?? 0),
    precoRacaoKgCents: custoMes ? precoRacaoKg(custoMes) : null,
    outrosSemanaCents: custoMes ? custoSemanalVariavel(custoMes) : 0,
    kgJaDespescados: kgDespescados,
    biomassaHojeKg: biomassa,
  });

  const cartoes = [
    { rotulo: "Peixes hoje", valor: locais.length ? formatarInteiro(peixes) : "–", detalhe: `de ${formatarInteiro(lote.qtd_povoada)} povoados` },
    { rotulo: "Cultivo", valor: diasCultivo !== null ? `${diasCultivo} dias` : "–", detalhe: resumo.semanaAtual ? `semana ${resumo.semanaAtual}` : "" },
    { rotulo: "Peso médio", valor: textoPeso(pesoHoje), detalhe: locais[0]?.ultima_biometria ? `biometria em ${formatarData(locais[0].ultima_biometria)}` : "estimado pela curva" },
    { rotulo: "Biomassa", valor: locais.length ? textoKg(biomassa, 0) : "–", detalhe: kgDespescados ? `${textoKg(kgDespescados, 0)} já despescados` : "" },
    { rotulo: "Sobrevivência", valor: resumo.sobrevivencia === null ? "–" : `${formatarNumero(resumo.sobrevivencia, 1)}%`, detalhe: baixas ? `${formatarInteiro(baixas)} baixas` : "" },
    { rotulo: "Conversão alimentar", valor: resumo.conversao === null ? "–" : formatarNumero(resumo.conversao, 2), detalhe: resumo.racaoAcumKg ? `${textoKg(resumo.racaoAcumKg, 0)} de ração` : "" },
  ];

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo descricao={`${especie?.nome ?? "Espécie"} · ${FASES[lote.fase] ?? lote.fase} · povoado em ${formatarData(lote.data_povoamento)} com ${formatarInteiro(lote.qtd_povoada)} peixes de ${textoPeso(lote.peso_inicial_g)}${lote.custo_aquisicao_cents ? ` por ${formatarMoeda(lote.custo_aquisicao_cents)}` : ""}${lote.peso_alvo_g ? ` · despesca com ${textoPeso(lote.peso_alvo_g)}` : ""}`}
        acoes={<div className="flex flex-wrap gap-2">
          {!encerrado && podeBiometria && locais.length > 0 && (
            <BotaoLancamento rotulo="Lançar biometria" titulo={`Biometria do lote ${lote.codigo}`} acao={registrarBiometria} botao="Salvar biometria" tamanho="sm"
              descricao="Pese uma amostra de cerca de 10% dos peixes (ou pelo menos 30), com rede, a cada 15 dias até uns 70 g e depois todo mês.">
              <input type="hidden" name="lote_id" value={lote.id} />
              <Selecao rotulo="Viveiro" id="b_viveiro" name="viveiro_id" defaultValue={locais[0].viveiro_id} required>
                {locais.map((l) => <option key={l.viveiro_id} value={l.viveiro_id}>{l.setor_nome} / {l.viveiro_nome}</option>)}
              </Selecao>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Data" id="b_data" name="data" type="date" max={hoje} defaultValue={hoje} required />
                <Campo rotulo="Peixes pesados" id="b_peixes" name="peixes" inputMode="numeric" placeholder="Ex.: 50" required />
                <Campo rotulo="Peso total da amostra (g)" id="b_total" name="peso_total_g" inputMode="decimal" placeholder="Ex.: 17.500" ajuda="Ou preencha o peso médio" />
                <Campo rotulo="Peso médio (g)" id="b_medio" name="peso_medio_g" inputMode="decimal" placeholder="Ex.: 350" />
                <Campo rotulo="Comprimento médio (cm)" id="b_comp" name="comprimento_cm" inputMode="decimal" />
                <Campo rotulo="Uniformidade (%)" id="b_unif" name="uniformidade_pct" inputMode="decimal" ajuda="Peixes a até 10% do peso médio" />
              </div>
              <AreaTexto rotulo="Observações" id="b_obs" name="observacoes" className="font-sans" />
            </BotaoLancamento>
          )}
          <Link href={`/relatorios/indicadores?fase=todos&especie=${lote.especie_id}&lotes=${lote.id}`} className={classeBotao("secundario", "sm")}>Comparar com outros lotes</Link>
          <Link href="/lotes" className={classeBotao("secundario", "sm")}>Todos os lotes</Link>
        </div>}>
        Lote {lote.codigo}
      </Titulo>

      {encerrado && (
        <Aviso tipo="info">
          Lote encerrado em {formatarData(lote.encerrado_em)}{lote.motivo_encerramento ? `: ${lote.motivo_encerramento}` : ""}.
        </Aviso>
      )}
      {carencia && <Aviso tipo="alerta">Lote em carência de medicamento: não despesque para venda até {formatarData(carencia)}.</Aviso>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cartoes.map((r) => (
          <Cartao key={r.rotulo}>
            <p className="text-sm text-texto-suave">{r.rotulo}</p>
            <p className="text-2xl font-semibold tabular-nums">{r.valor}</p>
            {r.detalhe && <p className="text-xs text-texto-suave">{r.detalhe}</p>}
          </Cartao>
        ))}
      </div>

      {sugestoes.length > 0 && (
        <Cartao titulo="Ração sugerida para hoje" descricao="Biomassa do viveiro × taxa da tabela de arraçoamento da espécie para o peso médio (Embrapa). É sugestão: ajuste pelo apetite dos peixes, pela sobra de ração e pela água.">
          <div className="grid gap-3 md:grid-cols-2">
            {sugestoes.map(({ local, sugestao: s }) => (
              <div key={local.viveiro_id} className="flex flex-col gap-1.5 rounded-xl border border-borda p-3 text-sm">
                <p className="font-medium">{local.setor_nome} / {local.viveiro_nome}</p>
                {!s || s.racao_kg === null ? (
                  <p className="text-texto-suave">Sem peso ou sem tabela de arraçoamento para esta espécie.</p>
                ) : (
                  <>
                    <p className="text-2xl font-semibold tabular-nums">{textoKg(s.racao_kg)} <span className="text-sm font-normal text-texto-suave">por dia</span></p>
                    <p className="text-texto-suave">
                      {s.refeicoes ? `${s.refeicoes} tratos de ${textoKg(s.racao_por_refeicao_kg)} · ` : ""}
                      {s.taxa_pct !== null ? `${formatarNumero(s.taxa_pct, 2)}% de ${textoKg(s.biomassa_kg, 0)} · ` : ""}
                      {s.proteina_pct ? `ração ${formatarNumero(s.proteina_pct, 0)}% PB` : ""}{s.granulo ? `, ${s.granulo}` : ""}
                      {s.fase_tabela ? ` · ${s.fase_tabela}` : ""}
                    </p>
                  </>
                )}
                {s?.alerta && <p className="font-medium text-perigo">{s.alerta}</p>}
              </div>
            ))}
          </div>
        </Cartao>
      )}

      <section id="viveiros" className="flex scroll-mt-6 flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Viveiros e transferências</h2>
          <p className="text-sm text-texto-suave">
            {locais.length
              ? `Hoje em ${locais.map((l) => `${l.setor_nome} / ${l.viveiro_nome} (${formatarInteiro(l.peixes_atuais)} peixes${l.peixes_m2 !== null ? `, ${formatarNumero(l.peixes_m2, 2)} peixes/m²` : ""})`).join(", ")}. `
              : "O lote não está em nenhum viveiro hoje. "}
            Transfira da alevinagem para a recria e dela para a engorda; o histórico fica aqui.
          </p>
        </div>
        <ViveirosDoLote
          loteId={id}
          alocacoes={(alocacoes ?? []) as Alocacao[]}
          transferencias={(transferencias ?? []) as Transferencia[]}
          atuais={locais.map((l) => ({ viveiro_id: l.viveiro_id, peixes_atuais: l.peixes_atuais }))}
          viveiros={(viveiros ?? []).filter((g) => g.ativo).map((g) => ({ id: g.id, nome: nomeViveiro(g), finalidade: g.finalidade, capacidade: g.capacidade_peixes }))}
          nomes={[...nomes.entries()]}
          ocupados={(ocupacao ?? []).filter((o) => o.lote_id !== id).map((o) => [o.viveiro_id, o.lote_codigo])}
          podeEditar={podeEditar && !encerrado}
        />
      </section>

      <Cartao titulo="Indicadores zootécnicos" descricao="O lote por escrito, comparado com a curva de crescimento da espécie. Semana a semana na tabela mais abaixo.">
        <ul className="flex flex-col gap-1.5 text-sm leading-relaxed">
          {frases.map((f) => (
            <li key={f.texto} className={`flex items-start gap-2 ${f.alerta ? "font-semibold text-perigo" : ""}`}>
              <span aria-hidden className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${f.classificacao === "abaixo" ? "bg-perigo/15 text-perigo" : f.classificacao === "acima" ? "bg-positivo/15 text-positivo" : "bg-texto-suave/10 text-texto-suave"}`}>
                {f.classificacao === "abaixo" ? "↓" : f.classificacao === "acima" ? "↑" : f.classificacao === "normal" ? "✓" : "·"}
              </span>
              <span>{f.texto}</span>
            </li>
          ))}
        </ul>
      </Cartao>

      <section id="crescimento" className="flex scroll-mt-6 flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Biometrias e crescimento</h2>
          <p className="text-sm text-texto-suave">
            Cada biometria contra o peso que a curva da espécie esperava desde o povoamento. Entre uma biometria e outra, o peso do lote é estimado pela curva.
          </p>
        </div>
        <Tabela celular="rolar" cabecalho={["Data", "Viveiro", "Dias", "Amostra", "Peso médio", "Esperado", "Diferença", "Ganho diário", "Uniformidade", ...(podeBiometria && !encerrado ? [""] : [])]}
          direita={["Dias", "Amostra", "Peso médio", "Esperado", "Diferença", "Ganho diário", "Uniformidade"]}
          total={pontos.length} vazio="Nenhuma biometria lançada para este lote ainda.">
          {(biometrias ?? []).map((b, i) => {
            const p = pontos[i];
            const abaixo = p.diferencaPct !== null && p.diferencaPct < -15;
            return (
              <tr key={b.id} className="tabular-nums">
                <td>{formatarData(b.data)}</td>
                <td>{nomes.get(b.viveiro_id) ?? "–"}</td>
                <td className="text-right">{p.dias}</td>
                <td className="text-right">{formatarInteiro(b.peixes_amostrados)}</td>
                <td className="text-right">{textoPeso(p.peso)}</td>
                <td className="text-right text-texto-suave">{textoPeso(p.esperado)}</td>
                <td className={`text-right ${abaixo ? "font-semibold text-perigo" : ""}`}>
                  {p.diferencaPct === null ? "–" : `${p.diferencaPct > 0 ? "+" : ""}${formatarNumero(p.diferencaPct, 1)}%`}
                </td>
                <td className="text-right">{p.gpd === null ? "–" : `${formatarNumero(p.gpd, 1)} g/dia`}</td>
                <td className="text-right">{p.uniformidade === null ? "–" : `${formatarNumero(p.uniformidade, 0)}%`}</td>
                {podeBiometria && !encerrado && <td className="text-right"><ExcluirLinha acao={excluirBiometria} id={b.id} /></td>}
              </tr>
            );
          })}
        </Tabela>
        <p className="text-xs text-texto-suave">Em vermelho: peso mais de 15% abaixo do esperado pela curva. Confira ração, água e densidade.</p>
      </section>

      {projecao && projecao.pontos.length > 0 && (
        <Cartao titulo="Próximas semanas (previsão)"
          descricao={projecao.base === "lote"
            ? `O peso segue a curva da espécie no ritmo que o lote mostrou nas biometrias (${formatarNumero(projecao.fator * 100, 0)}% do ganho esperado), e os peixes caem pela mortalidade das últimas semanas.`
            : "Sem biometria ainda: a previsão segue a curva da espécie a partir do peso do povoamento."}>
          {lote.peso_alvo_g && (
            <p className="mb-3 text-sm">
              {projecao.despesca
                ? <>Chega a <strong>{textoPeso(lote.peso_alvo_g)}</strong> por volta de <strong>{formatarData(projecao.despesca.data)}</strong> (semana {projecao.despesca.semana} de cultivo).</>
                : <>Pela curva, o lote não chega a {textoPeso(lote.peso_alvo_g)}.</>}
            </p>
          )}
          <Tabela celular="rolar" cabecalho={["Semana", "Data", "Peso previsto", "Peixes", "Biomassa", "Ganho na semana", "Ração na semana"]}
            direita={["Peso previsto", "Peixes", "Biomassa", "Ganho na semana", "Ração na semana"]} total={projecao.pontos.length}>
            {projecao.pontos.map((p) => (
              <tr key={p.semana} className="tabular-nums">
                <td>{p.semana}</td>
                <td>{formatarData(p.data)}</td>
                <td className="text-right">{textoPeso(p.pesoG)}</td>
                <td className="text-right">{formatarInteiro(p.peixes)}</td>
                <td className="text-right">{textoKg(p.biomassaKg, 0)}</td>
                <td className="text-right">{textoKg(p.ganhoKg, 0)}</td>
                <td className="text-right">{p.racaoKg === null ? "–" : textoKg(p.racaoKg, 0)}</td>
              </tr>
            ))}
          </Tabela>
        </Cartao>
      )}

      {baseCiclo && (
        <Cartao titulo="Resultado previsto do ciclo" icone={Calculator} cor="marca"
          descricao="Quanto o lote deve deixar até a despesca. Mude o preço do kg e veja na hora o lucro e o preço mínimo para empatar.">
          <SimuladorCiclo base={baseCiclo} precoSugeridoCents={precoVenda === null ? null : Number(precoVenda)}
            dataDespesca={ateDespesca.length ? projecao?.despesca?.data ?? null : null}
            origemPreco={precoVenda !== null ? "Preço sugerido: média do kg vendido no último mês com venda de peixe." : "Ainda não há venda de peixe registrada: digite o preço que você espera receber."} />
        </Cartao>
      )}

      {(despescas ?? []).length > 0 && (
        <Cartao titulo="Despescas" descricao={`${textoKg(kgDespescados, 0)} retirados do lote. A despesca total encerra o lote.`}
          acoes={<Link href="/despescas" className={classeBotao("secundario", "sm")}>Despescas</Link>}>
          <Tabela cabecalho={["Data", "Viveiro", "Tipo", "Peixes", "kg", "Peso médio", "Perdidos"]} direita={["Peixes", "kg", "Peso médio", "Perdidos"]} total={despescas?.length ?? 0}>
            {(despescas ?? []).map((d) => (
              <tr key={d.id} className="tabular-nums">
                <td>{formatarData(d.data)}</td>
                <td>{nomes.get(d.viveiro_id) ?? "–"}</td>
                <td><Etiqueta tom={d.tipo === "total" ? "positivo" : "info"}>{d.tipo === "total" ? "Total" : "Parcial"}</Etiqueta></td>
                <td className="text-right">{formatarInteiro(d.qtd_peixes)}</td>
                <td className="text-right">{textoKg(d.kg_total)}</td>
                <td className="text-right">{textoPeso(d.peso_medio_g)}</td>
                <td className="text-right">{d.peixes_perdidos ? formatarInteiro(d.peixes_perdidos) : "–"}</td>
              </tr>
            ))}
          </Tabela>
        </Cartao>
      )}

      {baixas > 0 && (
        <Cartao titulo="Causa das baixas" descricao="Mortes e descartes do lote inteiro, pela causa informada no apontamento.">
          <Tabela cabecalho={["Causa", "Peixes", "% das baixas"]} direita={["Peixes", "% das baixas"]} total={porCausa.linhas.length + 1}>
            {[...porCausa.linhas, ...(porCausa.semCausa ? [{ causa: "sem_causa", nome: "Sem causa informada", peixes: porCausa.semCausa }] : [])].map((l) => (
              <tr key={l.causa} className="tabular-nums">
                <td>{l.nome}</td>
                <td className="text-right">{formatarInteiro(l.peixes)}</td>
                <td className="text-right">{formatarNumero((l.peixes / baixas) * 100, 1)}%</td>
              </tr>
            ))}
          </Tabela>
        </Cartao>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Semana a semana</h2>
        <Tabela celular="rolar" cabecalho={["Semana", "Período", "Dias", "Peixes", "Ração", "g/peixe/dia", "Padrão", "% peso vivo", "Tabela", "Peso", "Curva", "Biomassa", "Baixas", "Mort. acum.", "Conversão"]}
          direita={["Dias", "Peixes", "Ração", "g/peixe/dia", "Padrão", "% peso vivo", "Tabela", "Peso", "Curva", "Biomassa", "Baixas", "Mort. acum.", "Conversão"]}
          total={listaSemanas.length} vazio="Sem apontamentos para este lote ainda.">
          {listaSemanas.map((s) => {
            const peso = s.peso_medio_g === null ? null : Number(s.peso_medio_g), padrao = s.padrao_peso_g === null ? null : Number(s.padrao_peso_g);
            const abaixo = peso !== null && padrao !== null && peso < padrao * 0.85;
            const taxa = taxaSemana(s);
            return (
              <tr key={s.semana} className="tabular-nums">
                <td>{s.semana}</td>
                <td className="whitespace-nowrap">{formatarData(s.inicio)} a {formatarData(s.fim)}</td>
                <td className="text-right">{s.dias}</td>
                <td className="text-right">{formatarInteiro(Number(s.peixes_medios))}</td>
                <td className="text-right">{textoKg(s.racao_kg)}</td>
                <td className="text-right">{formatarNumero(s.consumo_g_peixe_dia, 1)}</td>
                <td className="text-right text-texto-suave">{formatarNumero(s.padrao_consumo_g, 1)}</td>
                <td className="text-right">{taxa === null ? "–" : formatarNumero(taxa, 2)}</td>
                <td className="text-right text-texto-suave">{formatarNumero(s.padrao_taxa_pct, 2)}</td>
                <td className={`text-right ${abaixo ? "font-semibold text-perigo" : ""}`}>{textoPeso(peso)}</td>
                <td className="text-right text-texto-suave">{textoPeso(padrao)}</td>
                <td className="text-right">{textoKg(s.biomassa_kg, 0)}</td>
                <td className="text-right">{formatarInteiro(Number(s.baixas))}</td>
                <td className="text-right">{formatarNumero(s.mortalidade_acum_pct, 2)}%</td>
                <td className="text-right">{s.conversao_alimentar === null ? "–" : formatarNumero(s.conversao_alimentar, 2)}</td>
              </tr>
            );
          })}
        </Tabela>
        <p className="text-xs text-texto-suave">
          Peso estimado no fim da semana (última biometria levada pela curva). Em vermelho: peso mais de 15% abaixo da curva. Conversão: ração acumulada
          por kg de peixe ganho, contando o que já foi despescado.
        </p>
      </section>

      {podeEditar && (
        <Cartao titulo={encerrado ? "Reabrir o lote" : "Encerrar o lote"}
          descricao={encerrado
            ? "Volta o lote para a fase em que estava. Só dá para reabrir se o viveiro continua livre."
            : "A despesca total já encerra o lote. Encerre aqui quando o ciclo acabou de outro jeito: perda total, venda do viveiro inteiro por fora ou erro de cadastro."}>
          {encerrado ? (
            <AcaoConfirmada acao={reabrirLote} botao="Reabrir lote" pergunta={`Reabrir o lote ${lote.codigo}?`}>
              <input type="hidden" name="id" value={lote.id} />
            </AcaoConfirmada>
          ) : (
            <AcaoConfirmada acao={encerrarLote} botao="Encerrar lote" variante="perigo" confirmar="Encerrar"
              pergunta={`Encerrar o lote ${lote.codigo}? Os viveiros ficam livres e o lote sai do apontamento.`}>
              <input type="hidden" name="id" value={lote.id} />
              <Campo rotulo="Data" id="e_data" name="data" type="date" max={hoje} defaultValue={hoje} required />
              <Campo rotulo="Motivo" id="e_motivo" name="motivo" placeholder="Ex.: perda por falta de oxigênio" required />
            </AcaoConfirmada>
          )}
          {!encerrado && <p className="mt-2 text-xs text-texto-suave">Para retirar peixe e mandar para o estoque, lance em <Link href="/despescas" className={CLASSE_BOTAO_TEXTO}>Despescas</Link>.</p>}
        </Cartao>
      )}
    </div>
  );
}
