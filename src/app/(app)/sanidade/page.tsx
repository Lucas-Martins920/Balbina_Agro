import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { BotaoLancamento } from "@/components/lancamento";
import { Aviso, Campo, classeBotao, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { diasAtrasISO, formatarData, formatarMoeda, formatarQuantidade, hojeISO, somarDias } from "@/lib/formato";
import { TIPOS_EVENTO, TIPOS_MEDICAMENTO, UNIDADES_DOSE } from "@/lib/rotulos";
import { createClient } from "@/lib/supabase/server";
import { cancelarEvento, concluirEvento, registrarEvento, registrarMedicacao } from "./actions";
import { exigirAcesso } from "@/lib/permissoes";

type Evento = {
  id: string; data: string; tipo: string; status: string; dose: string | null; via: string | null; carencia_dias: number; observacoes: string | null;
  lotes: { codigo: string } | null; viveiros: { nome: string } | null;
};


export default async function PaginaSanidade() {
  await exigirAcesso("sanidade");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const hoje = hojeISO(atual.fuso);
  const campos = "id, data, tipo, status, dose, via, carencia_dias, observacoes, lotes(codigo), viveiros(nome)";

  const [{ data: planejados }, { data: realizados }, { data: lotes }, { data: medicamentos }, { data: medicacoes }] = await Promise.all([
    supabase.from("eventos_sanitarios").select(campos).eq("empresa_id", atual.id).eq("status", "planejado").order("data").limit(100),
    supabase.from("eventos_sanitarios").select(campos).eq("empresa_id", atual.id).eq("status", "realizado").gte("data", diasAtrasISO(90, atual.fuso))
      .order("data", { ascending: false }).limit(200),
    supabase.from("alocacoes_atuais").select("lote_id, lote_codigo, viveiro_id, viveiro_nome").eq("empresa_id", atual.id).order("lote_codigo"),
    supabase.from("medicamentos").select("id, nome, tipo, dose_por_unidade, unidade_dose, via, carencia_dias").eq("empresa_id", atual.id).eq("ativo", true).order("nome"),
    supabase.from("medicacoes").select("id, unidade_dose, quantidade, baixou_estoque, custo_cents").eq("empresa_id", atual.id).gte("data", diasAtrasISO(90, atual.fuso)),
  ]);
  const porMedicacao = new Map((medicacoes ?? []).map((m) => [m.id, m]));
  const lotesUnicos = [...new Map((lotes ?? []).map((l) => [l.lote_id, l])).values()];

  // medicação lançada pelo cadastro: quanto usou e o que saiu do estoque
  const estoque = (e: Evento) => {
    const m = porMedicacao.get(e.id);
    if (!m || m.quantidade == null) return null;
    const usado = `${formatarQuantidade(m.quantidade)} ${UNIDADES_DOSE[m.unidade_dose ?? ""] ?? ""}`;
    return m.baixou_estoque ? `${usado} baixados do estoque (${formatarMoeda(m.custo_cents)})` : `${usado} sem baixa no estoque`;
  };
  const detalhe = (e: Evento) => [e.dose, e.via, estoque(e), e.observacoes].filter(Boolean).join(" · ");

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo
        descricao="Medicações e banhos com a carência que segura a despesca, calagem, adubação, exames da água e demais manejos por lote."
        acoes={lotesUnicos.length === 0 ? undefined : (
          <>
            {medicamentos?.length ? (
              <BotaoLancamento rotulo="Registrar medicação" titulo="Registrar medicamento ou vitamina" acao={registrarMedicacao} botao="Registrar" variante="secundario">
            <div className="grid gap-3 grid-cols-2">
              <Selecao rotulo="Viveiro" id="med_viveiro" name="viveiro_id" required defaultValue="">
                <option value="" disabled>Escolha…</option>
                {(lotes ?? []).map((l) => <option key={l.viveiro_id} value={l.viveiro_id}>{l.viveiro_nome} ({l.lote_codigo})</option>)}
              </Selecao>
              <Selecao rotulo="Medicamento ou vitamina" id="med_medicamento" name="medicamento_id" required defaultValue="">
                <option value="" disabled>Escolha…</option>
                {medicamentos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} · {TIPOS_MEDICAMENTO[m.tipo]}{m.carencia_dias > 0 ? ` · carência ${m.carencia_dias} d` : ""}
                  </option>
                ))}
              </Selecao>
              <Campo rotulo="Início" id="med_data" name="data" type="date" defaultValue={hoje} max={hoje} required />
              <Campo rotulo="Dias de tratamento" id="med_dias" name="dias" inputMode="numeric" placeholder="1" />
              <Campo rotulo="Dose (opcional)" id="med_dose" name="dose" inputMode="decimal" placeholder="a do cadastro" ajuda="por kg de ração ou por m³ de água" />
              <Campo rotulo="Base da dose (opcional)" id="med_base" name="base" inputMode="decimal" ajuda="kg de ração medicada ou m³ de água" />
              <Campo rotulo="Quantidade usada (opcional)" id="med_qtd" name="quantidade" inputMode="decimal" placeholder="dose × base" />
              <Campo rotulo="Observações" id="med_obs" name="observacoes" className="col-span-2" />
            </div>
            <p className="text-xs text-texto-suave">
              Com carência, o lote não pode ser despescado para venda pelos dias de tratamento mais a carência do produto. Com produto de estoque ligado no cadastro, a quantidade usada sai do estoque.
            </p>
          </BotaoLancamento>
            ) : (
              <Link href="/medicamentos" className={classeBotao("secundario", "sm")}>Cadastrar medicamentos</Link>
            )}
            <BotaoLancamento rotulo="Registrar manejo" titulo="Registrar ou programar manejo" acao={registrarEvento}>
            <div className="grid gap-3 grid-cols-2">
              <Selecao rotulo="Lote" id="lote_id" name="lote_id" required defaultValue="">
                <option value="" disabled>Escolha…</option>
                {lotesUnicos.map((l) => <option key={l.lote_id} value={l.lote_id}>{l.lote_codigo}</option>)}
              </Selecao>
              <Selecao rotulo="Viveiro (opcional)" id="viveiro_id" name="viveiro_id" defaultValue="">
                <option value="">Todos do lote</option>
                {(lotes ?? []).map((l) => <option key={l.viveiro_id} value={l.viveiro_id}>{l.viveiro_nome} ({l.lote_codigo})</option>)}
              </Selecao>
              <Selecao rotulo="Manejo" id="tipo" name="tipo" required defaultValue="calagem">
                {Object.entries(TIPOS_EVENTO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </Selecao>
              <Campo rotulo="Data" id="data" name="data" type="date" defaultValue={hoje} required />
              <Selecao rotulo="Situação" id="status" name="status" defaultValue="realizado">
                <option value="realizado">Já foi feito</option>
                <option value="planejado">Programar</option>
              </Selecao>
              <Campo rotulo="Carência (dias sem despesca)" id="carencia" name="carencia" type="number" min={0} max={365} defaultValue={0} />
              <Campo rotulo="Produto e dose" id="dose" name="dose" placeholder="Ex.: calcário, 1 t/ha" />
              <Campo rotulo="Via" id="via" name="via" placeholder="ração, banho, água do viveiro" />
              <Campo rotulo="Responsável" id="responsavel" name="responsavel" />
              <Campo rotulo="Observações" id="observacoes" name="observacoes" className="col-span-2" />
            </div>
            <p className="text-xs text-texto-suave">
              Com carência, o lote não pode ser despescado para venda a partir da data até o fim da carência. A pesagem por amostragem (biometria) é lançada na tela do lote.
            </p>
          </BotaoLancamento>
          </>
        )}
      >
        Sanidade
      </Titulo>
      {lotesUnicos.length === 0 && <Aviso tipo="info">Nenhum lote povoado: povoe um lote para registrar manejos e medicações.</Aviso>}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Programados</h2>
        <Tabela cabecalho={["Data", "Lote", "Manejo", "Detalhe", ""]} principal="Manejo" total={planejados?.length ?? 0} vazio="Nada programado.">
          {((planejados ?? []) as unknown as Evento[]).map((e) => (
            <tr key={e.id}>
              <td className={`whitespace-nowrap tabular-nums ${e.data < hoje ? "font-semibold text-perigo" : ""}`}>{formatarData(e.data)}</td>
              <td>{e.lotes?.codigo}{e.viveiros && <span className="text-texto-suave"> · {e.viveiros.nome}</span>}</td>
              <td>{TIPOS_EVENTO[e.tipo] ?? e.tipo}{e.carencia_dias > 0 && <span className="text-xs text-texto-suave"> (carência {e.carencia_dias} d)</span>}</td>
              <td className="text-xs">{detalhe(e)}</td>
              <td>
                <div className="flex flex-wrap items-end gap-2">
                  <FormAcao acao={concluirEvento} botao="Feito" className="flex-row items-end">
                    <input type="hidden" name="evento_id" value={e.id} />
                    <input type="hidden" name="data" value={e.data < hoje ? hoje : e.data} />
                  </FormAcao>
                  <FormAcao acao={cancelarEvento} botao="Cancelar" variante="secundario">
                    <input type="hidden" name="evento_id" value={e.id} />
                  </FormAcao>
                </div>
              </td>
            </tr>
          ))}
        </Tabela>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Realizados nos últimos 90 dias</h2>
        <Tabela cabecalho={["Data", "Lote", "Manejo", "Detalhe", "Carência"]} principal="Manejo" total={realizados?.length ?? 0} vazio="Nenhum manejo registrado.">
          {((realizados ?? []) as unknown as Evento[]).map((e) => {
            const fim = somarDias(e.data, e.carencia_dias - 1);
            return (
              <tr key={e.id}>
                <td className="whitespace-nowrap tabular-nums">{formatarData(e.data)}</td>
                <td>{e.lotes?.codigo}{e.viveiros && <span className="text-texto-suave"> · {e.viveiros.nome}</span>}</td>
                <td>{TIPOS_EVENTO[e.tipo] ?? e.tipo}</td>
                <td className="text-xs">{detalhe(e)}</td>
                <td className="text-sm">
                  {e.carencia_dias === 0 ? "–" : (
                    <span className={fim >= hoje ? "text-perigo" : "text-texto-suave"}>{fim >= hoje ? `sem despesca até ${formatarData(fim)}` : `terminou em ${formatarData(fim)}`}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </Tabela>
      </section>

    </div>
  );
}
