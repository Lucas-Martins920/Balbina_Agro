"use client";

import Link from "next/link";
import { useState } from "react";
import { AbasFiltro, FormPainel, ListaCadastro, SecaoForm } from "@/components/cadastro";
import { OpcoesViveiro, type ViveiroOpcao } from "@/components/opcoes-viveiro";
import { AreaTexto, Campo, CLASSE_BOTAO_TEXTO, classeBotao, Etiqueta, Selecao } from "@/components/ui";
import { centavosParaCampo, formatarData, formatarInteiro, formatarNumero, hojeISO } from "@/lib/formato";
import { textoKg, textoPeso } from "@/lib/pescado";
import { FASES } from "@/lib/rotulos";
import { povoarLote, editarLote, excluirLote } from "./actions";

export type Lote = {
  id: string; codigo: string; fase: string; especie_id: string; data_povoamento: string; qtd_povoada: number;
  peso_inicial_g: number | null; peso_alvo_g: number | null; custo_aquisicao_cents: number; fornecedor_id: string | null;
  previsao_despesca: string | null; observacoes: string | null; encerrado_em: string | null;
};
type Local = {
  lote_id: string; lote_codigo: string; viveiro_id: string; viveiro_nome: string; setor_nome: string; peixes_atuais: number | null;
  dias_cultivo: number | null; peso_medio_g: number | null; biomassa_kg: number | null; ultimo_apontamento: string | null;
};
type Opcao = { id: string; nome: string };


// lerCentavos aceita com ou sem milhar; sem custo o campo fica vazio
const campoCusto = (c: number) => (c ? centavosParaCampo(c) : "");
const campoPeso = (g: number | null | undefined) => (g === null || g === undefined ? "" : formatarNumero(g, Number.isInteger(Number(g)) ? 0 : 1));

