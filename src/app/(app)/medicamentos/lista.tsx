"use client";

import { useState } from "react";
import { AbasFiltro, FormPainel, ListaCadastro, Marcar, SecaoForm } from "@/components/cadastro";
import { AreaTexto, Campo, Etiqueta, Selecao } from "@/components/ui";
import { formatarNumero } from "@/lib/formato";
import { TIPOS_MEDICAMENTO, UNIDADES_DOSE, VIAS_MEDICAMENTO } from "@/lib/rotulos";
import { excluirMedicamento, salvarMedicamento } from "./actions";

export type Medicamento = {
  id: string;
  nome: string;
  tipo: string;
  principio_ativo: string | null;
  dose_por_unidade: number | null;
  unidade_dose: string;
  via: string;
  carencia_dias: number;
  produto_id: string | null;
  dose_por_unidade_estoque: number | null;
  observacoes: string | null;
  ativo: boolean;
};

type Produto = { id: string; nome: string; unidade: string; tipo: string };

// Base da dose pela via (como no banco): na ração, por kg de ração; em banho ou na água do viveiro, por m³ de água.
function baseDaDose(via: string) {
  return via === "racao" ? "kg de ração" : via === "banho" || via === "agua" ? "m³ de água" : null;
}
type Filtro = "todos" | "medicamento" | "vitamina" | "vacina" | "outro";

// mesma conversão de app.fator_unidade: quando dá, o banco calcula sozinho
const CONVERTE: Record<string, string[]> = { ml: ["l", "lt", "litro", "litros", "ml"], l: ["l", "lt", "litro", "litros", "ml"], mg: ["mg", "g", "kg"], g: ["mg", "g", "kg"], kg: ["g", "kg"], un: ["un", "und", "unidade", "dose", "doses"] };

