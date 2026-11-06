import Link from "next/link";
import { AcaoConfirmada } from "@/components/acao-confirmada";
import { BotaoLancamento } from "@/components/lancamento";
import { AreaTexto, Aviso, Campo, CLASSE_BOTAO_TEXTO, Etiqueta, Faixa, Indicador, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { diasAtrasISO, formatarData, formatarInteiro, hojeISO } from "@/lib/formato";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { faixaClasse, textoKg, textoPeso } from "@/lib/pescado";
import { createClient } from "@/lib/supabase/server";
import { desfazerDespesca, registrarDespesca } from "./actions";

const DIAS = 90;

// Despesca: o peixe sai do viveiro (parte dele ou todo) e os kg entram no estoque, por classe de tamanho.
export default async function PaginaDespescas() {
  await exigirAcesso("lotes");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const hoje = hojeISO(atual.fuso);
  const desde = diasAtrasISO(DIAS, atual.fuso);
  const supabase = await createClient();
  const [{ data: ocupados }, { data: classes }, { data: despescas }, { data: movimentos }, { data: viveiros }] = await Promise.all([
    supabase.from("alocacoes_atuais").select("lote_id, lote_codigo, viveiro_id, viveiro_nome, setor_nome, peixes_atuais, peso_medio_g, biomassa_kg, carencia_ate")
      .eq("empresa_id", atual.id).order("viveiro_nome"),
    supabase.from("classes_peixe").select("id, nome, ordem, comercializavel, sem_classificacao, peso_min_g, peso_max_g").eq("empresa_id", atual.id).order("ordem"),
    supabase.from("despescas").select("id, data, lote_id, viveiro_id, tipo, qtd_peixes, kg_total, peso_medio_g, peixes_perdidos, observacoes, created_at, lotes(codigo)")
      .eq("empresa_id", atual.id).gte("data", desde).order("data", { ascending: false }).order("created_at", { ascending: false }).limit(300),
    supabase.from("movimentos_estoque").select("origem_id, quantidade, produtos(classe_peixe_id)")
      .eq("empresa_id", atual.id).eq("origem_tabela", "despescas").gte("data", desde).limit(3000),
    supabase.from("viveiros").select("id, nome, setores(nome)").eq("empresa_id", atual.id),
  ]);
  const podeLancar = pode("lotes.editar") || pode("apontamentos.editar") || pode("estoque.editar");
  const podeDesfazer = pode("lotes.editar") || pode("estoque.editar");
  const nomeViveiro = new Map((viveiros ?? []).map((v) => [v.id, `${(v.setores as unknown as { nome: string } | null)?.nome ?? ""} / ${v.nome}`]));
  const nomeClasse = new Map((classes ?? []).map((c) => [c.id, c.nome]));
  const inteiro = (classes ?? []).find((c) => c.sem_classificacao);
  const separaveis = (classes ?? []).filter((c) => !c.sem_classificacao);

  const porDespesca = new Map<string, { classe: string; kg: number }[]>();
  for (const m of movimentos ?? []) {
    const classe = nomeClasse.get((m.produtos as unknown as { classe_peixe_id: string } | null)?.classe_peixe_id ?? "") ?? "?";
    porDespesca.set(m.origem_id, [...(porDespesca.get(m.origem_id) ?? []), { classe, kg: Number(m.quantidade) }]);
  }
  // só a última despesca de cada lote pode ser desfeita (as linhas vêm da mais nova para a mais velha)
  const ultimaDoLote = new Set<string>();
  const vistos = new Set<string>();
  for (const d of despescas ?? []) if (!vistos.has(d.lote_id)) { vistos.add(d.lote_id); ultimaDoLote.add(d.id); }

  const mes = hoje.slice(0, 7);
  const doMes = (despescas ?? []).filter((d) => d.data.startsWith(mes));
  const kgMes = doMes.reduce((s, d) => s + Number(d.kg_total), 0);
  const peixesMes = doMes.reduce((s, d) => s + Number(d.qtd_peixes), 0);
  const encerrados = doMes.filter((d) => d.tipo === "total").length;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo descricao="O peixe sai do viveiro e os kg entram no estoque, por classe de tamanho. A despesca parcial deixa peixes no viveiro; a total esvazia o viveiro e, se for o último do lote, encerra o lote."
        acoes={podeLancar && (ocupados ?? []).length > 0 ? (
          <BotaoLancamento rotulo="Lançar despesca" titulo="Despesca" acao={registrarDespesca} botao="Lançar despesca" chave="despesca"
            descricao="Pese tudo o que saiu do viveiro. Se separar por tamanho, informe os kg de cada classe; o que não for separado entra como peixe inteiro.">
            <Selecao rotulo="Viveiro" id="d_viveiro" name="viveiro_id" defaultValue="" required>
              <option value="" disabled>Escolha…</option>
              {(ocupados ?? []).map((o) => (
                <option key={o.viveiro_id} value={o.viveiro_id} disabled={!!o.carencia_ate}>
                  {o.setor_nome} / {o.viveiro_nome} · lote {o.lote_codigo} · {formatarInteiro(o.peixes_atuais)} peixes de ~{textoPeso(o.peso_medio_g)}
                  {o.carencia_ate ? ` (carência até ${formatarData(o.carencia_ate)})` : ""}
                </option>
              ))}
            </Selecao>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Data" id="d_data" name="data" type="date" max={hoje} defaultValue={hoje} required />
              <Selecao rotulo="Tipo" id="d_tipo" name="tipo" defaultValue="parcial" required>
                <option value="parcial">Parcial: ficam peixes</option>
                <option value="total">Total: esvazia o viveiro</option>
              </Selecao>
              <Campo rotulo="Total despescado (kg)" id="d_kg" name="kg" inputMode="decimal" placeholder="Ex.: 1.250,5" required />
              <Campo rotulo="Peixes" id="d_peixes" name="qtd_peixes" inputMode="numeric"
                ajuda="Na parcial, sem número o sistema estima pelo peso médio; na total, sem número saem todos os vivos." />
            </div>
            {separaveis.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">Separado por tamanho (kg, opcional)</legend>
                {/* fora do prefixo classe_: a ação lê como kg tudo o que começa com classe_ */}
                {inteiro && <input type="hidden" name="inteiro_id" value={inteiro.id} />}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {separaveis.map((c) => (
                    <Campo key={c.id} rotulo={c.nome} id={`d_classe_${c.id}`} name={`classe_${c.id}`} inputMode="decimal" placeholder="0"
                      ajuda={faixaClasse(c.peso_min_g, c.peso_max_g) || undefined} />
                  ))}
                </div>
              </fieldset>
            )}
            <AreaTexto rotulo="Observações" id="d_obs" name="observacoes" className="font-sans" placeholder="Ex.: comprador, gelo, transporte" />
          </BotaoLancamento>
        ) : null}>
        Despescas
      </Titulo>

      {(ocupados ?? []).length === 0 && <Aviso tipo="info">Nenhum viveiro povoado hoje. Povoe um lote em <Link href="/lotes" className={CLASSE_BOTAO_TEXTO}>Lotes</Link>.</Aviso>}

      <Faixa colunas={4}>
        <Indicador rotulo="Despescado no mês" valor={textoKg(kgMes, 0)} detalhe={`${doMes.length} ${doMes.length === 1 ? "despesca" : "despescas"}`} />
        <Indicador rotulo="Peixes no mês" valor={formatarInteiro(peixesMes)} detalhe={peixesMes ? `peso médio de ${textoPeso((kgMes * 1000) / peixesMes)}` : "–"} />
        <Indicador rotulo="Viveiros esvaziados" valor={formatarInteiro(encerrados)} detalhe="despescas totais no mês" />
        <Indicador rotulo="Biomassa nos viveiros" valor={textoKg((ocupados ?? []).reduce((s, o) => s + Number(o.biomassa_kg ?? 0), 0), 0)}
          detalhe={`${(ocupados ?? []).length} ${(ocupados ?? []).length === 1 ? "viveiro povoado" : "viveiros povoados"}`} />
      </Faixa>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Últimos {DIAS} dias</h2>
        <Tabela celular="rolar" cabecalho={["Data", "Lote", "Viveiro", "Tipo", "Peixes", "Total", "Peso médio", "Classes", "Perdidos", ...(podeDesfazer ? [""] : [])]}
          direita={["Peixes", "Total", "Peso médio", "Perdidos"]} total={despescas?.length ?? 0} vazio="Nenhuma despesca no período.">
          {(despescas ?? []).map((d) => {
            const lote = d.lotes as unknown as { codigo: string } | null;
            const partes = porDespesca.get(d.id) ?? [];
            return (
              <tr key={d.id} className="tabular-nums">
                <td>{formatarData(d.data)}</td>
                <td><Link href={`/lotes/${d.lote_id}`} className={CLASSE_BOTAO_TEXTO}>{lote?.codigo ?? "–"}</Link></td>
                <td>{nomeViveiro.get(d.viveiro_id) ?? "–"}</td>
                <td><Etiqueta tom={d.tipo === "total" ? "positivo" : "info"}>{d.tipo === "total" ? "Total" : "Parcial"}</Etiqueta></td>
                <td className="text-right">{formatarInteiro(d.qtd_peixes)}</td>
                <td className="text-right font-medium">{textoKg(d.kg_total)}</td>
                <td className="text-right">{textoPeso(d.peso_medio_g)}</td>
                <td className="text-texto-suave">{partes.map((p) => `${p.classe} ${textoKg(p.kg)}`).join(" · ") || "–"}</td>
                <td className="text-right">{d.peixes_perdidos ? <span className="text-perigo">{formatarInteiro(d.peixes_perdidos)}</span> : "–"}</td>
                {podeDesfazer && (
                  <td className="text-right">
                    {ultimaDoLote.has(d.id) && (
                      <AcaoConfirmada acao={desfazerDespesca} botao="Desfazer" variante="perigo" confirmar="Desfazer"
                        pergunta={`Desfazer a despesca de ${textoKg(d.kg_total)} do lote ${lote?.codigo ?? ""}? Os peixes voltam ao viveiro e os kg saem do estoque.`}>
                        <input type="hidden" name="id" value={d.id} />
                      </AcaoConfirmada>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </Tabela>
        <p className="text-xs text-texto-suave">
          Perdidos: na despesca total, peixes que o apontamento dizia estar no viveiro e não apareceram (predação, fuga, morte não apontada).
          Só a última despesca de cada lote pode ser desfeita, e só enquanto o peixe não foi vendido.
        </p>
      </section>
    </div>
  );
}
