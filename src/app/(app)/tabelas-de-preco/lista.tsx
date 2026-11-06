"use client";

import { useState, type ReactNode } from "react";
import { FormPainel, ListaCadastro, Marcar, SecaoForm } from "@/components/cadastro";
import { AreaTexto, Aviso, Campo, Etiqueta } from "@/components/ui";
import { TIPOS_PRODUTO_TODOS } from "@/lib/estoque";
import { centavosParaCampo, formatarMoeda, formatarNumero, lerDecimal } from "@/lib/formato";
import { aplicarAjuste } from "@/lib/vendas";
import { excluirTabelaPreco, salvarTabelaPreco } from "./actions";

export type ProdutoPreco = { id: string; nome: string; tipo: string; unidade: string };
export type Tabela = {
  id: string;
  nome: string;
  padrao: boolean;
  ajuste_pct: number;
  ativa: boolean;
  observacoes: string | null;
  precos: Record<string, number>;
  clientes: number;
};

// 1234 -> "12,34" para o campo de preço
const paraCampo = centavosParaCampo;

function regra(t: Tabela) {
  if (t.padrao) return "Base de todos os preços";
  if (!t.ajuste_pct) return "Igual à padrão no que não tiver preço";
  return `${t.ajuste_pct > 0 ? "+" : "−"}${formatarNumero(Math.abs(t.ajuste_pct), 2).replace(/,00$/, "")}% sobre a padrão`;
}

