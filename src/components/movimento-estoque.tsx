"use client";

import { useState } from "react";
import { AbasFiltro, FormPainel, ListaCadastro, SecaoForm } from "@/components/cadastro";
import { movimentarEstoque } from "@/app/(app)/estoque/actions";
import { Campo, Etiqueta, Selecao } from "@/components/ui";
import { ABAS_PRODUTO, TIPOS_PRODUTO_TODOS, produtoNaAba, unidadeSaldo, type AbaProduto } from "@/lib/estoque";
import { formatarMoeda, formatarQuantidade, hojeISO } from "@/lib/formato";

export type ProdutoEstoque = {
  id: string;
  nome: string;
  tipo: string;
  unidade: string;
  base_estoque: boolean;
  ativo: boolean;
  saldo: number;
  estoque_minimo: number | null;
  custo_medio_cents: number;
  valor_cents: number | null;
};
export type Opcao = { id: string; nome: string };
// saldo de cada produto (fora o pescado, que fica num depósito só) em cada depósito
export type SaldoDeposito = { produto_id: string; deposito_id: string; saldo: number };

const OPERACOES = [
  { valor: "entrada", nome: "Entrada" },
  { valor: "saida", nome: "Saída" },
  { valor: "ajuste", nome: "Ajuste de saldo" },
] as const;
type Operacao = (typeof OPERACOES)[number]["valor"];

