"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { FormPainel, ListaCadastro, SecaoForm } from "@/components/cadastro";
import { OpcoesViveiro, type ViveiroOpcao } from "@/components/opcoes-viveiro";
import { AreaTexto, Botao, Campo, Etiqueta, Selecao } from "@/components/ui";
import { formatarData, formatarInteiro, hojeISO } from "@/lib/formato";
import { desfazerTransferencia, transferirLote } from "../actions";

export type Alocacao = { id: string; viveiro_id: string; qtd_peixes: number; periodo: string; motivo: string; transferencia_id: string | null };
export type Transferencia = { id: string; data: string; viveiro_origem_id: string; peixes_origem: number; observacoes: string | null };
type Atual = { viveiro_id: string; peixes_atuais: number | null };

// daterange do Postgres chega como "[2026-01-01,2026-03-01)" ou "[2026-01-01,)".
function inicio(periodo: string) {
  return periodo.slice(1, 11);
}

function FormTransferir({ loteId, atuais, viveiros, nome, ocupados }: {
  loteId: string; atuais: Atual[]; viveiros: ViveiroOpcao[]; nome: Map<string, string>; ocupados: Map<string, string>;
}) {
  const [origem, setOrigem] = useState(atuais[0]?.viveiro_id ?? "");
  const [linhas, setLinhas] = useState([0]);
  const aqui = new Set(atuais.map((a) => a.viveiro_id));
  const bloqueio = (g: ViveiroOpcao) =>
    g.id === origem ? "origem" : aqui.has(g.id) ? "o lote já está aqui" : ocupados.has(g.id) ? `ocupado: ${ocupados.get(g.id)}` : null;

  return (
    <FormPainel acao={transferirLote} botao="Transferir">
      <input type="hidden" name="lote_id" value={loteId} />
      <SecaoForm titulo="Saída">
        <div className="grid grid-cols-1 gap-3">
          <Selecao rotulo="Viveiro de origem" id="t_origem" name="viveiro_origem_id" value={origem} onChange={(e) => setOrigem(e.target.value)} required>
            {atuais.map((a) => (
              <option key={a.viveiro_id} value={a.viveiro_id}>{nome.get(a.viveiro_id)} ({formatarInteiro(a.peixes_atuais ?? 0)} peixes hoje)</option>
            ))}
          </Selecao>
          <Campo rotulo="Data da transferência" id="t_data" name="data" type="date" max={hojeISO()} defaultValue={hojeISO()} required />
        </div>
      </SecaoForm>
      <SecaoForm titulo="Destino">
        {linhas.map((n, i) => (
          <div key={n} className="grid grid-cols-[minmax(0,1fr)_8rem_auto] items-end gap-2">
            <Selecao rotulo={linhas.length > 1 ? `Viveiro ${i + 1}` : "Viveiro de destino"} id={`t_dest_${n}`} name="destino_viveiro" defaultValue="" required>
              <option value="" disabled>Escolha…</option>
              <OpcoesViveiro viveiros={viveiros} bloqueio={bloqueio} />
            </Selecao>
            <Campo rotulo="Peixes" id={`t_qtd_${n}`} name="destino_qtd" inputMode="numeric" placeholder={i === 0 ? "Todas" : ""} required={i > 0} />
            {linhas.length > 1 ? (
              <button type="button" aria-label="Tirar este destino" onClick={() => setLinhas(linhas.filter((x) => x !== n))}
                className="mb-1 grid size-8 place-items-center rounded-md text-texto-suave hover:bg-elevado hover:text-texto">
                <X size={15} strokeWidth={1.75} aria-hidden />
              </button>
            ) : <span className="w-8" />}
          </div>
        ))}
        <Botao type="button" variante="fantasma" tamanho="sm" className="self-start" onClick={() => setLinhas([...linhas, Math.max(...linhas) + 1])}>
          <Plus size={15} strokeWidth={1.75} aria-hidden /> Dividir em outro viveiro
        </Botao>
        <p className="text-xs text-texto-suave">
          A data é o primeiro dia dos peixes no viveiro novo. Sem quantidade, vão todos os peixes vivos do viveiro de origem. Se a soma dos destinos for menor, o restante continua na origem.
          O lote passa para a fase do viveiro novo (recria: recria; engorda: produção).
        </p>
      </SecaoForm>
      <AreaTexto rotulo="Observações" id="t_obs" name="observacoes" className="font-sans" placeholder="Ex.: pesagem média de 1,2 kg na saída" />
    </FormPainel>
  );
}

