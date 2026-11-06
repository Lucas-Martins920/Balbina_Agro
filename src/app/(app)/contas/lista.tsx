"use client";

import { useState } from "react";
import Link from "next/link";
import { AbasFiltro, FormPainel, ListaCadastro, Marcar, SecaoForm } from "@/components/cadastro";
import { Aviso, Campo, classeBotao, Etiqueta, Selecao } from "@/components/ui";
import { centavosParaCampo, formatarData, formatarMoeda } from "@/lib/formato";
import { excluirConta, salvarConta } from "./actions";

export const TIPOS_CONTA: Record<string, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  caixinha: "Caixa físico",
  aplicacao: "Aplicação",
  cartao_credito: "Cartão de crédito",
};

export type Conta = {
  id: string;
  nome: string;
  tipo: string;
  banco_codigo: string | null;
  agencia: string | null;
  conta: string | null;
  conta_dv: string | null;
  saldo_inicial_cents: number;
  saldo_inicial_data: string;
  arquivada: boolean;
  open_finance: boolean;
  // sistemas de onde a conta foi importada (NIBO...)
  origens: string[];
  saldo_cents: number;
  ultimo_movimento: string | null;
};

type Filtro = "ativas" | "arquivadas";

const NOME_ORIGEM: Record<string, string> = { nibo: "NIBO", lc: "LC Sistemas" };

function dadosBancarios(c: Conta) {
  const conta = c.conta ? `${c.conta}${c.conta_dv ? `-${c.conta_dv}` : ""}` : "";
  return [c.banco_codigo && `banco ${c.banco_codigo}`, c.agencia && `ag. ${c.agencia}`, conta && `c/c ${conta}`].filter(Boolean).join(" · ");
}