function CamposLote({ lote, especies, fornecedores }: { lote?: Lote; especies: Opcao[]; fornecedores: Opcao[] }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Código do lote" id="l_codigo" name="codigo" defaultValue={lote?.codigo} placeholder="Ex.: L2026-01" required />
        <Selecao rotulo="Espécie" id="l_especie" name="especie_id" defaultValue={lote?.especie_id ?? ""} required>
          <option value="" disabled>Escolha…</option>
          {especies.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </Selecao>
        <Campo rotulo="Povoamento" id="l_povo" name="data_povoamento" type="date" max={hojeISO()} defaultValue={lote?.data_povoamento ?? hojeISO()} required />
        <Campo rotulo="Quantidade de peixes" id="l_qtd" name="qtd_povoada" inputMode="numeric" defaultValue={lote?.qtd_povoada ?? ""} required />
        <Campo rotulo="Peso médio no povoamento (g)" id="l_peso" name="peso_inicial_g" inputMode="decimal" defaultValue={campoPeso(lote?.peso_inicial_g)}
          placeholder="Ex.: 1,5 (pós-larva) ou 30 (alevino)" required
          ajuda="É o ponto de partida da curva: com ele saem o peso estimado, a biomassa e a ração sugerida até a primeira biometria." />
        <Campo rotulo="Peso de despesca (g)" id="l_alvo" name="peso_alvo_g" inputMode="decimal" defaultValue={campoPeso(lote?.peso_alvo_g)}
          placeholder="Ex.: 2.500" ajuda="Opcional. A previsão mostra quando o lote chega lá." />
        <Campo rotulo="Custo dos alevinos (R$)" id="l_custo" name="custo" inputMode="decimal" defaultValue={campoCusto(lote?.custo_aquisicao_cents ?? 0)} placeholder="0,00" />
      </div>
      <Selecao rotulo="Fornecedor dos alevinos" id="l_forn" name="fornecedor_id" defaultValue={lote?.fornecedor_id ?? ""}>
        <option value="">Não informado</option>
        {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
      </Selecao>
    </>
  );
}

function FormEditar({ lote, especies, fornecedores, podeEditar }: { lote: Lote; especies: Opcao[]; fornecedores: Opcao[]; podeEditar: boolean }) {
  return (
    <FormPainel acao={editarLote} excluir={excluirLote} somenteLeitura={!podeEditar || lote.fase === "encerrado"}
      confirmacao={`Excluir o lote ${lote.codigo}? Lote com apontamentos não pode ser excluído; encerre o lote na página dele.`}>
      <input type="hidden" name="id" value={lote.id} />
      <SecaoForm titulo="Lote">
        <CamposLote lote={lote} especies={especies} fornecedores={fornecedores} />
        <p className="text-xs text-texto-suave">Data de povoamento e quantidade só mudam enquanto o lote não foi transferido de viveiro.</p>
        {lote.fase === "encerrado" && <p className="text-xs text-texto-suave">Lote encerrado em {formatarData(lote.encerrado_em)}. Para mudar algo, reabra o lote na página dele.</p>}
        <Link href={`/lotes/${lote.id}#viveiros`} className={classeBotao("secundario", "sm")}>Transferir de viveiro (alevinagem, recria, engorda)</Link>
      </SecaoForm>
      <SecaoForm titulo="Ciclo">
        <div className="grid gap-3 sm:grid-cols-2">
          <Selecao rotulo="Fase" id="l_fase" name="fase" defaultValue={lote.fase === "encerrado" ? "engorda" : lote.fase}
            ajuda="Muda sozinha na transferência de viveiro; corrija aqui se precisar.">
            {Object.entries(FASES).filter(([v]) => v !== "encerrado").map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
          <Campo rotulo="Previsão de despesca" id="l_desc" name="previsao_despesca" type="date" defaultValue={lote.previsao_despesca ?? ""} />
        </div>
        <AreaTexto rotulo="Observações" id="l_obs" name="observacoes" defaultValue={lote.observacoes ?? ""} className="font-sans" />
      </SecaoForm>
      <Link href={`/lotes/${lote.id}`} className={classeBotao("secundario", "sm")}>Ver desempenho, biometrias e despescas</Link>
    </FormPainel>
  );
}

function FormPovoar({ especies, viveiros, fornecedores, ocupados }: {
  especies: Opcao[]; viveiros: ViveiroOpcao[]; fornecedores: Opcao[]; ocupados: Map<string, string>;
}) {
  return (
    <FormPainel acao={povoarLote} botao="Povoar lote">
      <SecaoForm titulo="Onde">
        <Selecao rotulo="Viveiro" id="l_viveiro" name="viveiro_id" defaultValue="" required
          ajuda="Pós-larvas e alevinos vão para a alevinagem; juvenis, para a recria ou direto para a engorda. O lote entra na fase do viveiro.">
          <option value="" disabled>Escolha…</option>
          <OpcoesViveiro viveiros={viveiros} bloqueio={(g) => (ocupados.has(g.id) ? `ocupado: ${ocupados.get(g.id)}` : null)} />
        </Selecao>
      </SecaoForm>
      <SecaoForm titulo="Lote">
        <CamposLote especies={especies} fornecedores={fornecedores} />
      </SecaoForm>
    </FormPainel>
  );
}

export function CadastroLotes({ lotes, locais, especies, viveiros, fornecedores, podeEditar }: {
  lotes: Lote[]; locais: Local[]; especies: Opcao[]; viveiros: ViveiroOpcao[]; fornecedores: Opcao[]; podeEditar: boolean;
}) {
  const [filtro, setFiltro] = useState<"ativos" | "encerrados" | "todos">("ativos");
  const porId = new Map(lotes.map((l) => [l.id, l]));
  const especie = new Map(especies.map((l) => [l.id, l.nome]));
  const onde = new Map<string, Local[]>();
  for (const a of locais) onde.set(a.lote_id, [...(onde.get(a.lote_id) ?? []), a]);
  const ocupados = new Map(locais.map((a) => [a.viveiro_id, a.lote_codigo]));
  const visiveis = lotes.filter((l) => filtro === "todos" || (filtro === "encerrados") === (l.fase === "encerrado"));

  return (
    <ListaCadastro
      colunas={["Lote", "Espécie", "Fase", "Viveiro", "Cultivo", "Peixes hoje", "Peso médio", "Biomassa", "Último apontamento"]}
      direita={["Cultivo", "Peixes hoje", "Peso médio", "Biomassa"]}
      buscaPlaceholder="Buscar lote, espécie ou viveiro"
      vazio={viveiros.length ? "Nenhum lote neste filtro." : "Cadastre um viveiro em Piscicultura antes de povoar lotes."}
      filtros={<AbasFiltro rotulo="Situação" valor={filtro} aoMudar={setFiltro}
        opcoes={[
          { valor: "ativos", nome: <>Povoados <span className="tabular-nums opacity-60">{lotes.filter((l) => l.fase !== "encerrado").length}</span></> },
          { valor: "encerrados", nome: <>Encerrados <span className="tabular-nums opacity-60">{lotes.filter((l) => l.fase === "encerrado").length}</span></> },
          { valor: "todos", nome: <>Todos <span className="tabular-nums opacity-60">{lotes.length}</span></> },
        ]} />}
      rotuloNovo="Povoar lote"
      novo={podeEditar && viveiros.length ? { titulo: "Povoar lote", conteudo: <FormPovoar especies={especies} viveiros={viveiros} fornecedores={fornecedores} ocupados={ocupados} /> } : null}
      editar={(id) => {
        const l = porId.get(id);
        return l ? { titulo: `Lote ${l.codigo}`, conteudo: <FormEditar lote={l} especies={especies} fornecedores={fornecedores} podeEditar={podeEditar} /> } : null;
      }}
      linhas={visiveis.map((l) => {
        const aqui = onde.get(l.id) ?? [];
        const peixes = aqui.reduce((s, a) => s + (a.peixes_atuais ?? 0), 0);
        const biomassa = aqui.reduce((s, a) => s + Number(a.biomassa_kg ?? 0), 0);
        const peso = peixes > 0 ? (biomassa * 1000) / peixes : null;
        const viveiro = aqui.map((a) => `${a.setor_nome} / ${a.viveiro_nome}`).join(", ");
        return {
          id: l.id,
          busca: [l.codigo, especie.get(l.especie_id), viveiro, FASES[l.fase]].filter(Boolean).join(" "),
          ordem: [l.codigo, especie.get(l.especie_id) ?? null, FASES[l.fase] ?? l.fase, viveiro || null, aqui[0]?.dias_cultivo ?? null, aqui.length ? peixes : null,
            peso, aqui.length ? biomassa : null, aqui.map((a) => a.ultimo_apontamento).filter(Boolean).sort().at(-1) ?? null],
          inativa: l.fase === "encerrado",
          celulas: [
            <Link key="c" href={`/lotes/${l.id}`} onClick={(e) => e.stopPropagation()} className={CLASSE_BOTAO_TEXTO}>{l.codigo}</Link>,
            especie.get(l.especie_id)?.replace(" (sua)", "") ?? "–",
            <Etiqueta key="f" tom={l.fase === "engorda" ? "positivo" : l.fase === "encerrado" ? "neutro" : "info"}>{FASES[l.fase] ?? l.fase}</Etiqueta>,
            viveiro || <span key="g" className="text-texto-suave">–</span>,
            aqui[0]?.dias_cultivo !== null && aqui[0]?.dias_cultivo !== undefined ? `${aqui[0].dias_cultivo} dias` : "–",
            aqui.length ? formatarInteiro(peixes) : "–",
            peso === null ? "–" : textoPeso(peso),
            aqui.length ? textoKg(biomassa, 0) : "–",
            formatarData(aqui.map((a) => a.ultimo_apontamento).filter(Boolean).sort().at(-1) ?? null),
          ],
        };
      })}
    />
  );
}
