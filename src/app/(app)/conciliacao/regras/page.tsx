import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { BotaoLancamento } from "@/components/lancamento";
import { Campo, Cartao, classeBotao, Selecao, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { CAMPOS_REGRA, condicaoDoLancamento, descreverCondicao, OPERADORES_REGRA, TIPOS_REGRA, type Condicao } from "@/lib/regras";
import { createClient } from "@/lib/supabase/server";
import { lerTodas } from "@/lib/supabase/todas";
import { GRUPOS_CATEGORIA } from "@/lib/titulos";
import { alternarRegra, criarRegra, criarRegraSugerida, dispensarSugestao, excluirRegra, moverRegra } from "../actions";
import { exigirAcesso } from "@/lib/permissoes";
import { ordenado } from "@/lib/ordem";

type RegraSugerida = {
  chave: string; tipo: string; cpf_cnpj: string | null; descricao: string; nome_contraparte: string | null;
  categoria_id: string | null; centro_custo_id: string | null; contato_id: string | null; vezes: number;
};

export default async function PaginaRegras() {
  await exigirAcesso("conciliacao");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: sugeridas }, { data: regras }, { data: categorias }, { data: centros }, { data: contatos }, { data: contas }, { data: usos }] = await Promise.all([
    supabase.rpc("regras_sugeridas", { p_empresa: atual.id }),
    supabase.from("regras_conciliacao").select("*").eq("empresa_id", atual.id).order("tipo").order("ordem"),
    supabase.from("categorias").select("id, nome, grupo, sentido, parent_id, ordem").eq("empresa_id", atual.id).eq("ativa", true).order("ordem").order("nome").then(ordenado),
    supabase.from("centros_custo").select("id, nome, parent_id, ordem").eq("empresa_id", atual.id).eq("ativo", true).order("ordem").order("nome").then(ordenado),
    supabase.from("contatos").select("id, nome").eq("empresa_id", atual.id).eq("arquivado", false).order("nome"),
    supabase.from("contas_financeiras").select("id, nome").eq("empresa_id", atual.id).eq("arquivada", false).order("nome"),
    lerTodas(() => supabase.from("movimentos_bancarios").select("regra_aplicada_id").eq("empresa_id", atual.id).not("regra_aplicada_id", "is", null).order("id")),
  ]);

  const nome = (lista: { id: string; nome: string }[] | null, id: string | null) => lista?.find((x) => x.id === id)?.nome;
  const pais = new Set((categorias ?? []).map((c) => c.parent_id).filter(Boolean));
  const folhas = (categorias ?? []).filter((c) => !pais.has(c.id));
  const contagem = new Map<string, number>();
  for (const u of usos ?? []) contagem.set(u.regra_aplicada_id, (contagem.get(u.regra_aplicada_id) ?? 0) + 1);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Titulo descricao="As regras de ignorar valem já na importação. As outras lançam quando você clica em “Aplicar regras” na conciliação: cada lançamento passa pela lista na ordem e a primeira que servir concilia. Assim o saldo só muda quando você manda lançar. O que nenhuma regra resolver fica pendente."
        acoes={
          <>
            <Link href="/conciliacao" className={classeBotao("secundario", "sm")}>← Voltar para a conciliação</Link>
            <BotaoLancamento rotulo="Nova regra" acao={criarRegra} botao="Criar regra">
          <div className="grid gap-3 sm:grid-cols-2">
            <Selecao rotulo="Tipo" id="tipo" name="tipo" required defaultValue="pagamento">
              {Object.entries(TIPOS_REGRA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </Selecao>
            <Campo rotulo="Nome" id="nome" name="nome" required placeholder="Ex.: Tarifas do banco" />
          </div>
          {[1, 2].map((n) => (
            <fieldset key={n} className="grid gap-3 grid-cols-3">
              <legend className="mb-1 text-sm font-medium">{n === 1 ? "Condição" : "Segunda condição (opcional)"}</legend>
              <Selecao rotulo="Campo" id={`campo${n}`} name={`campo${n}`} defaultValue={n === 1 ? "descricao" : ""}>
                {n === 2 && <option value="">Nenhuma</option>}
                {Object.entries(CAMPOS_REGRA).map(([v, x]) => <option key={v} value={v}>{x}</option>)}
              </Selecao>
              <Selecao rotulo="Operador" id={`operador${n}`} name={`operador${n}`} defaultValue="contem">
                {Object.entries(OPERADORES_REGRA).map(([v, x]) => <option key={v} value={v}>{x}</option>)}
              </Selecao>
              <Campo rotulo="Valor" id={`valor${n}`} name={`valor${n}`} placeholder="Ex.: TARIFA" />
            </fieldset>
          ))}
          <Selecao rotulo="Com duas condições, vale quando" id="operador_logico" name="operador_logico" defaultValue="todas">
            <option value="todas">as duas forem verdadeiras</option>
            <option value="qualquer">qualquer uma for verdadeira</option>
          </Selecao>
          <Selecao rotulo="Conta" id="conta_id" name="conta_id" defaultValue="">
            <option value="">Todas as contas</option>
            {(contas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>

          <fieldset className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium">O que fazer (pagamento e recebimento)</legend>
            <Selecao rotulo="Categoria" id="categoria_id" name="categoria_id" defaultValue="">
              <option value="">Nenhuma: procurar título em aberto do contato</option>
              {Object.entries(GRUPOS_CATEGORIA).map(([g, n]) => {
                const doGrupo = folhas.filter((c) => c.grupo === g);
                return doGrupo.length ? <optgroup key={g} label={n}>{doGrupo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</optgroup> : null;
              })}
            </Selecao>
            <Selecao rotulo="Contato" id="contato_id" name="contato_id" defaultValue="">
              <option value="">Nenhum</option>
              {(contatos ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
            <Selecao rotulo="Centro de custo" id="centro_custo_id" name="centro_custo_id" defaultValue="">
              <option value="">Nenhum</option>
              {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
            <Campo rotulo="Descrição do lançamento" id="descricao" name="descricao" placeholder="Em branco: a do extrato" />
          </fieldset>
          <p className="text-sm text-texto-suave">Tipo “Ignorar” não precisa de nada acima: o lançamento só sai da lista para conciliar (bom para aplicação e resgate automáticos, como o BB Rende Fácil).</p>
          <Selecao rotulo="Transferência: a outra conta" id="contrapartida_id" name="contrapartida_id" defaultValue="">
            <option value="">—</option>
            {(contas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
        </BotaoLancamento>
          </>
        }>
        Regras de conciliação
      </Titulo>

      {(sugeridas?.length ?? 0) > 0 && (
        <Cartao titulo="Regras sugeridas" descricao="Lançamentos que você conciliou do mesmo jeito 3 vezes ou mais e que nenhuma regra pega. Criando a regra, os próximos se conciliam ao clicar em “Aplicar regras”.">
          <ul className="flex flex-col gap-2">
            {(sugeridas as RegraSugerida[]).map((r) => {
              const cond = condicaoDoLancamento(r.descricao, r.cpf_cnpj);
              const nomeRegra = `${r.tipo === "pagamento" ? "Pagamento" : "Recebimento"}: ${r.nome_contraparte ?? cond.valor}`;
              return (
                <li key={r.chave} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-elevado/60 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">Se {descreverCondicao(cond)}</span>
                    <span className="block text-xs text-texto-suave">
                      → {TIPOS_REGRA[r.tipo]} em {nome(categorias, r.categoria_id) ?? "?"}
                      {r.contato_id && ` · ${nome(contatos, r.contato_id)}`}{r.centro_custo_id && ` · ${nome(centros, r.centro_custo_id)}`}
                      {` · ${r.vezes} vezes assim`}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <FormAcao acao={criarRegraSugerida} botao="Criar regra">
                      <input type="hidden" name="tipo" value={r.tipo} />
                      <input type="hidden" name="nome" value={nomeRegra} />
                      <input type="hidden" name="descricao" value={r.descricao} />
                      <input type="hidden" name="cpf_cnpj" value={r.cpf_cnpj ?? ""} />
                      <input type="hidden" name="categoria_id" value={r.categoria_id ?? ""} />
                      <input type="hidden" name="centro_custo_id" value={r.centro_custo_id ?? ""} />
                      <input type="hidden" name="contato_id" value={r.contato_id ?? ""} />
                    </FormAcao>
                    <FormAcao acao={dispensarSugestao} botao="Não sugerir" variante="secundario">
                      <input type="hidden" name="tipo" value="regra" />
                      <input type="hidden" name="chave" value={r.chave} />
                    </FormAcao>
                  </span>
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}

      {Object.entries(TIPOS_REGRA).map(([tipo, rotulo]) => {
        const doTipo = (regras ?? []).filter((r) => r.tipo === tipo);
        if (!doTipo.length) return null;
        return (
          <section key={tipo} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-texto-suave">{rotulo}</h2>
            <ol className="flex flex-col gap-2">
              {doTipo.map((r, i) => {
                const acao = tipo === "ignorar" ? "ignorar (fica fora do financeiro, sem apagar do extrato)" : tipo === "transferencia"
                  ? `transferência com ${nome(contas, r.acao_contrapartida_conta_id) ?? "?"}`
                  : [r.acao_categoria_id && `categoria ${nome(categorias, r.acao_categoria_id)}`,
                     r.acao_centro_custo_id && `centro ${nome(centros, r.acao_centro_custo_id)}`,
                     r.acao_contato_id && `${r.acao_categoria_id ? "contato" : "título em aberto de"} ${nome(contatos, r.acao_contato_id)}`]
                    .filter(Boolean).join(", ");
                return (
                  <li key={r.id} className={`flex flex-wrap items-start justify-between gap-3 vidro rounded-2xl border border-borda p-3 text-sm ${r.ativa ? "" : "opacity-60"}`}>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{i + 1}. {r.nome}{!r.ativa && " (pausada)"}</span>
                      <span className="text-texto-suave">
                        Se {(r.condicoes as Condicao[]).map(descreverCondicao).join(r.operador_logico === "todas" ? " e " : " ou ")}
                        {r.contas?.length ? ` na conta ${r.contas.map((c: string) => nome(contas, c)).join(", ")}` : ""}
                      </span>
                      <span>→ {acao}</span>
                      <span className="text-xs text-texto-suave">{contagem.get(r.id) ?? 0} lançamento(s) {tipo === "ignorar" ? "ignorado(s)" : "conciliado(s)"} por ela</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {i > 0 && (
                        <FormAcao acao={moverRegra} botao="↑" variante="secundario">
                          <input type="hidden" name="regra_id" value={r.id} /><input type="hidden" name="direcao" value="cima" />
                        </FormAcao>
                      )}
                      {i < doTipo.length - 1 && (
                        <FormAcao acao={moverRegra} botao="↓" variante="secundario">
                          <input type="hidden" name="regra_id" value={r.id} /><input type="hidden" name="direcao" value="baixo" />
                        </FormAcao>
                      )}
                      <FormAcao acao={alternarRegra} botao={r.ativa ? "Pausar" : "Ativar"} variante="secundario">
                        <input type="hidden" name="regra_id" value={r.id} /><input type="hidden" name="ativa" value={String(r.ativa)} />
                      </FormAcao>
                      <FormAcao acao={excluirRegra} botao="Excluir" variante="secundario">
                        <input type="hidden" name="regra_id" value={r.id} />
                      </FormAcao>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      {(regras ?? []).length === 0 && <p className="text-sm text-texto-suave">Nenhuma regra ainda. Use Nova regra no alto ou marque “Criar regra” ao conciliar um lançamento.</p>}
    </div>
  );
}
