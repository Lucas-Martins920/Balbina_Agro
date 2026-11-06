import { FormAcao } from "@/components/form-acao";
import { Campo, Cartao, classeBotao, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { centavosParaCampo, formatarMoeda, hojeISO, MESES_CURTOS } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { lerTodas } from "@/lib/supabase/todas";
import { GRUPOS_CATEGORIA } from "@/lib/titulos";
import { AbasRelatorio } from "../abas";
import { orcamentoDoRealizado, salvarOrcamento } from "./actions";
import { exigirAcesso } from "@/lib/permissoes";
import { ordenado } from "@/lib/ordem";

const paraCampo = (c: number) => (c ? centavosParaCampo(c) : "");

type Linha = { categoria_id: string; mes: string; orcado_cents: number; realizado_cents: number };

export default async function PaginaOrcamento({ searchParams }: PageProps<"/relatorios/orcamento">) {
  await exigirAcesso("relatorios");
  const filtros = await searchParams;
  const { atual } = await getEmpresaAtual();
  const hoje = hojeISO(atual.fuso);
  const anoAtual = Number(hoje.slice(0, 4));
  const ano = typeof filtros.ano === "string" && /^\d{4}$/.test(filtros.ano) ? Number(filtros.ano) : anoAtual;
  // até que mês comparar: o ano inteiro se já passou, até o mês corrente se for este ano
  const ateMes = ano < anoAtual ? 12 : ano > anoAtual ? 0 : Number(hoje.slice(5, 7));
  const supabase = await createClient();

  const [{ data: categorias }, { data: linhas, error }, { data: orcados }] = await Promise.all([
    supabase.from("categorias").select("id, nome, grupo, parent_id, ordem").eq("empresa_id", atual.id).eq("ativa", true).order("ordem").order("nome").then(ordenado),
    lerTodas(() => supabase.from("orcado_realizado").select("categoria_id, mes, orcado_cents, realizado_cents")
      .eq("empresa_id", atual.id).gte("mes", `${ano}-01-01`).lte("mes", `${ano}-12-01`).order("categoria_id").order("mes").order("orcado_cents").order("realizado_cents")),
    lerTodas(() => supabase.from("orcamentos").select("categoria_id, mes, valor_cents").eq("empresa_id", atual.id).eq("ano", ano).is("centro_custo_id", null)
      .order("categoria_id").order("mes").order("valor_cents")),
  ]);
  if (error) throw new Error(`Erro ao carregar o orçamento: ${error.message}`);

  const pais = new Set((categorias ?? []).map((c) => c.parent_id).filter(Boolean));
  const folhas = (categorias ?? []).filter((c) => !pais.has(c.id));
  const porCategoria = new Map<string, { orcAno: number; orcAte: number; realAte: number }>();
  for (const l of (linhas ?? []) as Linha[]) {
    const mes = Number(l.mes.slice(5, 7));
    const c = porCategoria.get(l.categoria_id) ?? { orcAno: 0, orcAte: 0, realAte: 0 };
    c.orcAno += Number(l.orcado_cents);
    if (mes <= ateMes) {
      c.orcAte += Number(l.orcado_cents);
      c.realAte += Number(l.realizado_cents);
    }
    porCategoria.set(l.categoria_id, c);
  }
  const mensal = new Map<string, number[]>();
  for (const o of orcados ?? []) {
    const v = mensal.get(o.categoria_id) ?? Array(12).fill(0);
    v[o.mes - 1] += Number(o.valor_cents);
    mensal.set(o.categoria_id, v);
  }
  const rotuloAte = ateMes === 12 ? "no ano" : ateMes === 0 ? "" : `até ${MESES_CURTOS[ateMes - 1]}`;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo descricao="Quanto se planejou gastar e receber em cada categoria e quanto aconteceu de fato (regime de competência).">Relatórios</Titulo>
      <AbasRelatorio atual="/relatorios/orcamento" />

      <div className="flex flex-wrap items-end gap-6">
        <form className="flex items-end gap-2">
          <Campo rotulo="Ano" id="ano" name="ano" type="number" min={2000} max={2100} defaultValue={ano} />
          <button type="submit" className={classeBotao("secundario")}>Ver</button>
        </form>
        <Cartao titulo={`Começar a partir de ${ano - 1}`} className="max-w-md">
          <FormAcao acao={orcamentoDoRealizado} botao="Gerar orçamento" limparAoSalvar={false}>
            <input type="hidden" name="ano" value={ano} />
            <Campo rotulo="Reajuste sobre o realizado (%)" id="reajuste" name="reajuste" inputMode="decimal" defaultValue="5" />
            <p className="text-xs text-texto-suave">Copia o realizado de cada mês de {ano - 1} com o reajuste. Categorias já orçadas não mudam.</p>
          </FormAcao>
        </Cartao>
      </div>

      {Object.entries(GRUPOS_CATEGORIA).map(([g, nomeGrupo]) => {
        const doGrupo = folhas.filter((c) => c.grupo === g);
        if (!doGrupo.length) return null;
        const entrada = g === "receita_operacional";
        return (
          <section key={g} className="relative overflow-x-auto vidro rounded-2xl border border-borda">
            <table className="w-full text-right text-sm tabular-nums">
              <thead className="bg-elevado/40 text-xs text-texto-suave">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{nomeGrupo}</th>
                  <th className="px-3 py-2 font-medium">Orçado {ano}</th>
                  <th className="px-3 py-2 font-medium">Orçado {rotuloAte}</th>
                  <th className="px-3 py-2 font-medium">Realizado {rotuloAte}</th>
                  <th className="px-3 py-2 font-medium">Desvio</th>
                </tr>
              </thead>
              <tbody>
                {doGrupo.map((c) => {
                  const v = porCategoria.get(c.id) ?? { orcAno: 0, orcAte: 0, realAte: 0 };
                  const desvio = v.orcAte ? ((v.realAte - v.orcAte) / v.orcAte) * 100 : null;
                  // passar do orçado é ruim na despesa e bom na receita
                  const ruim = desvio !== null && (entrada ? desvio < -5 : desvio > 5);
                  const valores = mensal.get(c.id) ?? Array(12).fill(0);
                  return (
                    <tr key={c.id} className="border-t border-borda/50 align-top">
                      <td className="px-3 py-1.5 text-left">
                        <details>
                          <summary className="cursor-pointer">{c.nome}</summary>
                          <FormAcao acao={salvarOrcamento} botao="Salvar" limparAoSalvar={false} className="mt-2">
                            <input type="hidden" name="ano" value={ano} />
                            <input type="hidden" name="categoria_id" value={c.id} />
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                              {MESES_CURTOS.map((m, i) => (
                                <Campo key={m} rotulo={m} id={`${c.id}_${i}`} name={`m${i + 1}`} inputMode="decimal" defaultValue={paraCampo(valores[i])} />
                              ))}
                            </div>
                          </FormAcao>
                        </details>
                      </td>
                      <td className="px-3 py-1.5">{v.orcAno ? formatarMoeda(v.orcAno) : "–"}</td>
                      <td className="px-3 py-1.5">{v.orcAte ? formatarMoeda(v.orcAte) : "–"}</td>
                      <td className="px-3 py-1.5">{v.realAte ? formatarMoeda(v.realAte) : "–"}</td>
                      <td className={`px-3 py-1.5 ${ruim ? "text-perigo" : ""}`}>
                        {desvio === null ? "–" : `${desvio > 0 ? "+" : ""}${Math.round(desvio)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
