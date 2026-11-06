import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { BotaoLancamento } from "@/components/lancamento";
import { AreaTexto, Campo, LinkBotao, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { faixaClasse, KG_CAIXA, numeroKg, textoKg } from "@/lib/pescado";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { TIPOS_PONTO } from "@/lib/pontos";
import { carregarPontos } from "@/lib/pontos-dados";
import { createClient } from "@/lib/supabase/server";
import { contarPonto, salvarPonto } from "../actions";
import { CamposPonto } from "../campos";

export default async function PaginaPontoVenda({ params }: PageProps<"/pontos-de-venda/[id]">) {
  await exigirAcesso("estoque");
  const { id } = await params;
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const ponto = (await carregarPontos(atual.id)).find((p) => p.id === id);
  if (!ponto) notFound();
  const supabase = await createClient();
  const [{ data: estoque }, { data: classes }, { data: caixas }] = await Promise.all([
    supabase.from("estoque_peixe_ponto").select("classe_id, classe_nome, ordem, saldo, disponivel, comercializavel, sem_classificacao")
      .eq("ponto_venda_id", id).order("ordem"),
    supabase.from("classes_peixe").select("id, peso_min_g, peso_max_g").eq("empresa_id", atual.id),
    supabase.from("contas_financeiras").select("id, nome").eq("empresa_id", atual.id).eq("tipo", "caixinha").eq("arquivada", false).order("nome"),
  ]);
  const linhas = (estoque ?? []).filter((e) => e.comercializavel || Number(e.saldo) !== 0);
  const faixa = new Map((classes ?? []).map((c) => [c.id, faixaClasse(c.peso_min_g, c.peso_max_g)]));
  const total = linhas.reduce((s, e) => s + Number(e.saldo), 0);
  const podeEditar = pode("estoque.editar") || pode("configuracoes.editar");

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Titulo descricao={`${TIPOS_PONTO[ponto.tipo] ?? ponto.tipo}${ponto.municipio ? ` · ${ponto.municipio}${ponto.uf ? `/${ponto.uf}` : ""}` : ""} · ${textoKg(total)} de pescado em estoque${ponto.ativo ? "" : " · inativo"}`}
        acoes={
          <>
            <LinkBotao href="/pontos-de-venda" variante="fantasma">Pontos de venda</LinkBotao>
            {podeEditar && (
              <BotaoLancamento rotulo="Dados do ponto" acao={salvarPonto} variante="secundario" icone={<Pencil size={16} strokeWidth={1.75} aria-hidden />}>
              <input type="hidden" name="id" value={ponto.id} />
              <CamposPonto ponto={ponto} sufixo="editar" />
              <Selecao rotulo="Caixa do PDV (dinheiro da gaveta)" id="conta_caixa_id" name="conta_caixa_id" defaultValue={ponto.conta_caixa_id ?? ""}
                ajuda="Sem caixa próprio, o dinheiro do PDV deste ponto cai no caixa da piscicultura">
                <option value="">Caixa da piscicultura</option>
                {(caixas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
              <AreaTexto rotulo="Observações" id="observacoes" name="observacoes" defaultValue={ponto.observacoes ?? ""} />
              {!ponto.sede && (
                <>
                  <input type="hidden" name="ativo_presente" value="1" />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="ativo" defaultChecked={ponto.ativo} /> Ponto ativo (desmarque para parar de vender aqui; precisa estar sem peixe)
                  </label>
                </>
              )}
            </BotaoLancamento>
            )}
            {podeEditar && !ponto.sede && pode("estoque.editar") && (
              <BotaoLancamento rotulo="Lançar contagem" titulo="Contagem do ponto" acao={contarPonto} botao="Lançar contagem" variante="secundario" icone={null}
                descricao="Pese o peixe do ponto e lance: cada classe preenchida fica com os kg contados (0 zera). Classe em branco não muda.">
                <input type="hidden" name="id" value={ponto.id} />
                {linhas.map((c) => (
                  <div key={c.classe_id} className="grid grid-cols-[1fr_7rem] items-end gap-2">
                    <span className="pb-2 text-sm">{c.classe_nome}
                      <span className="block text-xs text-texto-suave">sistema: {textoKg(c.saldo, 3)}</span></span>
                    <Campo rotulo="kg contados" id={`conta_${c.classe_id}`} name={`conta_${c.classe_id}`} inputMode="decimal" placeholder="0" />
                  </div>
                ))}
                <Campo rotulo="Observação" id="observacao_contagem" name="observacao" />
              </BotaoLancamento>
            )}
            <LinkBotao href="/pontos-de-venda/transferencias" variante="primario">Transferir peixe</LinkBotao>
          </>
        }>
        {ponto.nome}
      </Titulo>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Estoque de pescado</h2>
        <Tabela cabecalho={["Classe", "Peso do peixe", "Em estoque", `Caixas de ${KG_CAIXA} kg`, "Disponível"]} total={linhas.length} direita={["Em estoque", `Caixas de ${KG_CAIXA} kg`, "Disponível"]}
          vazio="Sem peixe neste ponto. Mande da piscicultura por uma transferência.">
          {linhas.map((e) => (
            <tr key={e.classe_id} className="tabular-nums">
              <td className="font-medium">{e.classe_nome}</td>
              <td className="text-texto-suave">{faixa.get(e.classe_id) || "–"}</td>
              <td className={`text-right ${Number(e.saldo) < 0 ? "text-perigo" : ""}`}>{textoKg(e.saldo)}</td>
              <td className="text-right">{numeroKg(Number(e.saldo) / KG_CAIXA)}</td>
              <td className="text-right font-medium">{textoKg(e.disponivel)}</td>
            </tr>
          ))}
        </Tabela>
        {ponto.sede && <p className="text-xs text-texto-suave">Na piscicultura, a despesca, a carência e a contagem do pescado ficam nas telas Despescas e Estoque.</p>}
      </section>
    </div>
  );
}