function FormConta({ conta, hoje, podeEditar }: { conta?: Conta; hoje: string; podeEditar: boolean }) {
  // Conta com movimento ou ligada ao banco não sai de vez: o banco recusa e a tela já oferece arquivar.
  const temHistorico = Boolean(conta && (conta.ultimo_movimento || conta.open_finance));
  const podeExcluir = Boolean(conta) && !temHistorico;

  return (
    <FormPainel acao={salvarConta} excluir={podeExcluir ? excluirConta : undefined} somenteLeitura={!podeEditar}
      confirmacao={`Excluir ${conta?.nome ?? "a conta"}? Não dá para desfazer.`}>
      {conta && <input type="hidden" name="id" value={conta.id} />}
      {conta?.open_finance && (
        <Aviso tipo="info">Ligada ao banco pelo Open Finance. Editar ou arquivar mantém a ligação e o extrato continua chegando.</Aviso>
      )}
      {conta && conta.origens.length > 0 && (
        <Aviso tipo="info">
          Importada do {conta.origens.map((o) => NOME_ORIGEM[o] ?? o.toUpperCase()).join(" e ")}. Pode mudar o nome: a próxima importação
          continua atualizando esta mesma conta.
        </Aviso>
      )}

      <SecaoForm titulo="Conta">
        <Campo rotulo="Nome" id="ct_nome" name="nome" defaultValue={conta?.nome} placeholder="Ex.: Sicredi" required />
        <Selecao rotulo="Tipo" id="ct_tipo" name="tipo" defaultValue={conta?.tipo ?? "corrente"}>
          {Object.entries(TIPOS_CONTA).filter(([v]) => v !== "cartao_credito").map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </Selecao>
      </SecaoForm>

      <SecaoForm titulo="Dados do banco">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Código do banco" id="ct_banco" name="banco_codigo" inputMode="numeric" placeholder="748" defaultValue={conta?.banco_codigo ?? ""} ajuda="opcional" />
          <Campo rotulo="Agência" id="ct_agencia" name="agencia" defaultValue={conta?.agencia ?? ""} ajuda="opcional" />
          <Campo rotulo="Conta" id="ct_conta" name="conta" defaultValue={conta?.conta ?? ""} ajuda="opcional" />
          <Campo rotulo="Dígito" id="ct_dv" name="conta_dv" defaultValue={conta?.conta_dv ?? ""} ajuda="opcional" />
        </div>
      </SecaoForm>

      <SecaoForm titulo="Saldo">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Saldo inicial (R$)" id="ct_saldo" name="saldo_inicial" inputMode="decimal" placeholder="0,00"
            defaultValue={conta ? centavosParaCampo(conta.saldo_inicial_cents) : ""} />
          <Campo rotulo="Saldo na data" id="ct_saldo_data" name="saldo_inicial_data" type="date" defaultValue={conta?.saldo_inicial_data ?? hoje} required />
        </div>
        <p className="text-xs text-texto-suave">
          O saldo é calculado a partir do saldo inicial somando pagamentos, recebimentos e transferências feitos a partir dessa data.
          {conta && <> Saldo hoje: <span className="tabular-nums">{formatarMoeda(conta.saldo_cents)}</span>.</>}
        </p>
      </SecaoForm>

      {conta && (
        <SecaoForm titulo="Situação">
          <Marcar rotulo="Arquivada" name="arquivada" defaultChecked={conta.arquivada}
            ajuda="Some das telas de lançamento, da conciliação e do saldo somado. Pagamentos, recebimentos e extrato antigos continuam nela." />
          {temHistorico && !conta.arquivada && (
            <p className="text-xs text-texto-suave">
              Esta conta já tem {conta.open_finance ? "ligação com o banco" : "movimentos"}, por isso não pode ser excluída. Para tirá-la das telas, marque Arquivada.
            </p>
          )}
        </SecaoForm>
      )}
    </FormPainel>
  );
}

export function ListaContas({ contas, hoje, podeEditar }: { contas: Conta[]; hoje: string; podeEditar: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("ativas");
  const porId = new Map(contas.map((c) => [c.id, c]));
  const arquivadas = contas.filter((c) => c.arquivada).length;
  const visiveis = contas.filter((c) => (filtro === "arquivadas") === c.arquivada);

  return (
    <ListaCadastro
      colunas={["Conta", "Tipo", "Saldo", "Último movimento", "Extrato"]}
      direita={["Saldo"]}
      buscaPlaceholder="Buscar conta, banco ou agência"
      vazio={filtro === "arquivadas" ? "Nenhuma conta arquivada." : "Nenhuma conta cadastrada."}
      filtros={<AbasFiltro rotulo="Situação" valor={filtro} aoMudar={setFiltro}
        opcoes={[{ valor: "ativas", nome: <>Ativas <span className="tabular-nums opacity-60">{contas.length - arquivadas}</span></> }, { valor: "arquivadas", nome: <>Arquivadas <span className="tabular-nums opacity-60">{arquivadas}</span></> }]} />}
      rotuloNovo="Nova conta"
      novo={podeEditar ? { titulo: "Nova conta", conteudo: <FormConta hoje={hoje} podeEditar /> } : null}
      editar={(id) => {
        const c = porId.get(id);
        return c ? { titulo: c.nome, conteudo: <FormConta conta={c} hoje={hoje} podeEditar={podeEditar} /> } : null;
      }}
      linhas={visiveis.map((c) => {
        const cartao = c.tipo === "cartao_credito";
        const detalhe = dadosBancarios(c);
        return {
          id: c.id,
          // cartão de crédito é editado na tela Cartões
          fixa: cartao,
          inativa: c.arquivada,
          busca: [c.nome, TIPOS_CONTA[c.tipo], c.banco_codigo, c.agencia, c.conta].filter(Boolean).join(" "),
          ordem: [c.nome, TIPOS_CONTA[c.tipo] ?? c.tipo, c.saldo_cents, c.ultimo_movimento ?? null, null],
          celulas: [
            <span key="n" className="flex flex-col">
              <span className="flex flex-wrap items-center gap-1.5 font-medium text-texto">
                {c.nome}
                {c.open_finance && <Etiqueta tom="info">Open Finance</Etiqueta>}
              </span>
              {detalhe && <span className="text-xs text-texto-suave">{detalhe}</span>}
            </span>,
            TIPOS_CONTA[c.tipo] ?? c.tipo,
            <span key="s" className={`whitespace-nowrap ${c.saldo_cents < 0 ? "text-perigo" : ""}`}>{formatarMoeda(c.saldo_cents)}</span>,
            formatarData(c.ultimo_movimento),
            cartao ? (
              <Link key="e" href="/cartoes" onClick={(e) => e.stopPropagation()} className={classeBotao("secundario", "sm")}>ver em Cartões</Link>
            ) : (
              <Link key="e" href={`/contas?conta=${c.id}`} onClick={(e) => e.stopPropagation()} className={classeBotao("secundario", "sm")}>Extrato</Link>
            ),
          ],
        };
      })}
    />
  );
}
