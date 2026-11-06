import Link from "next/link";
import { BotaoLancamento } from "@/components/lancamento";
import { Campo, Cartao, CLASSE_BOTAO_TEXTO, classeBotao, Faixa, Indicador, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { avisosAgua, resumoAgua, type Agua } from "@/lib/agua";
import { diasAtrasISO, formatarData, formatarInteiro, formatarNumero, hojeISO } from "@/lib/formato";
import { textoKg, textoPeso } from "@/lib/pescado";
import { createClient } from "@/lib/supabase/server";
import { FASES, TIPOS_MEDICAMENTO, TURNOS, UNIDADES_DOSE, turnoAgora } from "@/lib/rotulos";
import { produzirRacao } from "../racao/actions";
import { editarLancamento, excluirLancamento, registrarApontamento, restaurarLancamento } from "./actions";
import { EditarLancamento } from "./editar-lancamento";
import { ExcluirLancamento, RestaurarLancamento } from "./excluir-lancamento";
import { periodoLancamentos, podeExcluirLancamento } from "@/lib/apontamento-excluir";
import { CamposLancamento } from "./campos-lancamento";
import { iaConfigurada } from "@/lib/ia";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { carregarSugestoes } from "@/lib/sugestao-apontamento-dados";

export default async function PaginaApontamentos({ searchParams }: PageProps<"/apontamentos">) {
  await exigirAcesso("apontamentos");
  const { atual } = await getEmpresaAtual();
  const { pode } = await getPermissoes();
  const gerencia = pode("lotes.editar");
  const supabase = await createClient();
  const desde = diasAtrasISO(14, atual.fuso);
  const hoje = hojeISO(atual.fuso);
  const periodo = periodoLancamentos(await searchParams, hoje);
  const { data: claims } = await supabase.auth.getClaims();
  const eu = (claims?.claims.sub as string | undefined) ?? null;

  const [{ data: ocupados }, { data: lancamentos, error: erroLancamentos }, { data: recentes }, { data: racoes }, { data: checklist }, { data: formulas }, { data: depositos }, { data: saldos }, { data: medicamentos }, { data: lixeira }, { data: usuarios }] = await Promise.all([
    supabase.from("alocacoes_atuais").select("viveiro_id, viveiro_nome, setor_nome, lote_id, lote_codigo, fase, peixes_atuais, ultimo_apontamento, peso_medio_g, biomassa_kg")
      .eq("empresa_id", atual.id).order("setor_nome").order("viveiro_nome"),
    supabase.from("apontamento_lancamentos")
      .select("id, turno, mortes, descartes, racao_kg, temperatura_c, oxigenio_mg_l, ph, transparencia_cm, amonia_mg_l, observacoes, causas_morte, created_at, created_by, apontamentos_diarios!inner(data, lotes(codigo, fase), viveiros(nome))")
      .eq("empresa_id", atual.id).gte("apontamentos_diarios.data", periodo.de).lte("apontamentos_diarios.data", periodo.ate)
      .order("created_at", { ascending: false }).limit(300),
    supabase.from("apontamentos_diarios")
      .select("id, data, peixes_inicio_dia, mortes, descartes, racao_kg, oxigenio_min_mg_l, temp_min_c, temp_max_c, ph_min, ph_max, lotes(codigo), viveiros(nome)")
      .eq("empresa_id", atual.id).gte("data", desde).order("data", { ascending: false }).limit(100),
    supabase.from("produtos").select("id, nome").eq("empresa_id", atual.id).eq("tipo", "racao").eq("ativo", true).order("nome"),
    supabase.from("checklist_itens").select("id, nome, tipo, unidade, aplica_em").eq("empresa_id", atual.id).eq("ativo", true).order("ordem").order("nome"),
    supabase.from("custo_formulas").select("formula_id, racao, fase, versao").eq("empresa_id", atual.id).order("racao"),
    supabase.from("depositos").select("id, nome").eq("empresa_id", atual.id).neq("tipo", "peixe").order("nome"),
    supabase.from("saldos_produtos").select("produto_id, saldo").eq("empresa_id", atual.id),
    supabase.from("medicamentos").select("id, nome, tipo, dose_por_unidade, unidade_dose, via, carencia_dias")
      .eq("empresa_id", atual.id).eq("ativo", true).order("nome"),
    supabase.from("apontamentos_lixeira")
      .select("id, data, turno, mortes, descartes, racao_kg, motivo, excluido_por, excluido_em, restaurado_em, lotes(codigo), viveiros(nome)")
      .eq("empresa_id", atual.id).gte("excluido_em", `${diasAtrasISO(30, atual.fuso)}T00:00:00Z`)
      .order("excluido_em", { ascending: false }).limit(100),
    supabase.from("usuarios_empresa").select("user_id, nome, email").eq("empresa_id", atual.id),
  ]);
  if (erroLancamentos) console.error("apontamentos: lista de lançamentos", erroLancamentos);
  // Ração por tipo, checklist e medicação vêm à parte: se uma delas falhar, a lista (e a lixeira de cada linha) continua aparecendo.
  const idsLancamentos = (lancamentos ?? []).map((l) => l.id);
  const [racoesDoLancamento, checklistDoLancamento, medicacoesDoLancamento] = await Promise.all([
    porLancamento(idsLancamentos, (ids) => supabase.from("apontamento_racoes").select("lancamento_id, produto_id, kg, produtos(nome)").eq("empresa_id", atual.id).in("lancamento_id", ids)),
    porLancamento(idsLancamentos, (ids) => supabase.from("apontamento_checklist").select("lancamento_id, item_id, ok, valor, checklist_itens(nome, tipo, unidade)").eq("empresa_id", atual.id).in("lancamento_id", ids)),
    porLancamento(idsLancamentos, (ids) => supabase.from("eventos_sanitarios").select("lancamento_id, medicamentos(nome)").eq("empresa_id", atual.id).in("lancamento_id", ids)),
  ]);
  const nomeUsuario = new Map((usuarios ?? []).map((x) => [x.user_id, x.nome || x.email || "usuário"]));
  const saldoDe = new Map((saldos ?? []).map((x) => [x.produto_id, Number(x.saldo)]));
  const pendentes = (ocupados ?? []).filter((o) => o.ultimo_apontamento !== hoje);
  // ração da tabela de arraçoamento de cada viveiro hoje (peso da biometria × taxa da fase), junto das sugestões do histórico
  const [sugestoes, tabelas] = await Promise.all([
    carregarSugestoes(atual.id, hoje, (ocupados ?? []).map((o) => ({ viveiro_id: o.viveiro_id, lote_id: o.lote_id }))),
    Promise.all((ocupados ?? []).map(async (o) => {
      const { data } = await supabase.rpc("racao_sugerida", { p_viveiro: o.viveiro_id, p_data: hoje });
      const r = ([data].flat()[0] ?? null) as { racao_kg: number | null; refeicoes: number | null; taxa_pct: number | null; peso_medio_g: number | null; alerta: string | null } | null;
      return [o.viveiro_id, r && r.racao_kg !== null ? {
        racaoKg: Number(r.racao_kg), refeicoes: r.refeicoes, taxaPct: r.taxa_pct === null ? null : Number(r.taxa_pct),
        pesoMedioG: r.peso_medio_g === null ? null : Number(r.peso_medio_g), alerta: r.alerta,
      } : null] as const;
    })),
  ]);
  const tabela = new Map(tabelas);
  const doDia = (recentes ?? []).filter((a) => a.data === hoje);
  const racaoHoje = doDia.reduce((t, a) => t + Number(a.racao_kg), 0);
  const baixasHoje = doDia.reduce((t, a) => t + a.mortes + a.descartes, 0);
  const oxigenios = doDia.map((a) => a.oxigenio_min_mg_l).filter((v) => v !== null).map(Number);
  const oxigenioMin = oxigenios.length ? Math.min(...oxigenios) : null;
  const tabelaHoje = [...tabela.values()].reduce((t, r) => t + (r?.racaoKg ?? 0), 0);

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo
        acoes={
          <>
            <Link href="/campo" className={classeBotao("secundario", "sm")}>Abrir no celular (funciona sem internet)</Link>
            {(formulas ?? []).length > 0 && (
              <BotaoLancamento rotulo="Produção de ração" titulo="Produção da fábrica de ração hoje" acao={produzirRacao} botao="Lançar produção" variante="secundario" tamanho="sm"
                descricao={<>Tira os ingredientes da fórmula do estoque e põe a ração pronta no depósito. Depois é só escolher o tipo de ração no lançamento do viveiro. Fórmulas e ingredientes ficam em <Link href="/racao" className={CLASSE_BOTAO_TEXTO}>Fábrica de ração</Link>.</>}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Selecao rotulo="Fórmula" id="o_formula" name="formula_id" required defaultValue="">
                  <option value="" disabled>Escolha…</option>
                  {(formulas ?? []).map((f) => <option key={f.formula_id} value={f.formula_id}>{f.racao} · {f.fase} v{f.versao}</option>)}
                </Selecao>
                <Campo rotulo="Toneladas" id="o_t" name="toneladas" inputMode="decimal" required placeholder="Ex.: 2,5" />
                <Selecao rotulo="Tirar os ingredientes de" id="o_ins" name="deposito_insumos" required defaultValue="">
                  <option value="" disabled>Escolha…</option>
                  {(depositos ?? []).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </Selecao>
                <Selecao rotulo="Guardar a ração em" id="o_dest" name="deposito_destino" required defaultValue="">
                  <option value="" disabled>Escolha…</option>
                  {(depositos ?? []).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </Selecao>
                <Campo rotulo="Data" id="o_data" name="data" type="date" defaultValue={hoje} max={hoje} required />
              </div>
            </BotaoLancamento>
            )}
            {(ocupados ?? []).length > 0 && (
              ocupados && <BotaoLancamento rotulo="Novo apontamento" titulo="Novo lançamento" acao={registrarApontamento} botao="Salvar apontamento">
            <CamposLancamento
              viveiros={ocupados.map((o) => ({
                id: o.viveiro_id,
                rotulo: `${o.setor_nome} / ${o.viveiro_nome}: lote ${o.lote_codigo} (${FASES[o.fase] ?? o.fase}), ${formatarInteiro(o.peixes_atuais)} peixes${o.peso_medio_g ? ` de ${textoPeso(o.peso_medio_g)}` : ""}`,
                fase: o.fase,
                nome: o.viveiro_nome,
                tabela: tabela.get(o.viveiro_id) ?? null,
              }))}
              ia={iaConfigurada()}
              viveiroPadrao={pendentes[0]?.viveiro_id}
              hoje={hoje}
              turnoPadrao={turnoAgora(new Date(), atual.fuso)}
              racoes={(racoes ?? []).map((r) => ({ id: r.id, nome: r.nome, saldo: saldoDe.get(r.id) ?? 0 }))}
              checklist={checklist ?? []}
              sugestoes={sugestoes}
              agua={atual.apontar_qualidade_agua}
            />
            <details className="rounded-xl border border-borda p-3">
              <summary className="cursor-pointer text-sm font-medium">Aplicou medicamento ou vitamina neste viveiro?</summary>
              {medicamentos?.length ? (
                <div className="mt-3 flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Selecao rotulo="Medicamento ou vitamina" id="medicamento_id" name="medicamento_id" defaultValue="">
                      <option value="">Nenhum</option>
                      {medicamentos.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome} · {TIPOS_MEDICAMENTO[m.tipo]}
                          {m.dose_por_unidade ? ` · ${formatarNumero(m.dose_por_unidade, 2)} ${UNIDADES_DOSE[m.unidade_dose]}${m.via === "racao" ? "/kg de ração" : m.via === "banho" || m.via === "agua" ? "/m³" : ""}` : ""}
                          {m.carencia_dias > 0 ? ` · carência ${m.carencia_dias} d` : ""}
                        </option>
                      ))}
                    </Selecao>
                    <Campo rotulo="Dias de tratamento" id="med_dias" name="med_dias" inputMode="numeric" placeholder="1" />
                    <Campo rotulo="Dose (opcional)" id="med_dose" name="med_dose" inputMode="decimal" placeholder="a do cadastro" ajuda="por kg de ração ou por m³ de água" />
                    <Campo rotulo="Base da dose (opcional)" id="med_base" name="med_base" inputMode="decimal" ajuda="kg de ração medicada ou m³ de água tratada" />
                    <Campo rotulo="Quantidade usada (opcional)" id="med_quantidade" name="med_quantidade" inputMode="decimal" ajuda="na unidade da dose; vazio = dose × base" />
                  </div>
                  <p className="text-xs text-texto-suave">
                    O tratamento entra na <Link href="/sanidade" className={CLASSE_BOTAO_TEXTO}>Sanidade</Link>. Se o produto tem carência, o lote não pode ser despescado
                    pelos dias de tratamento mais a carência. Com produto de estoque ligado e quantidade conhecida, a baixa no estoque é automática.
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-texto-suave">
                  Nenhum medicamento cadastrado. <Link href="/medicamentos" className={CLASSE_BOTAO_TEXTO}>Cadastre os medicamentos e vitaminas</Link> com a dose por kg de ração ou por m³ de água.
                </p>
              )}
            </details>
            <Campo rotulo="Observações" id="observacoes" name="observacoes" />
            <p className="text-xs text-texto-suave">
              Cada lançamento soma no dia do viveiro, então dá para lançar o trato da manhã e o da tarde separados. Lançou errado? Exclua na lista da tela e lance de novo: quem lança exclui o que lançou no mesmo dia; o gerente da piscicultura e o master excluem qualquer um. O excluído vai para a lixeira, de onde dá para restaurar.
              A ração escolhida por tipo sai do estoque e entra no custo do lote. A qualidade da água entra nos alertas, e oxigênio abaixo de 3 mg/L suspende a ração sugerida.
              O peso do peixe vem da <Link href="/lotes" className={CLASSE_BOTAO_TEXTO}>biometria, na tela do lote</Link>. Os itens do checklist são da piscicultura: <Link href="/apontamentos/checklist" className={CLASSE_BOTAO_TEXTO}>editar checklist</Link>.
            </p>
          </BotaoLancamento>
            )}
          </>
        }
        descricao={pendentes.length ? `${pendentes.length} viveiro(ões) sem apontamento hoje` : "Todos os viveiros ocupados já foram apontados hoje"}>
        Apontamento diário
      </Titulo>

      {(ocupados ?? []).length > 0 && (
        <Faixa colunas={4}>
          <Indicador rotulo="Viveiros apontados hoje" valor={`${(ocupados ?? []).length - pendentes.length} de ${(ocupados ?? []).length}`}
            detalhe={pendentes.length ? `faltam ${pendentes.map((p) => p.viveiro_nome).slice(0, 4).join(", ")}${pendentes.length > 4 ? "…" : ""}` : "todos em dia"} />
          <Indicador rotulo="Ração dada hoje" valor={textoKg(racaoHoje)} detalhe={tabelaHoje > 0 ? `tabela de arraçoamento: ${textoKg(tabelaHoje)}` : "sem biometria para a tabela"} />
          <Indicador rotulo="Baixas hoje" valor={formatarInteiro(baixasHoje)} detalhe="mortes e descartes" />
          <Indicador rotulo="Oxigênio mais baixo hoje" valor={oxigenioMin === null ? "–" : `${formatarNumero(oxigenioMin, 1)} mg/L`}
            detalhe={oxigenioMin === null ? "sem medida da água hoje" : oxigenioMin < 3 ? "crítico: suspenda a ração" : oxigenioMin < 4 ? "abaixo do ideal" : "dentro do ideal (4 a 8)"} />
        </Faixa>
      )}

      {!ocupados?.length && (
        <Cartao>
          <p className="text-sm">Nenhum viveiro com lote povoado hoje. <Link href="/lotes" className={CLASSE_BOTAO_TEXTO}>Povoe um lote</Link> para começar.</p>
        </Cartao>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {periodo.de === periodo.ate ? `Lançamentos de ${formatarData(periodo.de)}` : `Lançamentos de ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`}
        </h2>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <Campo rotulo="De" id="f_de" name="de" type="date" defaultValue={periodo.de} max={hoje} className="h-9" />
          <Campo rotulo="Até" id="f_ate" name="ate" type="date" defaultValue={periodo.ate} max={hoje} className="h-9" />
          <button type="submit" className={classeBotao("secundario", "sm")}>Ver</button>
        </form>
      </div>
      {erroLancamentos && (
        <p role="alert" className="text-sm text-perigo">Não foi possível carregar os lançamentos: {erroLancamentos.message}</p>
      )}
      <Tabela cabecalho={["Data", "Turno", "Viveiro", "Lote", "Ração kg", "Mortes", "Desc.", "Água", "Checklist", "Medicação", "Observações", ""]} principal="Viveiro"
        total={lancamentos?.length ?? 0} vazio={erroLancamentos ? "Não foi possível carregar os lançamentos." : "Nenhum lançamento nesse período."}>
        {(lancamentos ?? []).map((lancamento) => {
          const l = { ...lancamento, apontamento_racoes: racoesDoLancamento.get(lancamento.id) ?? [], apontamento_checklist: checklistDoLancamento.get(lancamento.id) ?? [] };
          const dia = l.apontamentos_diarios as unknown as { data: string; lotes: { codigo: string; fase: string } | null; viveiros: { nome: string } | null };
          const meds = (medicacoesDoLancamento.get(l.id) ?? []) as unknown as { medicamentos: { nome: string } | null }[];
          const agua = aguaDe(l);
          const avisos = avisosAgua(agua);
          const podeMexer = podeExcluirLancamento({ gerencia, eu, criadoPor: l.created_by, criadoEm: l.created_at, fuso: atual.fuso });
          return (
            <tr key={l.id} className="tabular-nums">
              <td>{formatarData(dia.data)}</td>
              <td>{TURNOS[l.turno] ?? l.turno}</td>
              <td>{dia.viveiros?.nome}</td>
              <td>{dia.lotes?.codigo}</td>
              <td>
                {formatarNumero(l.racao_kg, 1)}
                {racoesDe(l.apontamento_racoes).map((r) => (
                  <span key={r.nome} className="block text-xs text-texto-suave">{r.nome}: {formatarNumero(r.kg, 1)}</span>
                ))}
              </td>
              <td>{formatarInteiro(l.mortes)}</td>
              <td>{formatarInteiro(l.descartes)}</td>
              <td className={`text-xs ${avisos.some((a) => a.nivel === "critico") ? "text-perigo" : avisos.length ? "text-alerta" : ""}`}>{resumoAgua(agua) || "–"}</td>
              <td className="text-xs">{resumoChecklist(l.apontamento_checklist)}</td>
              <td className="text-xs">{meds.map((m) => m.medicamentos?.nome).filter(Boolean).join(", ") || "–"}</td>
              <td className="max-w-48 truncate">{l.observacoes}</td>
              <td className="flex flex-col items-end gap-1">
                {podeMexer && (
                  <>
                    <EditarLancamento acao={editarLancamento} dados={{
                      id: l.id, turno: l.turno, mortes: l.mortes, descartes: l.descartes,
                      racao_kg: Number(l.racao_kg), observacoes: l.observacoes, causas_morte: l.causas_morte as Record<string, number> | null,
                      racoes: ((l.apontamento_racoes ?? []) as unknown as { produto_id: string; kg: number; produtos: { nome: string } | null }[])
                        .map((r) => ({ produto_id: r.produto_id, kg: Number(r.kg), nome: r.produtos?.nome ?? "Ração" })),
                      checklist: ((l.apontamento_checklist ?? []) as unknown as { item_id: string; ok: boolean | null; valor: number | null; checklist_itens: { nome: string; tipo: string; unidade: string | null } | null }[])
                        .map((c) => ({ item_id: c.item_id, ok: c.ok, valor: c.valor != null ? Number(c.valor) : null, nome: c.checklist_itens?.nome ?? "", tipo: c.checklist_itens?.tipo ?? "sim_nao", unidade: c.checklist_itens?.unidade ?? null })),
                      agua,
                      racoesDisponiveis: (racoes ?? []).map((r) => ({ id: r.id, nome: r.nome })),
                    }} />
                    <ExcluirLancamento acao={excluirLancamento} id={l.id}
                      resumo={`da ${(TURNOS[l.turno] ?? l.turno).toLowerCase()} de ${formatarData(dia.data)} no ${dia.viveiros?.nome ?? "viveiro"}`} />
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </Tabela>

      {(lixeira ?? []).length > 0 && (
        <details>
          <summary className="cursor-pointer text-lg font-semibold">Lixeira: lançamentos excluídos nos últimos 30 dias ({lixeira?.length})</summary>
          <div className="mt-3">
            <Tabela cabecalho={["Data", "Turno", "Viveiro", "Lote", "Ração kg", "Mortes", "Desc.", "Excluído", "Motivo", ""]} principal="Viveiro"
              total={lixeira?.length ?? 0} vazio="Lixeira vazia.">
              {(lixeira ?? []).map((x) => {
                const viveiro = x.viveiros as unknown as { nome: string } | null;
                const lote = x.lotes as unknown as { codigo: string } | null;
                const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: atual.fuso, dateStyle: "short", timeStyle: "short" }).format(new Date(x.excluido_em));
                return (
                  <tr key={x.id} className="tabular-nums">
                    <td>{formatarData(x.data)}</td>
                    <td>{TURNOS[x.turno] ?? x.turno}</td>
                    <td>{viveiro?.nome}</td>
                    <td>{lote?.codigo}</td>
                    <td>{formatarNumero(x.racao_kg, 1)}</td>
                    <td>{formatarInteiro(x.mortes)}</td>
                    <td>{formatarInteiro(x.descartes)}</td>
                    <td className="text-xs">{quando}<span className="block text-texto-suave">{nomeUsuario.get(x.excluido_por) ?? "–"}</span></td>
                    <td className="max-w-48 truncate text-xs">{x.motivo ?? "–"}</td>
                    <td>
                      {x.restaurado_em ? <span className="text-xs text-texto-suave">restaurado</span>
                        : podeExcluirLancamento({ gerencia, eu, criadoPor: x.excluido_por, criadoEm: x.excluido_em, fuso: atual.fuso })
                          && <RestaurarLancamento acao={restaurarLancamento} id={x.id} />}
                    </td>
                  </tr>
                );
              })}
            </Tabela>
          </div>
        </details>
      )}

      <h2 className="text-lg font-semibold">Totais por dia, últimos 14 dias</h2>
      <Tabela cabecalho={["Data", "Viveiro", "Lote", "Peixes", "Mortes", "Desc.", "Ração kg", "g/peixe", "Oxigênio mín.", "Temp. °C", "pH"]} principal="Viveiro"
        total={recentes?.length ?? 0} vazio="Nenhum apontamento nos últimos 14 dias.">
        {(recentes ?? []).map((a) => {
          const lote = a.lotes as unknown as { codigo: string } | null;
          const viveiro = a.viveiros as unknown as { nome: string } | null;
          return (
            <tr key={a.id} className="tabular-nums">
              <td>{formatarData(a.data)}</td>
              <td>{viveiro?.nome}</td>
              <td>{lote?.codigo}</td>
              <td>{formatarInteiro(a.peixes_inicio_dia)}</td>
              <td>{formatarInteiro(a.mortes)}</td>
              <td>{formatarInteiro(a.descartes)}</td>
              <td>{formatarNumero(a.racao_kg, 1)}</td>
              <td>{a.peixes_inicio_dia ? formatarNumero((1000 * Number(a.racao_kg)) / a.peixes_inicio_dia, 1) : "–"}</td>
              <td className={a.oxigenio_min_mg_l !== null && Number(a.oxigenio_min_mg_l) < 3 ? "text-perigo" : a.oxigenio_min_mg_l !== null && Number(a.oxigenio_min_mg_l) < 4 ? "text-alerta" : ""}>
                {a.oxigenio_min_mg_l === null ? "–" : formatarNumero(a.oxigenio_min_mg_l, 1)}
              </td>
              <td>{faixa(a.temp_min_c, a.temp_max_c)}</td>
              <td>{faixa(a.ph_min, a.ph_max)}</td>
            </tr>
          );
        })}
      </Tabela>
    </div>
  );
}

// Busca linhas filhas dos lançamentos em lotes de 100 ids (a URL da API tem limite) e agrupa por lançamento.
// Falha vira lista vazia com registro no log: o detalhe some, a linha do lançamento não.
async function porLancamento(
  ids: string[],
  consulta: (ids: string[]) => PromiseLike<{ data: { lancamento_id: string | null }[] | null; error: unknown }>,
): Promise<Map<string, unknown[]>> {
  const mapa = new Map<string, unknown[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await consulta(ids.slice(i, i + 100));
    if (error) console.error("apontamentos: detalhe dos lançamentos", error);
    for (const linha of data ?? []) {
      if (!linha.lancamento_id) continue;
      const lista = mapa.get(linha.lancamento_id) ?? [];
      lista.push(linha);
      mapa.set(linha.lancamento_id, lista);
    }
  }
  return mapa;
}

// Medidas da água do lançamento, sem as vazias
function aguaDe(l: { temperatura_c: number | null; oxigenio_mg_l: number | null; ph: number | null; transparencia_cm: number | null; amonia_mg_l: number | null }): Agua {
  const a: Agua = {};
  for (const chave of ["temperatura_c", "oxigenio_mg_l", "ph", "transparencia_cm", "amonia_mg_l"] as const) {
    if (l[chave] !== null) a[chave] = Number(l[chave]);
  }
  return a;
}

// "27,5 a 29" ou o único valor do dia
function faixa(min: number | null, max: number | null) {
  if (min === null && max === null) return "–";
  if (min === null || max === null || Number(min) === Number(max)) return formatarNumero(min ?? max, 1);
  return `${formatarNumero(min, 1)} a ${formatarNumero(max, 1)}`;
}

function racoesDe(v: unknown) {
  return ((v ?? []) as { kg: number; produtos: { nome: string } | null }[]).map((r) => ({ nome: r.produtos?.nome ?? "Ração", kg: Number(r.kg) }));
}

// "Tudo ok" ou os itens com problema; números aparecem com a unidade.
function resumoChecklist(v: unknown) {
  const respostas = (v ?? []) as { ok: boolean | null; valor: number | null; checklist_itens: { nome: string; unidade: string | null } | null }[];
  if (!respostas.length) return <span className="text-texto-suave">–</span>;
  const problemas = respostas.filter((r) => r.ok === false).map((r) => r.checklist_itens?.nome);
  const medidas = respostas.filter((r) => r.valor !== null).map((r) => `${r.checklist_itens?.nome} ${formatarNumero(r.valor, 1)}${r.checklist_itens?.unidade ? ` ${r.checklist_itens.unidade}` : ""}`);
  return (
    <>
      {problemas.length ? <span className="block text-perigo">Não ok: {problemas.join(", ")}</span> : <span className="block">Tudo ok</span>}
      {medidas.map((m) => <span key={m} className="block text-texto-suave">{m}</span>)}
    </>
  );
}