// Lança entrada, saída ou ajuste de saldo de um produto do cadastro (painel lateral).
export function FormMovimento({ produtos, produtoId, depositos, saldos, lotes, operacaoInicial = "entrada" }: {
  operacaoInicial?: "entrada" | "saida" | "ajuste";
  produtos: ProdutoEstoque[];
  produtoId?: string;
  depositos: Opcao[];
  saldos: SaldoDeposito[];
  lotes: Opcao[];
}) {
  const [id, setId] = useState(produtoId ?? "");
  const [operacao, setOperacao] = useState<Operacao>(operacaoInicial);
  const [motivo, setMotivo] = useState("perda");
  const produto = produtos.find((p) => p.id === id);
  // pescado: o saldo é o da classe, em kg, no depósito do pescado (a despesca põe, a venda tira)
  const peixe = produto?.tipo === "peixe";
  const unidade = produto ? unidadeSaldo(produto) : "";
  const saldoNo = new Map(saldos.filter((s) => s.produto_id === id).map((s) => [s.deposito_id, Number(s.saldo)]));
  // depósito com mais saldo primeiro, para a saída já cair no lugar certo
  const depositoInicial = [...saldoNo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? depositos[0]?.id ?? "";
  const [escolhido, setDeposito] = useState("");
  const deposito = escolhido || depositoInicial;
  const saldoAtual = peixe || depositos.length === 0 ? produto?.saldo ?? 0 : saldoNo.get(deposito) ?? 0;

  return (
    <FormPainel acao={movimentarEstoque} botao="Lançar">
      {produtoId ? (
        <input type="hidden" name="produto_id" value={produtoId} />
      ) : (
        <Selecao rotulo="Produto" id="m_produto" name="produto_id" required value={id}
          onChange={(e) => { setId(e.target.value); setDeposito(""); }}>
          <option value="" disabled>Escolha…</option>
          {produtos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome} ({unidadeSaldo(p)})</option>)}
        </Selecao>
      )}
      <input type="hidden" name="operacao" value={operacao} />
      <AbasFiltro rotulo="Tipo de lançamento" valor={operacao} aoMudar={setOperacao} opcoes={[...OPERACOES]} />

      {produto && (
        <p className="text-sm">
          Saldo atual{!peixe && depositos.length > 1 ? " neste depósito" : ""}: <span className="font-medium tabular-nums">{formatarQuantidade(saldoAtual)} {unidade}</span>
          {peixe && !produto.base_estoque && <span className="text-xs text-texto-suave"> · o estoque fica na classe do peixe, em kg, convertido pelos kg da embalagem</span>}
        </p>
      )}

      <SecaoForm titulo={operacao === "entrada" ? "Entrada" : operacao === "saida" ? "Saída" : "Contagem"}>
        {!peixe && depositos.length > 0 && (
          <Selecao rotulo="Depósito" id="m_deposito" name="deposito_id" value={deposito} onChange={(e) => setDeposito(e.target.value)}>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>{d.nome}{saldoNo.has(d.id) ? ` · ${formatarQuantidade(saldoNo.get(d.id))} ${unidade}` : ""}</option>
            ))}
          </Selecao>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo={operacao === "ajuste" ? `Saldo contado (${unidade || "un"})` : `Quantidade (${unidade || "un"})`} id="m_qtd" name="quantidade"
            inputMode="decimal" required placeholder="0" ajuda={operacao === "ajuste" ? "O sistema lança a diferença para o saldo atual." : undefined} />
          {operacao === "entrada" && !peixe && (
            <Campo rotulo="Custo total (R$)" id="m_custo" name="custo_total" inputMode="decimal" placeholder="Opcional"
              ajuda="Compra: atualiza o custo médio." />
          )}
          {operacao === "saida" && (
            <Selecao rotulo="Motivo" id="m_motivo" name="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {!peixe && <option value="consumo_lote">Consumo no viveiro</option>}
              <option value="perda">Perda</option>
              <option value="ajuste">Ajuste de inventário</option>
            </Selecao>
          )}
        </div>
        {operacao === "saida" && motivo === "consumo_lote" && !peixe && (
          <Selecao rotulo="Lote (opcional)" id="m_lote" name="lote_id" defaultValue="">
            <option value="">Nenhum</option>
            {lotes.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </Selecao>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Data" id="m_data" name="data" type="date" defaultValue={hojeISO()} max={hojeISO()} required />
          <Campo rotulo="Observação" id="m_obs" name="observacao" placeholder="Ex.: NF 1234, contagem de sexta" />
        </div>
        {!peixe && depositos.length === 0 && (
          <p className="text-xs text-texto-suave">Sem depósito cadastrado: o lançamento vai para um depósito “Almoxarifado”, criado na hora.</p>
        )}
      </SecaoForm>
    </FormPainel>
  );
}

// Lista de todos os produtos do cadastro com saldo; clicar abre o lançamento de estoque.
export function ListaEstoque({ produtos, depositos, saldos, lotes, podeLancar }: {
  produtos: ProdutoEstoque[];
  depositos: Opcao[];
  saldos: SaldoDeposito[];
  lotes: Opcao[];
  podeLancar: boolean;
}) {
  const [aba, setAba] = useState<AbaProduto>("todos");
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const form = (produtoId?: string) => <FormMovimento produtos={produtos} produtoId={produtoId} depositos={depositos} saldos={saldos} lotes={lotes} />;

  return (
    <ListaCadastro
      colunas={["Produto", "Tipo", "Saldo", "Mínimo", "Custo médio", "Valor"]}
      direita={["Saldo", "Mínimo", "Custo médio", "Valor"]}
      buscaPlaceholder="Buscar produto"
      vazio="Nenhum produto neste filtro. Cadastre em Produtos e insumos."
      filtros={<AbasFiltro rotulo="Tipo de produto" valor={aba} aoMudar={setAba}
        opcoes={(Object.keys(ABAS_PRODUTO) as AbaProduto[]).map((a) => ({ valor: a, nome: ABAS_PRODUTO[a].nome }))} />}
      rotuloNovo="Lançar movimentação"
      novo={podeLancar ? { titulo: "Lançar movimentação", conteudo: form() } : null}
      editar={podeLancar ? (id) => {
        const p = porId.get(id);
        return p ? { titulo: p.nome, conteudo: form(p.id) } : null;
      } : undefined}
      linhas={produtos.filter((p) => (p.ativo || p.saldo !== 0) && produtoNaAba(p.tipo, aba)).map((p) => {
        const baixo = p.estoque_minimo !== null && p.saldo < Number(p.estoque_minimo);
        return {
          id: p.id,
          busca: [p.nome, TIPOS_PRODUTO_TODOS[p.tipo]].filter(Boolean).join(" "),
          inativa: !p.ativo,
          celulas: [
            <span key="n" className="font-medium text-texto">{p.nome}</span>,
            TIPOS_PRODUTO_TODOS[p.tipo] ?? p.tipo,
            <span key="s" className={p.saldo < 0 || baixo ? "font-medium text-perigo" : ""}>
              {formatarQuantidade(p.tipo === "peixe" && p.base_estoque ? p.saldo : Math.round(p.saldo * 100) / 100)} {unidadeSaldo(p)}
              {baixo && <Etiqueta tom="alerta" className="ml-2">Repor</Etiqueta>}
            </span>,
            p.estoque_minimo === null ? <span key="m" className="text-texto-suave">–</span> : formatarQuantidade(p.estoque_minimo),
            Number(p.custo_medio_cents) > 0 ? formatarMoeda(Math.round(Number(p.custo_medio_cents))) : <span key="c" className="text-texto-suave">–</span>,
            p.valor_cents ? formatarMoeda(p.valor_cents) : <span key="v" className="text-texto-suave">–</span>,
          ],
        };
      })}
    />
  );
}