function DetalheTransferencia({ t, destinos, sobra, nome, podeEditar }: {
  t: Transferencia; destinos: Alocacao[]; sobra: Alocacao | undefined; nome: Map<string, string>; podeEditar: boolean;
}) {
  return (
    <FormPainel acao={desfazerTransferencia} botao="Desfazer transferência" somenteLeitura={!podeEditar}>
      <input type="hidden" name="id" value={t.id} />
      <SecaoForm titulo="Transferência">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-texto-suave">Data</dt><dd>{formatarData(t.data)}</dd>
          <dt className="text-texto-suave">De</dt><dd>{nome.get(t.viveiro_origem_id)} ({formatarInteiro(t.peixes_origem)} peixes vivos)</dd>
          <dt className="text-texto-suave">Para</dt>
          <dd>{destinos.map((d) => `${nome.get(d.viveiro_id)} (${formatarInteiro(d.qtd_peixes)})`).join(", ")}</dd>
          {sobra && <><dt className="text-texto-suave">Ficaram</dt><dd>{formatarInteiro(sobra.qtd_peixes)} peixes em {nome.get(sobra.viveiro_id)}</dd></>}
          {t.observacoes && <><dt className="text-texto-suave">Observações</dt><dd className="whitespace-pre-line">{t.observacoes}</dd></>}
        </dl>
      </SecaoForm>
      {podeEditar && (
        <p className="text-xs text-texto-suave">
          Desfazer devolve os peixes ao viveiro de origem e a fase anterior. Só a última transferência do lote pode ser desfeita, e só antes de
          apontar nos viveiros novos.
        </p>
      )}
    </FormPainel>
  );
}

export function ViveirosDoLote({ loteId, alocacoes, transferencias, atuais, viveiros, nomes, ocupados, podeEditar }: {
  loteId: string; alocacoes: Alocacao[]; transferencias: Transferencia[]; atuais: Atual[]; viveiros: ViveiroOpcao[];
  nomes: [string, string][]; ocupados: [string, string][]; podeEditar: boolean;
}) {
  const nome = new Map(nomes);
  const ocupadosPor = new Map(ocupados);
  const porTransferencia = new Map<string, Alocacao[]>();
  for (const a of alocacoes) if (a.transferencia_id) porTransferencia.set(a.transferencia_id, [...(porTransferencia.get(a.transferencia_id) ?? []), a]);
  const transferencia = new Map(transferencias.map((t) => [t.id, t]));

  const linhas = [
    ...alocacoes.filter((a) => a.motivo === "povoamento").map((a) => ({
      id: a.id, data: inicio(a.periodo), movimento: <Etiqueta key="m" tom="info">Povoamento</Etiqueta>,
      de: "–", para: nome.get(a.viveiro_id) ?? "–", peixes: a.qtd_peixes, fixa: true,
    })),
    ...transferencias.map((t) => {
      const destinos = (porTransferencia.get(t.id) ?? []).filter((a) => a.motivo === "transferencia");
      return {
        id: t.id, data: t.data, movimento: <Etiqueta key="m" tom="positivo">Transferência</Etiqueta>,
        de: nome.get(t.viveiro_origem_id) ?? "–",
        para: destinos.map((d) => (destinos.length > 1 ? `${nome.get(d.viveiro_id)} (${formatarInteiro(d.qtd_peixes)})` : nome.get(d.viveiro_id))).join(", "),
        peixes: destinos.reduce((s, d) => s + d.qtd_peixes, 0), fixa: false,
      };
    }),
  ].sort((a, b) => a.data.localeCompare(b.data));

  return (
    <ListaCadastro
      colunas={["Data", "Movimento", "De", "Para", "Peixes"]}
      direita={["Peixes"]}
      buscaPlaceholder="Buscar viveiro"
      vazio="Sem movimentos."
      rotuloNovo="Transferir lote"
      novo={podeEditar && atuais.length
        ? { titulo: "Transferir lote", conteudo: <FormTransferir loteId={loteId} atuais={atuais} viveiros={viveiros} nome={nome} ocupados={ocupadosPor} /> }
        : null}
      editar={(id) => {
        const t = transferencia.get(id);
        if (!t) return null;
        const doTr = porTransferencia.get(t.id) ?? [];
        return {
          titulo: `Transferência de ${formatarData(t.data)}`,
          conteudo: <DetalheTransferencia t={t} destinos={doTr.filter((a) => a.motivo === "transferencia")} sobra={doTr.find((a) => a.motivo === "divisao")}
            nome={nome} podeEditar={podeEditar} />,
        };
      }}
      linhas={linhas.map((l) => ({
        id: l.id,
        busca: `${l.de} ${l.para}`,
        fixa: l.fixa,
        celulas: [formatarData(l.data), l.movimento, l.de, l.para, formatarInteiro(l.peixes)],
      }))}
    />
  );
}