function FormMedicamento({ medicamento, produtos, podeEditar }: { medicamento?: Medicamento; produtos: Produto[]; podeEditar: boolean }) {
  const [via, setVia] = useState(medicamento?.via ?? "racao");
  const [unidade, setUnidade] = useState(medicamento?.unidade_dose ?? "g");
  const [produtoId, setProdutoId] = useState(medicamento?.produto_id ?? "");
  const produto = produtos.find((p) => p.id === produtoId);
  const precisaFator = Boolean(produto && !CONVERTE[unidade]?.includes(produto.unidade.trim().toLowerCase()));
  // remédios e vacinas primeiro na lista de produtos
  const ordenados = [...produtos].sort((a, b) => Number(!["medicamento", "vacina"].includes(a.tipo)) - Number(!["medicamento", "vacina"].includes(b.tipo)));

  return (
    <FormPainel acao={salvarMedicamento} excluir={medicamento ? excluirMedicamento : undefined} somenteLeitura={!podeEditar}
      confirmacao={`Excluir ${medicamento?.nome ?? "o medicamento"}? As aplicações já lançadas ficam na Sanidade sem o vínculo.`}>
      {medicamento && <input type="hidden" name="id" value={medicamento.id} />}
      <SecaoForm titulo="Medicamento">
        <Campo rotulo="Nome" id="m_nome" name="nome" defaultValue={medicamento?.nome} placeholder="Ex.: Florfenicol 50%" required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Selecao rotulo="Tipo" id="m_tipo" name="tipo" defaultValue={medicamento?.tipo ?? "medicamento"}>
            {Object.entries(TIPOS_MEDICAMENTO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
          <Selecao rotulo="Como aplica" id="m_via" name="via" value={via} onChange={(e) => setVia(e.target.value)}>
            {Object.entries(VIAS_MEDICAMENTO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
        </div>
        <Campo rotulo="Princípio ativo" id="m_principio" name="principio_ativo" defaultValue={medicamento?.principio_ativo ?? ""} placeholder="Ex.: florfenicol" />
      </SecaoForm>

      <SecaoForm titulo="Dose e carência">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo={baseDaDose(via) ? `Dose por ${baseDaDose(via)}` : "Dose por aplicação"} id="m_dose" name="dose_por_unidade" inputMode="decimal"
            defaultValue={medicamento?.dose_por_unidade != null ? String(medicamento.dose_por_unidade).replace(".", ",") : ""}
            placeholder={via === "racao" ? "Ex.: 2" : "Ex.: 0,5"} ajuda="como está na bula ou na receita do veterinário" />
          <Selecao rotulo="Unidade da dose" id="m_unidade" name="unidade_dose" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            {Object.entries(UNIDADES_DOSE).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
        </div>
        <Campo rotulo="Carência antes da despesca (dias)" id="m_carencia" name="carencia_dias" type="number" min={0} max={365}
          defaultValue={medicamento?.carencia_dias ?? 0} ajuda="contada depois do último dia de tratamento; nesse período o lote não pode ser despescado para venda. 0 se não tem" />
      </SecaoForm>

      <SecaoForm titulo="Estoque">
        <Selecao rotulo="Produto do estoque (opcional)" id="m_produto" name="produto_id" value={produtoId} onChange={(e) => setProdutoId(e.target.value)}
          ajuda="com produto ligado, a aplicação lançada no apontamento dá baixa no estoque">
          <option value="">Sem baixa de estoque</option>
          {ordenados.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.unidade})</option>)}
        </Selecao>
        {precisaFator && produto && (
          <Campo rotulo={`Quantos ${UNIDADES_DOSE[unidade]} há em 1 ${produto.unidade}`} id="m_fator" name="dose_por_unidade_estoque" inputMode="decimal" required
            defaultValue={medicamento?.dose_por_unidade_estoque != null ? String(medicamento.dose_por_unidade_estoque).replace(".", ",") : ""}
            placeholder="Ex.: frasco de 1 L = 1000" />
        )}
      </SecaoForm>

      <SecaoForm titulo="Outros">
        <AreaTexto rotulo="Observações" id="m_obs" name="observacoes" defaultValue={medicamento?.observacoes ?? ""} rows={2} />
        <Marcar rotulo="Ativo" ajuda="Inativo some do apontamento, mas as aplicações antigas continuam na Sanidade." name="ativo" defaultChecked={medicamento?.ativo ?? true} />
      </SecaoForm>
    </FormPainel>
  );
}

export function ListaMedicamentos({ medicamentos, produtos, podeEditar }: { medicamentos: Medicamento[]; produtos: Produto[]; podeEditar: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const porId = new Map(medicamentos.map((m) => [m.id, m]));
  const produtoNome = new Map(produtos.map((p) => [p.id, p.nome]));

  return (
    <ListaCadastro
      colunas={["Nome", "Tipo", "Dose", "Carência", "Estoque"]}
      buscaPlaceholder="Buscar nome ou princípio ativo"
      vazio="Nenhum medicamento cadastrado."
      filtros={<AbasFiltro rotulo="Tipo" valor={filtro} aoMudar={setFiltro}
        opcoes={[{ valor: "todos", nome: <>Todos <span className="tabular-nums opacity-60">{medicamentos.length}</span></> },
          ...Object.entries(TIPOS_MEDICAMENTO).map(([v, n]) => ({ valor: v as Filtro, nome: <>{n} <span className="tabular-nums opacity-60">{medicamentos.filter((m) => m.tipo === v).length}</span></> }))]} />}
      rotuloNovo="Novo medicamento"
      novo={podeEditar ? { titulo: "Novo medicamento", conteudo: <FormMedicamento produtos={produtos} podeEditar /> } : null}
      editar={(id) => {
        const m = porId.get(id);
        return m ? { titulo: m.nome, conteudo: <FormMedicamento medicamento={m} produtos={produtos} podeEditar={podeEditar} /> } : null;
      }}
      linhas={medicamentos.filter((m) => filtro === "todos" || m.tipo === filtro).map((m) => ({
        id: m.id,
        busca: [m.nome, m.principio_ativo].filter(Boolean).join(" "),
        ordem: [m.nome, TIPOS_MEDICAMENTO[m.tipo] ?? m.tipo, m.dose_por_unidade ?? null, m.carencia_dias, m.produto_id ? produtoNome.get(m.produto_id) ?? null : null],
        inativa: !m.ativo,
        celulas: [
          <span key="n" className="flex flex-col">
            <span className="flex flex-wrap items-center gap-1.5"><span className="font-medium text-texto">{m.nome}</span>{!m.ativo && <Etiqueta>Inativo</Etiqueta>}</span>
            {m.principio_ativo && <span className="text-xs text-texto-suave">{m.principio_ativo}</span>}
          </span>,
          TIPOS_MEDICAMENTO[m.tipo] ?? m.tipo,
          m.dose_por_unidade != null
            ? `${formatarNumero(m.dose_por_unidade, 2)} ${UNIDADES_DOSE[m.unidade_dose]}${baseDaDose(m.via) ? ` por ${baseDaDose(m.via)}` : ""} · ${VIAS_MEDICAMENTO[m.via].toLowerCase()}`
            : VIAS_MEDICAMENTO[m.via],
          m.carencia_dias > 0 ? <Etiqueta key="c" tom="alerta">{m.carencia_dias} dias</Etiqueta> : <span key="c" className="text-texto-suave">sem carência</span>,
          m.produto_id ? produtoNome.get(m.produto_id) ?? "produto inativo" : <span key="e" className="text-texto-suave">–</span>,
        ],
      }))}
    />
  );
}
