"use client";

import { useActionState } from "react";
import { FormPainel, ListaCadastro, Marcar, SecaoForm } from "@/components/cadastro";
import { AreaTexto, Aviso, Botao, Campo, Etiqueta, Selecao } from "@/components/ui";
import { centavosParaCampo, formatarData, formatarMoeda } from "@/lib/formato";
import { CATEGORIAS } from "@/lib/planejamento";
import type { CustoLinha } from "@/lib/planejamento-dados";
import { excluirCusto, incluirCustosModelo, salvarCusto } from "../actions";

export const FASES_CUSTO: Record<string, string> = { alevinagem: "Alevinagem", recria: "Recria", engorda: "Engorda", ciclo: "Ciclo inteiro" };
export const BASES: Record<string, string> = { peixe: "por peixe", lote: "por lote", mes: "por mês", kg: "por kg despescado" };

const centavos = centavosParaCampo;

function FormCusto({ custo, podeEditar }: { custo?: CustoLinha; podeEditar: boolean }) {
  return (
    <FormPainel acao={salvarCusto} excluir={custo ? excluirCusto : undefined} somenteLeitura={!podeEditar}
      confirmacao={`Excluir ${custo?.descricao ?? "este custo"}?`}>
      {custo && <input type="hidden" name="id" value={custo.id} />}
      <SecaoForm titulo="Custo">
        <Campo rotulo="Descrição" id="c_desc" name="descricao" defaultValue={custo?.descricao} placeholder="Ex.: Alevinos, calcário, energia dos aeradores" required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Selecao rotulo="Categoria" id="c_cat" name="categoria" defaultValue={custo?.categoria ?? "alevino"}>
            {Object.entries(CATEGORIAS).filter(([v]) => v !== "racao").map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
          <Selecao rotulo="Quando incide" id="c_fase" name="fase" defaultValue={custo?.fase ?? "alevinagem"}>
            {Object.entries(FASES_CUSTO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Valor (R$)" id="c_valor" name="valor" inputMode="decimal" defaultValue={custo ? centavos(custo.valor_cents) : ""} placeholder="0,00" required />
          <Selecao rotulo="Base" id="c_base" name="base" defaultValue={custo?.base ?? "peixe"}
            ajuda="Por mês: espalhado pelas semanas da fase. Por kg despescado: sobre o peixe vendido na despesca (só na engorda ou no ciclo inteiro).">
            {Object.entries(BASES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Semana de cultivo" id="c_sem" name="semana" inputMode="numeric" defaultValue={custo?.semana ?? ""}
            ajuda="Opcional, para custo por peixe ou por lote, contada do povoamento. Ex.: calagem na 1ª semana. Vazio = no início da fase." />
          <Campo rotulo="Vale a partir de" id="c_vig" name="vigente_desde" type="date" defaultValue={custo?.vigente_desde ?? ""}
            ajuda="Para um reajuste previsto, cadastre de novo com a mesma descrição e a data nova." />
        </div>
        <Marcar rotulo="Ativo" ajuda="Inativo não entra no estudo." name="ativo" defaultChecked={custo?.ativo ?? true} />
      </SecaoForm>
      <AreaTexto rotulo="Observações" id="c_obs" name="observacoes" defaultValue={custo?.observacoes ?? ""} className="font-sans" />
    </FormPainel>
  );
}

function BotaoModelo() {
  const [estado, enviar, pendente] = useActionState(incluirCustosModelo, {});
  return (
    <form action={enviar} className="flex flex-col items-start gap-2">
      <Botao type="submit" variante="secundario" tamanho="sm" disabled={pendente}>{pendente ? "Incluindo…" : "Começar com itens de exemplo"}</Botao>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
    </form>
  );
}

export function CustosFuturos({ custos, podeEditar }: { custos: CustoLinha[]; podeEditar: boolean }) {
  const porId = new Map(custos.map((c) => [c.id, c]));
  const ordem = ["alevinagem", "recria", "engorda", "ciclo"];
  const ordenados = [...custos].sort((a, b) => ordem.indexOf(a.fase) - ordem.indexOf(b.fase) || a.descricao.localeCompare(b.descricao) || (a.vigente_desde ?? "").localeCompare(b.vigente_desde ?? ""));
  return (
    <div className="flex flex-col gap-3">
      <ListaCadastro
        colunas={["Custo", "Categoria", "Valor", "Semana", "Vale a partir de"]}
        direita={["Valor"]}
        buscaPlaceholder="Buscar custo"
        vazio="Nenhum custo cadastrado. Inclua alevinos, calcário, mão de obra, energia dos aeradores, gelo e caixas para o estudo de viabilidade."
        rotuloNovo="Novo custo"
        novo={podeEditar ? { titulo: "Novo custo futuro", conteudo: <FormCusto podeEditar /> } : null}
        editar={(id) => {
          const c = porId.get(id);
          return c ? { titulo: c.descricao, conteudo: <FormCusto custo={c} podeEditar={podeEditar} /> } : null;
        }}
        linhas={ordenados.map((c) => ({
          id: c.id,
          secao: FASES_CUSTO[c.fase],
          busca: `${c.descricao} ${CATEGORIAS[c.categoria]}`,
          inativa: !c.ativo,
          celulas: [
            <span key="d" className="font-medium text-texto">{c.descricao}</span>,
            <Etiqueta key="c">{CATEGORIAS[c.categoria]}</Etiqueta>,
            <span key="v" className="tabular-nums">{formatarMoeda(c.valor_cents)} {BASES[c.base]}</span>,
            c.semana ? `${c.semana}ª` : <span key="s" className="text-texto-suave">–</span>,
            c.vigente_desde ? formatarData(c.vigente_desde) : <span key="g" className="text-texto-suave">sempre</span>,
          ],
        }))}
      />
      {podeEditar && custos.length === 0 && <BotaoModelo />}
    </div>
  );
}