function FormTabela({ tabela, base, produtos, podeEditar }: { tabela?: Tabela; base: Record<string, number>; produtos: ProdutoPreco[]; podeEditar: boolean }) {
  const [padrao, setPadrao] = useState(tabela?.padrao ?? false);
  const [ajuste, setAjuste] = useState(tabela?.ajuste_pct ? String(tabela.ajuste_pct).replace(".", ",") : "");
  const pct = padrao ? 0 : lerDecimal(ajuste) ?? 0;
  const eraPadrao = Boolean(tabela?.padrao);

  return (
    <FormPainel acao={salvarTabelaPreco} excluir={tabela && !tabela.padrao ? excluirTabelaPreco : undefined} somenteLeitura={!podeEditar}
      confirmacao={`Excluir ${tabela?.nome ?? "a tabela"}? ${tabela?.clientes ? `${tabela.clientes} cliente(s) voltam para a padrão. ` : ""}Pedidos já feitos não mudam.`}>
      {tabela && <input type="hidden" name="id" value={tabela.id} />}

      <SecaoForm titulo="Tabela">
        <Campo rotulo="Nome" id="tp_nome" name="nome" defaultValue={tabela?.nome} placeholder="Ex.: Atacado, Varejo, Revenda" required />
        {eraPadrao ? (
          <>
            <input type="hidden" name="padrao" value="on" />
            <Aviso tipo="info">Esta é a tabela padrão: vale para todos os clientes e é a base das outras. Para trocar, marque outra tabela como padrão.</Aviso>
          </>
        ) : (
          <Marcar rotulo="Tabela padrão" ajuda="Passa a valer para todos os clientes sem tabela própria; a padrão atual vira uma tabela comum."
            name="padrao" checked={padrao} onChange={(e) => setPadrao(e.target.checked)} />
        )}
        {!padrao && (
          <>
            <Campo rotulo="Ajuste (%)" id="tp_ajuste" name="ajuste_pct" inputMode="decimal" value={ajuste} onChange={(e) => setAjuste(e.target.value)}
              placeholder="0" ajuda="sobre a padrão; -10 = 10% abaixo" />
            <Marcar rotulo="Ativa" ajuda="Inativa não aparece nas vendas; clientes ligados a ela usam a padrão." name="ativa" defaultChecked={tabela?.ativa ?? true} />
          </>
        )}
      </SecaoForm>

      <SecaoForm titulo={padrao ? "Preço de venda" : "Preço nesta tabela"}>
        {!padrao && <p className="-mt-1 text-xs text-texto-suave">Deixe em branco para usar o da padrão{pct ? " com o ajuste" : ""}.</p>}
        {produtos.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhum produto ativo. Cadastre em Produtos e insumos.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-linha">
            {produtos.map((p, i) => {
              const daPadrao = base[p.id];
              const sugerido = daPadrao === undefined ? undefined : aplicarAjuste(daPadrao, pct);
              const secao = (i === 0 || (p.tipo === "peixe") !== (produtos[i - 1].tipo === "peixe")) && (p.tipo === "peixe" ? "Pescado" : "Outros produtos");
              return [
                secao && <li key={`s-${secao}`} className="pt-2 pb-1 text-xs font-medium text-texto-suave">{secao}</li>,
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <input type="hidden" name="produtos" value={p.id} />
                  <label htmlFor={`tp_${p.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.nome}</span>
                    <span className="block text-xs text-texto-suave">
                      {[
                        p.tipo !== "peixe" && (TIPOS_PRODUTO_TODOS[p.tipo] ?? p.tipo),
                        p.unidade,
                        !padrao && (sugerido === undefined ? "sem preço na padrão" : `padrão${pct ? " com ajuste" : ""} ${formatarMoeda(sugerido)}`),
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </label>
                  <input id={`tp_${p.id}`} name={`preco_${p.id}`} inputMode="decimal" defaultValue={paraCampo(tabela?.precos[p.id])}
                    placeholder={padrao ? "0,00" : paraCampo(sugerido) || "0,00"} aria-label={`Preço de ${p.nome}`}
                    className="h-9 w-28 rounded-xl border border-borda bg-superficie px-3 text-right text-sm tabular-nums placeholder:text-texto-suave/70" />
                </li>,
              ];
            })}
          </ul>
        )}
      </SecaoForm>

      <SecaoForm titulo="Outros">
        <AreaTexto rotulo="Observações" id="tp_obs" name="observacoes" defaultValue={tabela?.observacoes ?? ""} className="font-sans" />
      </SecaoForm>
    </FormPainel>
  );
}

export function ListaTabelas({ tabelas, produtos, podeEditar, rodape }: { tabelas: Tabela[]; produtos: ProdutoPreco[]; podeEditar: boolean; rodape?: ReactNode }) {
  const porId = new Map(tabelas.map((t) => [t.id, t]));
  const base = tabelas.find((t) => t.padrao)?.precos ?? {};
  const ativos = new Set(produtos.map((p) => p.id));

  return (
    <ListaCadastro
      colunas={["Tabela", "Regra", "Produtos com preço", "Clientes"]}
      direita={["Produtos com preço", "Clientes"]}
      buscaPlaceholder="Buscar tabela"
      vazio="Nenhuma tabela. Use “Nova tabela” para criar."
      rotuloNovo="Nova tabela"
      novo={podeEditar ? { titulo: "Nova tabela de preço", conteudo: <FormTabela base={base} produtos={produtos} podeEditar /> } : null}
      editar={(id) => {
        const t = porId.get(id);
        return t ? { titulo: t.nome, conteudo: <FormTabela tabela={t} base={base} produtos={produtos} podeEditar={podeEditar} /> } : null;
      }}
      rodape={rodape}
      linhas={tabelas.map((t) => {
        const comPreco = Object.keys(t.precos).filter((p) => ativos.has(p)).length;
        return {
          id: t.id,
          busca: [t.nome, t.observacoes].filter(Boolean).join(" "),
          ordem: [t.nome, null, comPreco, t.padrao ? null : t.clientes],
          inativa: !t.ativa,
          celulas: [
            <span key="n" className="flex flex-col">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-texto">{t.nome}</span>
                {t.padrao && <Etiqueta tom="info">Padrão</Etiqueta>}
                {!t.ativa && <Etiqueta>Inativa</Etiqueta>}
              </span>
              {t.observacoes && <span className="truncate text-xs text-texto-suave">{t.observacoes}</span>}
            </span>,
            regra(t),
            t.padrao && comPreco < produtos.length
              ? <span key="p" className="text-alerta" title="Produtos sem preço na padrão não têm preço na venda">{comPreco} de {produtos.length}</span>
              : `${comPreco}`,
            t.padrao ? <span key="c" className="text-texto-suave">todos</span> : `${t.clientes}`,
          ],
        };
      })}
    />
  );
}
