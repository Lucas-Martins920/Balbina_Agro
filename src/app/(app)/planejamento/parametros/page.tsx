import { FormAcao } from "@/components/form-acao";
import { Aviso, Campo, Cartao, Selecao, Titulo } from "@/components/ui";
import { centavosParaCampo, formatarInteiro } from "@/lib/formato";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { carregarPlanejamento } from "@/lib/planejamento-dados";
import { NOME_ETAPA, PREMISSAS_INICIAIS, REFERENCIA_MERCADO, papelViveiro, sugerirPelaMeta, type Etapa, type Parametros, type Viveiro } from "@/lib/planejamento";
import { aplicarSugestaoMeta, salvarParametros } from "../actions";
import { AbasPlanejamento } from "../linha-do-tempo";
import { CustosFuturos } from "./custos";

const reais = centavosParaCampo;
function pct(n: number) {
  return String(n).replace(".", ",");
}

// Com N viveiros numa fase, um lote novo só cabe a cada (semanas na fase + vazio) / N. A fase mais lenta é o gargalo
// da cadência; a tela mostra qual é, com os números de hoje.
function gargalo(p: Parametros, viveiros: Viveiro[]) {
  const semanas: Record<Etapa, number> = {
    alevinagem: p.semanasAlevinagem, recria: p.semanasRecria, engorda: p.semanasCultivo - p.semanasAlevinagem - p.semanasRecria,
  };
  const vazio: Record<Etapa, number> = { alevinagem: p.vazioAlevinagem, recria: p.vazioRecria, engorda: p.vazioEngorda };
  let pior: { etapa: Etapa; viveiros: number; minimo: number } | null = null;
  for (const etapa of ["alevinagem", "recria", "engorda"] as const) {
    if (semanas[etapa] <= 0) continue;
    const n = viveiros.filter((g) => papelViveiro(g.finalidade).includes(etapa)).length;
    if (n === 0) continue;
    const minimo = Math.ceil((semanas[etapa] * 7 + vazio[etapa]) / 7 / n);
    if (!pior || minimo > pior.minimo) pior = { etapa, viveiros: n, minimo };
  }
  if (!pior) return "";
  const { etapa, viveiros: n, minimo } = pior;
  return ` Hoje o gargalo é a ${NOME_ETAPA[etapa].toLowerCase()}: ${n} ${n === 1 ? "viveiro" : "viveiros"}, ${semanas[etapa]} semanas + ${vazio[etapa]} dias de vazio, o que dá um lote a cada ${minimo} ${minimo === 1 ? "semana" : "semanas"} no mínimo.`;
}

