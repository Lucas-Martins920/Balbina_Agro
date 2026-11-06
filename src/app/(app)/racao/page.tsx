import { BotaoLancamento } from "@/components/lancamento";
import { SelecaoComNovo } from "@/components/selecao-com-novo";
import { Campo, Cartao, Secao, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { TIPOS_DEPOSITO, TIPOS_PRODUTO } from "@/lib/estoque";
import { formatarData, formatarMoeda, formatarNumero, hojeISO } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { LinhasFormula } from "./linhas-formula";
import { criarDeposito, criarProduto, produzirRacao, registrarEntrada, registrarSaida, salvarFormula } from "./actions";
import { exigirAcesso } from "@/lib/permissoes";

export default async function PaginaRacao() {
  await exigirAcesso("racao");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: produtos }, { data: depositos }, { data: estoque }, { data: formulas }, { data: itens }, { data: ordens }, { data: lotes }] = await Promise.all([
    supabase.from("produtos").select("id, nome, tipo, unidade, custo_medio_cents").eq("empresa_id", atual.id).neq("tipo", "peixe").eq("ativo", true).order("nome"),
    supabase.from("depositos").select("id, nome, tipo").eq("empresa_id", atual.id).neq("tipo", "peixe").order("nome"),
    supabase.from("estoque_produtos").select("*").eq("empresa_id", atual.id).order("nome"),
    supabase.from("custo_formulas").select("*").eq("empresa_id", atual.id).order("racao"),
    supabase.from("formula_itens").select("formula_id, kg, kg_por_tonelada, produtos(nome), formulas_racao!inner(vigente, empresa_id)")
      .eq("formulas_racao.empresa_id", atual.id).eq("formulas_racao.vigente", true),
    supabase.from("ordens_producao_racao").select("id, data, toneladas, custo_total_cents, formulas_racao(fase, versao, produtos(nome))")
      .eq("empresa_id", atual.id).order("data", { ascending: false }).limit(15),
    supabase.from("lotes").select("id, codigo").eq("empresa_id", atual.id).neq("fase", "encerrado").order("codigo"),
  ]);

  const racoes = (produtos ?? []).filter((p) => p.tipo === "racao");
  const ingredientes = (produtos ?? []).filter((p) => ["insumo_racao", "medicamento", "outro"].includes(p.tipo));
  const valorTotal = (estoque ?? []).reduce((s, e) => s + Number(e.valor_cents ?? 0), 0);
  const hoje = hojeISO(atual.fuso);
  const opcoesDeposito = (depositos ?? []).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>);
  const opcoesProduto = (produtos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.unidade})</option>);

  const cadastros = (
    <>
      <BotaoLancamento rotulo="Produto" titulo="Cadastrar produto" acao={criarProduto} botao="Cadastrar" variante="secundario" tamanho="sm">
        <Campo rotulo="Nome" id="p_nome" name="nome" required placeholder="Ex.: Farelo de soja 46%" />
        <div className="grid grid-cols-2 gap-3">
          <Selecao rotulo="Tipo" id="p_tipo" name="tipo" defaultValue="insumo_racao">
            {Object.entries(TIPOS_PRODUTO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
          <Campo rotulo="Unidade" id="p_un" name="unidade" defaultValue="kg" />
        </div>
        <p className="text-xs text-texto-suave">Use kg para ingredientes e ração: a fórmula e a produção calculam em kg.</p>
      </BotaoLancamento>
      <BotaoLancamento rotulo="Depósito" titulo="Cadastrar depósito" acao={criarDeposito} botao="Criar" variante="secundario" tamanho="sm">
        <Campo rotulo="Nome" id="d_nome" name="nome" required placeholder="Ex.: Silo 1" />
        <Selecao rotulo="Tipo" id="d_tipo" name="tipo" defaultValue="insumos">
          {Object.entries(TIPOS_DEPOSITO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </Selecao>
      </BotaoLancamento>
    </>
  );

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo descricao={`Insumos, ração, embalagens e medicamentos: ${formatarMoeda(valorTotal)} em estoque ao custo médio.`} acoes={cadastros}>Fábrica de ração e insumos</Titulo>

      <Secao
        titulo="Estoque"
        acoes={
          <>
            <BotaoLancamento rotulo="Lançar saída" titulo="Saída: consumo, perda ou ajuste" acao={registrarSaida} botao="Lançar saída" variante="secundario" icone={null}>
              <Selecao rotulo="Produto" id="s_produto" name="produto_id" required defaultValue=""><option value="" disabled>Escolha…</option>{opcoesProduto}</Selecao>
              <Selecao rotulo="Depósito" id="s_deposito" name="deposito_id" required defaultValue=""><option value="" disabled>Escolha…</option>{opcoesDeposito}</Selecao>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Quantidade" id="s_qtd" name="quantidade" inputMode="decimal" required />
                <Selecao rotulo="Tipo" id="s_tipo" name="tipo" defaultValue="consumo_lote">
                  <option value="consumo_lote">Consumo no viveiro</option>
                  <option value="perda">Perda</option>
                  <option value="ajuste">Ajuste de inventário</option>
                </Selecao>
              </div>
              <Selecao rotulo="Lote" id="s_lote" name="lote_id" defaultValue="">
                <option value="">Nenhum</option>
                {(lotes ?? []).map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}
              </Selecao>
              <Campo rotulo="Data" id="s_data" name="data" type="date" defaultValue={hoje} required />
              <Campo rotulo="Observação" id="s_obs" name="observacao" />
            </BotaoLancamento>
            <BotaoLancamento rotulo="Lançar entrada" titulo="Entrada de compra" acao={registrarEntrada} botao="Lançar entrada">
              <SelecaoComNovo novo="produto" subtipos={TIPOS_PRODUTO} rotulo="Produto" id="e_produto" name="produto_id" required defaultValue=""><option value="" disabled>Escolha…</option>{opcoesProduto}</SelecaoComNovo>
              <SelecaoComNovo novo="deposito" subtipos={TIPOS_DEPOSITO} rotulo="Depósito" id="e_deposito" name="deposito_id" required defaultValue={depositos?.length === 1 ? depositos[0].id : ""}><option value="" disabled>Escolha…</option>{opcoesDeposito}</SelecaoComNovo>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Quantidade" id="e_qtd" name="quantidade" inputMode="decimal" required placeholder="Ex.: 30000" />
                <Campo rotulo="Custo total (R$)" id="e_custo" name="custo_total" inputMode="decimal" required placeholder="Ex.: 36.000,00" />
              </div>
              <Campo rotulo="Data" id="e_data" name="data" type="date" defaultValue={hoje} required />
              <Campo rotulo="Observação" id="e_obs" name="observacao" placeholder="Ex.: NF 1234, Agro Milho" />
              <p className="text-xs text-texto-suave">Lance a conta a pagar da compra em Contas a pagar; aqui fica só o estoque e o custo médio.</p>
            </BotaoLancamento>
          </>
        }
      >
        <Tabela cabecalho={["Produto", "Tipo", "Depósito", "Saldo", "Custo médio", "Valor"]} total={estoque?.length ?? 0}
          vazio="Nada em estoque. Cadastre os produtos e use Lançar entrada para a primeira compra.">
          {(estoque ?? []).map((e) => (
            <tr key={`${e.produto_id}-${e.deposito_id}`} className="tabular-nums">
              <td className="font-medium">{e.nome}</td>
              <td>{TIPOS_PRODUTO[e.tipo] ?? e.tipo}</td>
              <td>{e.deposito}</td>
              <td className={Number(e.saldo) < 0 ? "text-perigo" : ""}>{formatarNumero(e.saldo, 1)} {e.unidade}</td>
              <td>{formatarMoeda(Math.round(Number(e.custo_medio_cents) * 100) / 100)}</td>
              <td>{formatarMoeda(e.valor_cents)}</td>
            </tr>
          ))}
        </Tabela>
      </Secao>

      <Secao
        titulo="Fórmulas vigentes"
        acoes={
          <>
            <BotaoLancamento rotulo="Nova fórmula" titulo="Nova fórmula (ou nova versão)" acao={salvarFormula} botao="Salvar fórmula" variante="secundario">
              <div className="grid grid-cols-2 gap-3">
                <Selecao rotulo="Ração" id="f_racao" name="racao_id" required defaultValue="">
                  <option value="" disabled>Escolha…</option>
                  {racoes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </Selecao>
                <Campo rotulo="Fase" id="f_fase" name="fase" placeholder="Ex.: Engorda 1" list="fases_racao" />
              </div>
              <datalist id="fases_racao">
                {["Pré-inicial", "Inicial", "Crescimento", "Recria", "Pré-engorda", "Engorda 1", "Engorda 2", "Engorda 3"].map((f) => <option key={f} value={f} />)}
              </datalist>
              <LinhasFormula ingredientes={ingredientes.map((p) => ({ id: p.id, nome: p.nome }))} />
            </BotaoLancamento>
            <BotaoLancamento rotulo="Produzir ração" titulo="Ordem de produção" acao={produzirRacao} botao="Produzir" variante="secundario">
              <Selecao rotulo="Fórmula" id="o_formula" name="formula_id" required defaultValue="">
                <option value="" disabled>Escolha…</option>
                {(formulas ?? []).map((f) => <option key={f.formula_id} value={f.formula_id}>{f.racao} · {f.fase} v{f.versao}</option>)}
              </Selecao>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Quantidade" id="o_t" name="toneladas" inputMode="decimal" required />
                <Selecao rotulo="Em" id="o_unidade" name="unidade" defaultValue="t">
                  <option value="t">toneladas</option>
                  <option value="batidas">batidas da fórmula</option>
                </Selecao>
              </div>
              <p className="text-xs text-texto-suave">
                Batida de cada fórmula: {(formulas ?? []).map((f) => `${f.racao} ${formatarNumero(f.total_kg, 0)} kg`).join(" · ") || "—"}
              </p>
              <Selecao rotulo="Tirar os ingredientes de" id="o_ins" name="deposito_insumos" required defaultValue=""><option value="" disabled>Escolha…</option>{opcoesDeposito}</Selecao>
              <Selecao rotulo="Guardar a ração em" id="o_dest" name="deposito_destino" required defaultValue=""><option value="" disabled>Escolha…</option>{opcoesDeposito}</Selecao>
              <Campo rotulo="Data" id="o_data" name="data" type="date" defaultValue={hoje} required />
            </BotaoLancamento>
          </>
        }
      >
        {(formulas ?? []).length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhuma fórmula ainda.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {(formulas ?? []).map((f) => (
              <Cartao key={f.formula_id} titulo={`${f.racao} · ${f.fase} · versão ${f.versao}`}>
                <p className="mb-2 text-sm">
                  Batida de <strong className="tabular-nums">{formatarNumero(f.total_kg, 1)} kg</strong>: <strong className="tabular-nums">{formatarMoeda(f.custo_batida_cents)}</strong>
                  {" · "}tonelada hoje: <strong className="tabular-nums">{formatarMoeda(f.custo_tonelada_cents)}</strong>
                </p>
                <ul className="text-sm tabular-nums">
                  {(itens ?? []).filter((i) => i.formula_id === f.formula_id).map((i) => (
                    <li key={(i.produtos as unknown as { nome: string }).nome}>{(i.produtos as unknown as { nome: string }).nome}: {formatarNumero(i.kg, 1)} kg ({formatarNumero(Number(i.kg) * 100 / Number(f.total_kg), 2)}%)</li>
                  ))}
                </ul>
              </Cartao>
            ))}
          </div>
        )}
      </Secao>

      {(ordens ?? []).length > 0 && (
        <Secao titulo="Últimas produções">
          <Cartao>
            <ul className="flex flex-col gap-1 text-sm tabular-nums">
              {(ordens ?? []).map((o) => {
                const f = o.formulas_racao as unknown as { fase: string; versao: number; produtos: { nome: string } };
                return (
                  <li key={o.id}>
                    {formatarData(o.data)} · {f.produtos.nome} v{f.versao} · {formatarNumero(o.toneladas, 1)} t ·{" "}
                    {formatarMoeda(o.custo_total_cents)} ({formatarMoeda(Math.round(Number(o.custo_total_cents) / Number(o.toneladas)))}/t)
                  </li>
                );
              })}
            </ul>
          </Cartao>
        </Secao>
      )}
    </div>
  );
}
