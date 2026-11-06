"use client";

import { useActionState } from "react";
import type { EstadoAcao } from "@/lib/acao";
import { Campo, classeBotao, Selecao } from "@/components/ui";
import { DialogoAcao } from "@/components/dialogo-acao";
import { TURNOS } from "@/lib/rotulos";
import { CAMPOS_AGUA, type Agua } from "@/lib/agua";
import { CAUSAS_MORTE } from "@/lib/causas-morte";

type Acao = (estado: EstadoAcao, form: FormData) => Promise<EstadoAcao>;

type DadosLancamento = {
  id: string;
  turno: string;
  mortes: number;
  descartes: number;
  racao_kg: number;
  observacoes: string | null;
  causas_morte: Record<string, number> | null;
  racoes: { produto_id: string; kg: number; nome: string }[];
  checklist: { item_id: string; ok: boolean | null; valor: number | null; nome: string; tipo: string; unidade: string | null }[];
  agua: Agua;
  racoesDisponiveis: { id: string; nome: string }[];
};

export function EditarLancamento({ acao, dados }: { acao: Acao; dados: DadosLancamento }) {
  const [estado, enviar, editando] = useActionState<EstadoAcao, FormData>(acao, {});
  const causas = dados.causas_morte ?? {};

  return (
    <DialogoAcao rotulo="editar" titulo="Editar lançamento">
      <form action={enviar} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={dados.id} />
        <p className="text-xs font-medium text-texto-suave">Editar lançamento (data e viveiro não mudam)</p>

        <Selecao rotulo="Turno" id={`ed_turno_${dados.id}`} name="turno" defaultValue={dados.turno} required>
          {Object.entries(TURNOS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </Selecao>

        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Mortes" id={`ed_mort_${dados.id}`} name="mortes" inputMode="numeric"
            defaultValue={String(dados.mortes)} required />
          <Campo rotulo="Descartes" id={`ed_elim_${dados.id}`} name="descartes" inputMode="numeric"
            defaultValue={String(dados.descartes)} required />
        </div>

        {dados.racoesDisponiveis.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Ração</legend>
            {dados.racoes.length > 0 ? dados.racoes.map((r, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr] gap-2">
                <Selecao rotulo="" id={`ed_rprod_${dados.id}_${i}`} name={`racao_produto_${i}`} defaultValue={r.produto_id}>
                  <option value="">—</option>
                  {dados.racoesDisponiveis.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </Selecao>
                <Campo rotulo="" id={`ed_rkg_${dados.id}_${i}`} name={`racao_kg_${i}`} inputMode="decimal"
                  defaultValue={String(r.kg)} />
              </div>
            )) : (
              <div className="grid grid-cols-[2fr_1fr] gap-2">
                <Selecao rotulo="" id={`ed_rprod_${dados.id}_0`} name="racao_produto_0" defaultValue="">
                  <option value="">—</option>
                  {dados.racoesDisponiveis.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </Selecao>
                <Campo rotulo="" id={`ed_rkg_${dados.id}_0`} name="racao_kg_0" inputMode="decimal" placeholder="kg" />
              </div>
            )}
          </fieldset>
        ) : (
          <Campo rotulo="Ração (kg)" id={`ed_rkg_${dados.id}`} name="racao_kg" inputMode="decimal"
            defaultValue={String(dados.racao_kg)} required />
        )}

        {dados.checklist.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Checklist</legend>
            {dados.checklist.map((c) => c.tipo === "numero" ? (
              <Campo key={c.item_id} rotulo={`${c.nome}${c.unidade ? ` (${c.unidade})` : ""}`}
                id={`ed_ck_${dados.id}_${c.item_id}`} name={`ck_${c.item_id}`} inputMode="decimal"
                defaultValue={c.valor != null ? String(c.valor) : ""} />
            ) : (
              <div key={c.item_id} className="flex items-center justify-between gap-3 text-sm">
                <span>{c.nome}</span>
                <span className="flex gap-3">
                  <label className="flex items-center gap-1">
                    <input type="radio" name={`ck_${c.item_id}`} value="ok" defaultChecked={c.ok === true} required /> ok
                  </label>
                  <label className="flex items-center gap-1 text-perigo">
                    <input type="radio" name={`ck_${c.item_id}`} value="nao" defaultChecked={c.ok === false} /> não
                  </label>
                </span>
              </div>
            ))}
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Qualidade da água</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CAMPOS_AGUA.map((c) => (
              <Campo key={c.chave} rotulo={`${c.curto}${c.unidade ? ` (${c.unidade})` : ""}`} id={`ed_agua_${dados.id}_${c.chave}`} name={`agua_${c.chave}`}
                inputMode="decimal" defaultValue={dados.agua[c.chave] !== undefined ? String(dados.agua[c.chave]).replace(".", ",") : ""} />
            ))}
          </div>
        </fieldset>

        <details className="text-xs">
          <summary className="cursor-pointer font-medium">Causas das baixas</summary>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {CAUSAS_MORTE.map((c) => (
              <Campo key={c.chave} rotulo={c.nome} id={`ed_causa_${dados.id}_${c.chave}`} name={`causa_${c.chave}`}
                inputMode="numeric" defaultValue={String(causas[c.chave] ?? 0)} />
            ))}
          </div>
        </details>

        <Campo rotulo="Observações" id={`ed_obs_${dados.id}`} name="observacoes" defaultValue={dados.observacoes ?? ""} />

        <button type="submit" disabled={editando} className={classeBotao("primario", "sm")}>
          {editando ? "Salvando…" : "Salvar edição"}
        </button>
        {estado.erro && <span role="alert" className="text-xs text-perigo">{estado.erro}</span>}
        {estado.ok && <span role="status" className="text-xs text-positivo">{estado.ok}</span>}
      </form>
    </DialogoAcao>
  );
}