export default async function PaginaParametros() {
  const [, { pode }, { parametros: p, custos, especies, viveiros, reais: lotes }] = await Promise.all([
    exigirAcesso("planejamento"), getPermissoes(), carregarPlanejamento(),
  ]);
  const podeEditar = pode("planejamento.editar");
  const sugestao = p?.metaPeixes ? sugerirPelaMeta(p, viveiros) : null;
  const peixesHoje = lotes.reduce((t, l) => t + l.peixes, 0);
  // Sem manejo salvo os prazos ficam em branco: a referência técnica aparece só como dica.
  const premissas = { ...PREMISSAS_INICIAIS, ...(p ?? {}) };
  const passaPelaRecria = p ? p.semanasAlevinagem + p.semanasRecria > 0 : true;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Titulo descricao="Cada piscicultura tem o seu manejo. Os prazos que você informar abaixo comandam a previsão de transferências, despescas e renovação dos viveiros; os preços e custos alimentam o estudo de viabilidade.">
        Planejamento
      </Titulo>
      <AbasPlanejamento atual="parametros" />

      <FormAcao key={JSON.stringify(p)} acao={salvarParametros} botao="Salvar parâmetros" limparAoSalvar={false}>
        <fieldset disabled={!podeEditar} className="flex flex-col gap-6">
          <Cartao titulo="Fases do lote" descricao={`O lote começa na alevinagem, cresce na recria e vai para a engorda até a despesca. Use 0 semanas na fase que a sua piscicultura não faz (lote comprado como juvenil, por exemplo). As dicas são referências técnicas (${REFERENCIA_MERCADO.fonte}).`}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo rotulo="Semanas na alevinagem" id="p_sa" name="semanas_alevinagem" inputMode="numeric" defaultValue={p?.semanasAlevinagem ?? ""} required
                ajuda={REFERENCIA_MERCADO.alevinagem} />
              <Campo rotulo="Semanas na recria" id="p_sr" name="semanas_recria" inputMode="numeric" defaultValue={p?.semanasRecria ?? ""} required
                ajuda={REFERENCIA_MERCADO.recria} />
              <Campo rotulo="Semanas de cultivo até a despesca" id="p_sc" name="semanas_cultivo" inputMode="numeric" defaultValue={p?.semanasCultivo ?? ""} required
                ajuda={`Contadas do povoamento, somando todas as fases. ${REFERENCIA_MERCADO.cultivo}`} />
            </div>
          </Cartao>

          <Cartao titulo="Vazio sanitário" descricao={`Dias entre a saída de um lote e a entrada do próximo, para esvaziar, secar o fundo, fazer a calagem, adubar e encher o viveiro; ${REFERENCIA_MERCADO.vazio}.`}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo rotulo="Alevinagem (dias)" id="p_va" name="vazio_alevinagem_dias" inputMode="numeric" defaultValue={p?.vazioAlevinagem ?? ""} placeholder="ex.: 15" required />
              <Campo rotulo="Recria (dias)" id="p_vr" name="vazio_recria_dias" inputMode="numeric" defaultValue={p?.vazioRecria ?? ""} placeholder="ex.: 15" required />
              <Campo rotulo="Engorda (dias)" id="p_ve" name="vazio_engorda_dias" inputMode="numeric" defaultValue={p?.vazioEngorda ?? ""} placeholder="ex.: 30" required />
            </div>
          </Cartao>

          <Cartao titulo="Cadência de lotes" descricao={`Com um viveiro só em cada fase, o menor intervalo entre lotes é o tempo na fase mais o vazio do viveiro; com mais viveiros dá para povoar com mais frequência.${p ? gargalo(p, viveiros) : ""}`}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Campo rotulo="Meta de peixes em engorda" id="p_meta" name="meta_peixes" inputMode="numeric" defaultValue={p?.metaPeixes ?? ""}
                ajuda="Quantos peixes a piscicultura quer manter na engorda. Com ela o sistema sugere o tamanho e a cadência dos lotes." />
              <Campo rotulo="Um lote novo a cada (semanas)" id="p_int" name="intervalo_lotes_semanas" inputMode="numeric" defaultValue={p?.intervaloSemanas ?? ""} required
                ajuda="Ex.: 12 = a cada 3 meses; 9 = a cada 2 meses." />
              <Campo rotulo="Alevinos por lote" id="p_peixes" name="peixes_por_lote" inputMode="numeric" defaultValue={p?.peixesPorLote ?? ""}
                ajuda="Vazio = o que cabe no menor viveiro entre a alevinagem e a engorda." />
              <Selecao rotulo="Espécie padrão" id="p_esp" name="especie_id" defaultValue={p?.especieId ?? ""} ajuda="A curva de crescimento dela entra na previsão de peso e no estudo.">
                <option value="">Tambaqui (curva de referência)</option>
                {especies.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </Selecao>
              <Campo rotulo="Peso no povoamento (g)" id="p_peso" name="peso_povoamento_g" inputMode="decimal" defaultValue={pct(premissas.pesoPovoamentoG)}
                ajuda="Alevino de 0,5 a 1 g; juvenil direto para a engorda, de 30 a 150 g. O peso põe o lote no ponto certo da curva." />
              <Campo rotulo="Horizonte (meses)" id="p_hor" name="horizonte_meses" inputMode="numeric" defaultValue={premissas.horizonteMeses} required />
            </div>
          </Cartao>

          <Cartao titulo="Premissas do estudo de viabilidade" descricao="Preços que você espera praticar. Deixe em branco o que ainda não sabe: o estudo avisa o que está faltando.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Preço do kg do peixe (R$)" id="p_preco" name="preco_kg" inputMode="decimal" defaultValue={reais(p?.precoKg)} placeholder="0,00"
                ajuda="Peixe inteiro vendido na despesca." />
              <Campo rotulo="Perda na despesca (%)" id="p_perda" name="perda_despesca_pct" inputMode="decimal" defaultValue={pct(premissas.perdaDespesca)}
                ajuda="Peixes que ficam no viveiro, morrem no manejo ou saem fora do padrão." />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Campo rotulo="Ração da alevinagem (R$/kg)" id="p_ra" name="racao_alevinagem_kg" inputMode="decimal" defaultValue={reais(p?.racaoAlevinagemKg)} placeholder="0,00"
                ajuda="Farelada ou extrusada fina, com mais proteína." />
              <Campo rotulo="Ração da recria (R$/kg)" id="p_rr" name="racao_recria_kg" inputMode="decimal" defaultValue={reais(p?.racaoRecriaKg)} placeholder="0,00" />
              <Campo rotulo="Ração da engorda (R$/kg)" id="p_re" name="racao_engorda_kg" inputMode="decimal" defaultValue={reais(p?.racaoEngordaKg)} placeholder="0,00" />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Mortalidade na alevinagem e recria (%)" id="p_mr" name="mortalidade_recria_pct" inputMode="decimal" defaultValue={pct(premissas.mortalidadeRecria)}
                ajuda={`Do povoamento até a ida para a engorda, a fase de maior perda. O padrão do sistema é ${pct(PREMISSAS_INICIAIS.mortalidadeRecria)}%; ajuste pelo histórico dos seus lotes.`} />
              <Campo rotulo="Mortalidade na engorda (%)" id="p_me" name="mortalidade_engorda_pct" inputMode="decimal" defaultValue={pct(premissas.mortalidadeEngorda)}
                ajuda={`Da entrada na engorda até a despesca. O padrão do sistema é ${pct(PREMISSAS_INICIAIS.mortalidadeEngorda)}%.`} />
            </div>
          </Cartao>
        </fieldset>
      </FormAcao>

      {p && (
        <Cartao titulo="Sugestão pela meta de peixes"
          descricao="Com os viveiros cadastrados e o vazio sanitário de cada um: um lote por viveiro de engorda, revezando para a piscicultura ter despesca ao longo do ano. É só sugestão; aplique ou ajuste.">
          {!sugestao ? (
            <p className="text-sm text-texto-suave">Informe a meta de peixes em engorda acima e salve para ver a sugestão.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-texto-suave">Meta</dt><dd className="font-medium">{formatarInteiro(p.metaPeixes ?? 0)} peixes em engorda</dd>
                  <dd className="text-xs text-texto-suave">Hoje há {formatarInteiro(peixesHoje)} peixes nos viveiros</dd></div>
                <div><dt className="text-texto-suave">Lotes na engorda ao mesmo tempo</dt><dd className="font-medium">{sugestao.lotesNaEngorda} de {formatarInteiro(sugestao.peixesNaEngorda)} peixes</dd>
                  <dd className="text-xs text-texto-suave">{sugestao.viveiros.join(", ") || "sem viveiro de engorda"}</dd></div>
                <div><dt className="text-texto-suave">Povoar por lote</dt><dd className="font-medium">{formatarInteiro(sugestao.peixesPorLote)} {passaPelaRecria ? "alevinos" : "juvenis"}</dd>
                  <dd className="text-xs text-texto-suave">{passaPelaRecria ? `já com ${pct(p.mortalidadeRecria)}% de mortalidade na alevinagem e recria` : "direto na engorda"}</dd></div>
                <div><dt className="text-texto-suave">Um lote novo a cada</dt><dd className="font-medium">{sugestao.intervaloSemanas} {sugestao.intervaloSemanas === 1 ? "semana" : "semanas"}</dd>
                  <dd className="text-xs text-texto-suave">despesca com {p.semanasCultivo} semanas de cultivo</dd></div>
              </dl>
              {sugestao.avisos.map((a) => <Aviso key={a} tipo="alerta">{a}</Aviso>)}
              {podeEditar && sugestao.peixesNaEngorda > 0 && (
                <div>
                  <FormAcao acao={aplicarSugestaoMeta} botao="Aplicar sugestão" limparAoSalvar={false}>
                    <input type="hidden" name="peixes_por_lote" value={sugestao.peixesPorLote} />
                    <input type="hidden" name="intervalo_lotes_semanas" value={sugestao.intervaloSemanas} />
                  </FormAcao>
                </div>
              )}
            </div>
          )}
        </Cartao>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Custos futuros</h2>
          <p className="text-[13px] text-texto-suave">
            Alevinos, frete, calcário e adubação, mão de obra, energia dos aeradores, gelo e caixas… Cada item diz em que fase incide e sobre o quê.
            A ração já entra pelo consumo da curva de crescimento e pelos preços acima.
          </p>
        </div>
        <CustosFuturos custos={custos} podeEditar={podeEditar} />
      </section>
    </div>
  );
}
