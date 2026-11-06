"use client";

import { useState, type ReactNode } from "react";
import { PackagePlus } from "lucide-react";
import { SelecaoComNovo } from "@/components/selecao-com-novo";
import { Campo, Selecao } from "@/components/ui";
import { TIPOS_PRODUTO } from "@/lib/estoque";

export type ContatoConciliacao = { id: string; nome: string; produto_estoque_id: string | null };
export type ProdutoEstoque = { id: string; nome: string; unidade: string };

// Campos de "Novo pagamento/recebimento" na conciliação: descrição, fornecedor/cliente (com cadastro rápido
// já preenchido com o nome do extrato) e, no pagamento, a entrada do produto comprado no estoque. O
// fornecedor guarda o produto: na próxima conciliação dele a parte do estoque já vem aberta.
export function CamposNovoLancamento({
  movimentoId, entrada, descricao, contatos, contatoInicial, nomeSugerido, documentoSugerido, produtos, depositos, children,
}: {
  movimentoId: string;
  entrada: boolean;
  descricao: string;
  contatos: ContatoConciliacao[];
  contatoInicial: string;
  nomeSugerido: string;
  documentoSugerido: string | null;
  produtos: ProdutoEstoque[];
  depositos: { id: string; nome: string }[];
  children: ReactNode;
}) {
  const memoria = (id: string) => contatos.find((c) => c.id === id)?.produto_estoque_id ?? "";
  const [contato, setContato] = useState(contatoInicial);
  const [estoque, setEstoque] = useState(Boolean(memoria(contatoInicial)));
  const [produto, setProduto] = useState(memoria(contatoInicial));
  const lembrado = memoria(contato);
  const unidade = produtos.find((p) => p.id === produto)?.unidade;

  function trocarContato(id: string) {
    setContato(id);
    const m = memoria(id);
    if (m) {
      setEstoque(true);
      setProduto(m);
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Descrição" id={`d_${movimentoId}`} name="descricao" defaultValue={descricao} />
        <SelecaoComNovo novo={entrada ? "cliente" : "fornecedor"} rotulo={entrada ? "Cliente" : "Fornecedor"} id={`ct_${movimentoId}`}
          name="contato_id" defaultValue={contatoInicial} aoMudar={trocarContato}
          nomeSugerido={contatoInicial ? undefined : nomeSugerido || undefined} documentoSugerido={documentoSugerido}>
          <option value="">Nenhum</option>
          {contatos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </SelecaoComNovo>
      </div>
      {children}
      {!entrada && (
        <div className={`flex flex-col gap-3 rounded-xl ${estoque ? "border border-borda bg-elevado/40 p-3" : ""}`}>
          {lembrado && (
            <p className="text-xs font-medium text-alerta">Este fornecedor tem produto para lançar no estoque.</p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={estoque} onChange={(e) => setEstoque(e.target.checked)} />
            <PackagePlus size={16} strokeWidth={1.75} aria-hidden /> Tem produto comprado que vai para o estoque
          </label>
          {estoque && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <SelecaoComNovo key={contato} novo="produto" subtipos={TIPOS_PRODUTO} rotulo="Produto"
                  id={`ep_${movimentoId}`} name="estoque_produto_id" required defaultValue={produto} aoMudar={setProduto}>
                  <option value="" disabled>Escolha…</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.unidade})</option>)}
                </SelecaoComNovo>
                <Campo rotulo={unidade ? `Quantidade (${unidade})` : "Quantidade"} id={`eq_${movimentoId}`} name="estoque_quantidade"
                  type="number" inputMode="decimal" min="0" step="any" required />
                <Selecao rotulo="Depósito" id={`ed_${movimentoId}`} name="estoque_deposito_id" defaultValue="">
                  <option value="">Padrão do produto</option>
                  {depositos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </Selecao>
              </div>
              <p className="text-xs text-texto-suave">Entra no estoque com o valor deste pagamento como custo.</p>
              {contato && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="estoque_lembrar" defaultChecked />
                  Lembrar deste produto nas próximas compras deste fornecedor
                </label>
              )}
            </>
          )}
          {!estoque && lembrado && (
            <label className="flex items-center gap-2 text-sm text-texto-suave">
              <input type="checkbox" name="estoque_esquecer" />
              Este fornecedor não tem mais produto para o estoque (esquecer)
            </label>
          )}
        </div>
      )}
    </>
  );
}
