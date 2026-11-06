"use client";

import { useState, useTransition } from "react";
import { Aviso, Botao, Campo, Selecao } from "@/components/ui";
import type { EstadoAcao } from "@/lib/acao";
import { formatarData } from "@/lib/formato";
import { cancelarImportacao } from "./actions";

export type Importacao = {
  id: string; origem: string; arquivo_path: string | null; periodo_inicio: string | null; periodo_fim: string | null;
  total_linhas: number; linhas_novas: number; linhas_repetidas: number; created_at: string;
  cancelada_em: string | null; motivo_cancelamento: string | null;
};

const MOTIVOS = ["Arquivo de outra conta", "Arquivo do período errado", "Arquivo errado", "Outro"];
const ORIGENS: Record<string, string> = { ofx: "OFX", planilha: "Planilha", pdf_ia: "PDF", nibo: "NIBO", cnab_retorno: "Retorno do banco" };

function quando(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

// "Cancelar importação": tira do extrato o que o arquivo trouxe e ainda está para conciliar.
// O que já foi conciliado ou ignorado fica; ler o OFX de novo traz de volta o que saiu.
function Cancelar({ importacao }: { importacao: Importacao }) {
  const [aberto, setAberto] = useState(false);
  const [escolha, setEscolha] = useState(MOTIVOS[0]);
  const [outro, setOutro] = useState("");
  const [estado, setEstado] = useState<EstadoAcao>({});
  const [pendente, iniciar] = useTransition();
  const motivo = escolha === "Outro" ? outro : escolha;
  const id = importacao.id;

  if (!aberto) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Botao type="button" variante="fantasma" tamanho="sm" className="text-perigo" onClick={() => { setEstado({}); setAberto(true); }}>
          Cancelar importação
        </Botao>
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-perigo/40 bg-elevado/50 p-3 text-sm">
      <p className="font-medium">Cancelar a importação de {importacao.arquivo_path ?? "este arquivo"}?</p>
      <ul className="list-disc pl-5 text-texto-suave">
        <li>Os lançamentos deste arquivo que ainda estão para conciliar saem do extrato.</li>
        <li>O que já foi feito fica: lançamentos conciliados ou ignorados continuam, com os pagamentos e títulos.</li>
        <li>Se precisar, é só ler o OFX de novo. Fica registrado no Histórico, com o motivo.</li>
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        <Selecao rotulo="Motivo" id={`ci_${id}_m`} value={escolha} onChange={(e) => setEscolha(e.target.value)}>
          {MOTIVOS.map((m) => <option key={m}>{m}</option>)}
        </Selecao>
        {escolha === "Outro" && <Campo rotulo="Qual?" id={`ci_${id}_o`} value={outro} onChange={(e) => setOutro(e.target.value)} autoFocus required />}
      </div>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Botao type="button" variante="perigo" tamanho="sm" disabled={pendente || motivo.trim().length < 3}
          onClick={() => iniciar(async () => {
            const r = await cancelarImportacao(id, motivo);
            setEstado(r);
            if (!r.erro) setAberto(false);
          })}>
          {pendente ? "Cancelando…" : "Cancelar importação"}
        </Botao>
        <Botao type="button" variante="fantasma" tamanho="sm" onClick={() => setAberto(false)}>Voltar</Botao>
      </div>
    </div>
  );
}

// Arquivos importados nesta conta (os mais recentes), com o que entrou e o que foi pulado por já existir.
export function Importacoes({ lista, podeCancelar }: { lista: Importacao[]; podeCancelar: boolean }) {
  return (
    <ul className="divide-y divide-borda text-sm">
      {lista.map((i) => {
        const jaEstavam = i.total_linhas - i.linhas_novas - i.linhas_repetidas;
        return (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="font-medium">{i.arquivo_path ?? ORIGENS[i.origem] ?? i.origem}</span>
              <span className="text-texto-suave"> · {quando(i.created_at)}</span>
              <span className="block text-xs text-texto-suave">
                {i.periodo_inicio && i.periodo_fim ? `${formatarData(i.periodo_inicio)} a ${formatarData(i.periodo_fim)} · ` : ""}
                {i.linhas_novas} novo(s)
                {jaEstavam > 0 && ` · ${jaEstavam} já importado(s)`}
                {i.linhas_repetidas > 0 && ` · ${i.linhas_repetidas} repetido(s) pulado(s)`}
              </span>
              {i.cancelada_em && (
                <span className="block text-xs text-perigo">Cancelada em {quando(i.cancelada_em)}{i.motivo_cancelamento ? `: ${i.motivo_cancelamento}` : ""}</span>
              )}
            </span>
            {!i.cancelada_em && podeCancelar && <Cancelar importacao={i} />}
          </li>
        );
      })}
    </ul>
  );
}
