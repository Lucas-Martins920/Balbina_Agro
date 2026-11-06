"use client";

import { useActionState, useState } from "react";
import type { EstadoAcao } from "@/lib/acao";
import { Aviso, Botao } from "@/components/ui";
import { formatarData, formatarMoeda } from "@/lib/formato";

type Sugestao = { agendamento_id: string; descricao: string; contato_nome: string | null; vencimento: string; saldo_cents: number; pontos: number };

type Props = {
  movimentoId: string;
  valorCents: number;
  entrada: boolean;
  sugestoes: Sugestao[];
  certeira: string | null;
  acaoConciliar: (estado: EstadoAcao, form: FormData) => Promise<EstadoAcao>;
  acaoMultipla: (estado: EstadoAcao, form: FormData) => Promise<EstadoAcao>;
};

export function SugestoesMultipla({ movimentoId, valorCents, entrada, sugestoes, certeira, acaoConciliar, acaoMultipla }: Props) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [estadoUnico, enviarUnico, pendenteUnico] = useActionState(acaoConciliar, {});
  const [estadoMulti, enviarMulti, pendenteMulti] = useActionState(acaoMultipla, {});

  const somaSelecao = sugestoes.filter((s) => selecionados.has(s.agendamento_id)).reduce((acc, s) => acc + Number(s.saldo_cents), 0);
  const valorAbs = Math.abs(valorCents);
  const pendente = pendenteUnico || pendenteMulti;
  const estado = estadoMulti.versao ? estadoMulti : estadoUnico;

  function alternar(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {sugestoes.length > 1 && (
        <p className="text-xs text-texto-suave">
          Marque vários títulos para conciliar de uma vez (múltipla). Ou concilie um a um como sempre.
        </p>
      )}
      {sugestoes.map((s, i) => (
        <div key={s.agendamento_id} className={`flex flex-wrap items-center gap-3 rounded-md px-3 py-2 text-sm ${i === 0 && !selecionados.size ? "border border-marca/40 bg-marca-suave/60" : selecionados.has(s.agendamento_id) ? "border border-marca/40 bg-marca-suave/60" : "bg-elevado/60"}`}>
          {sugestoes.length > 1 && (
            <input type="checkbox" checked={selecionados.has(s.agendamento_id)} onChange={() => alternar(s.agendamento_id)}
              className="accent-marca" aria-label={`Selecionar ${s.descricao}`} />
          )}
          <span className="min-w-0 flex-1">
            {i === 0 && certeira && <span className="mb-0.5 block text-xs font-semibold text-alerta">Certeira</span>}
            <span className="font-medium">{s.descricao}</span>{s.contato_nome && <span className="text-texto-suave"> · {s.contato_nome}</span>}
            <span className="block text-xs text-texto-suave">
              {entrada ? "A receber" : "A pagar"} · vence {formatarData(s.vencimento)} · {formatarMoeda(s.saldo_cents)}
              {Number(s.saldo_cents) !== valorAbs && (Number(s.saldo_cents) > valorAbs ? " · fica baixa parcial" : " · diferença vira juros")}
            </span>
          </span>
          {!selecionados.size && (
            <form action={enviarUnico}>
              <input type="hidden" name="movimento_id" value={movimentoId} />
              <input type="hidden" name="agendamento_id" value={s.agendamento_id} />
              <input type="hidden" name="modo" value="sugestao" />
              <Botao type="submit" disabled={pendente} variante={i === 0 ? "primario" : "secundario"} className="text-xs whitespace-nowrap">
                {i === 0 ? "Conciliar" : "Escolher esta"}
              </Botao>
            </form>
          )}
        </div>
      ))}
      {selecionados.size > 0 && (
        <form action={enviarMulti} className="flex flex-col gap-2">
          <input type="hidden" name="movimento_id" value={movimentoId} />
          {[...selecionados].map((id) => <input key={id} type="hidden" name="agendamento_ids" value={id} />)}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-texto-suave">
              {selecionados.size} {selecionados.size === 1 ? "título" : "títulos"} · {formatarMoeda(somaSelecao)} de {formatarMoeda(valorAbs)}
              {somaSelecao < valorAbs && " · fica parcial"}
              {somaSelecao > valorAbs && " · excede o valor"}
            </span>
            <Botao type="submit" disabled={pendente || somaSelecao === 0} variante="primario" className="text-xs whitespace-nowrap">
              Conciliar {selecionados.size === 1 ? "título" : `${selecionados.size} títulos`}
            </Botao>
          </div>
        </form>
      )}
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.ok && <Aviso tipo="info">{estado.ok}</Aviso>}
    </div>
  );
}
