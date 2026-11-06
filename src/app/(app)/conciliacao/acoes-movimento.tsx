"use client";

import { useState, useTransition } from "react";
import { CodigoMfa } from "@/components/codigo-mfa";
import { Aviso, Botao, Campo, Selecao } from "@/components/ui";
import type { EstadoAcao } from "@/lib/acao";
import { apagarConciliacao, apagarDoExtrato, desconciliar } from "./actions";

const MOTIVOS = ["Conciliado com o lançamento errado", "Valor, data ou categoria errados", "Lançamento duplicado", "Outro"];

type Modo = "fechado" | "desconciliar" | "apagar" | "codigo";
type Vinculo = { tipo: "titulo" | "transferencia" | "ignorado"; descricao: string; criadoAqui: boolean; importado: boolean };

function Motivo({ id, valor, aoMudar }: { id: string; valor: string; aoMudar: (v: string) => void }) {
  const [escolha, setEscolha] = useState(MOTIVOS[0]);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Selecao rotulo="Motivo" id={`${id}_m`} value={escolha}
        onChange={(e) => { setEscolha(e.target.value); aoMudar(e.target.value === "Outro" ? "" : e.target.value); }}>
        {MOTIVOS.map((m) => <option key={m}>{m}</option>)}
      </Selecao>
      {escolha === "Outro" && <Campo rotulo="Qual?" id={`${id}_o`} value={valor} onChange={(e) => aoMudar(e.target.value)} autoFocus required />}
    </div>
  );
}

// Ações de um lançamento do extrato já conciliado (ou ignorado) e, para o master, apagar.
// Pendente: só "Apagar do extrato" (master).
export function AcoesMovimento({ movimentoId, vinculo, master, temAutenticador }: {
  movimentoId: string; vinculo: Vinculo | null; master: boolean; temAutenticador: boolean;
}) {
  const [modo, setModo] = useState<Modo>("fechado");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [manter, setManter] = useState(false);
  const [alvo, setAlvo] = useState<"conciliacao" | "extrato">(vinculo && vinculo.tipo !== "ignorado" ? "conciliacao" : "extrato");
  const [estado, setEstado] = useState<EstadoAcao>({});
  const [pendente, iniciar] = useTransition();

  const rodar = (fn: () => Promise<EstadoAcao>) => iniciar(async () => {
    const r = await fn();
    setEstado(r);
    if (!r.erro) setModo("fechado");
  });
  const abrir = (m: Modo) => { setEstado({}); setMotivo(MOTIVOS[0]); setModo(m); };

  if (modo === "fechado") {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-2">
          {vinculo && <Botao type="button" variante="secundario" tamanho="sm" onClick={() => abrir("desconciliar")}>{vinculo.tipo === "ignorado" ? "Voltar para conciliar" : "Desconciliar"}</Botao>}
          {master && <Botao type="button" variante="fantasma" tamanho="sm" className="text-perigo" onClick={() => abrir("apagar")}>Apagar</Botao>}
        </div>
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        {estado.ok && <Aviso tipo="info">{estado.ok}</Aviso>}
      </div>
    );
  }

  const cancelar = <Botao type="button" variante="fantasma" tamanho="sm" onClick={() => setModo("fechado")}>Cancelar</Botao>;
  const semMotivo = motivo.trim().length < 3;

  if (modo === "desconciliar" && vinculo) {
    return (
      <div className="flex w-full flex-col gap-3 rounded-xl border border-borda bg-elevado/50 p-3 text-sm">
        <p className="font-medium">{vinculo.tipo === "ignorado" ? "Voltar este lançamento para conciliar?" : "Desconciliar este lançamento?"}</p>
        <ul className="list-disc pl-5 text-texto-suave">
          <li>O lançamento volta para “Para conciliar”.</li>
          {vinculo.tipo === "titulo" && !vinculo.importado && !vinculo.criadoAqui && <li>O pagamento de “{vinculo.descricao}” é desfeito e o título volta a ficar em aberto.</li>}
          {vinculo.tipo === "titulo" && vinculo.importado && <li>O pagamento de “{vinculo.descricao}” veio da importação e continua lá; só o vínculo com o extrato sai.</li>}
          {vinculo.tipo === "titulo" && vinculo.criadoAqui && <li>“{vinculo.descricao}” foi criado nesta conciliação: {manter ? "fica em aberto, sem pagamento" : "é cancelado"}.</li>}
          {vinculo.tipo === "transferencia" && <li>A transferência sai se a outra conta não estiver conciliada nela.</li>}
          <li>Fica registrado no Histórico, com o motivo. Mês fechado não deixa desconciliar.</li>
        </ul>
        <Motivo id={`d_${movimentoId}`} valor={motivo} aoMudar={setMotivo} />
        {vinculo.criadoAqui && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={manter} onChange={(e) => setManter(e.target.checked)} />
            Manter “{vinculo.descricao}” como conta em aberto
          </label>
        )}
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Botao type="button" tamanho="sm" disabled={pendente || semMotivo} onClick={() => rodar(() => desconciliar(movimentoId, motivo, manter))}>
            {pendente ? "Desconciliando…" : "Confirmar"}
          </Botao>
          {cancelar}
        </div>
      </div>
    );
  }

  if (modo === "apagar") {
    const conciliado = vinculo && vinculo.tipo !== "ignorado";
    return (
      <div className="flex w-full flex-col gap-3 rounded-xl border border-perigo/40 bg-elevado/50 p-3 text-sm">
        <p className="font-medium">Apagar, sem volta</p>
        {conciliado && (
          <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-2">
              <input type="radio" name={`alvo_${movimentoId}`} checked={alvo === "conciliacao"} onChange={() => setAlvo("conciliacao")} className="mt-1" />
              <span>Só a conciliação: apaga o pagamento ou a transferência ligados{vinculo.criadoAqui ? " e o título criado nela" : ""}, mesmo os importados. O lançamento volta para conciliar.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name={`alvo_${movimentoId}`} checked={alvo === "extrato"} onChange={() => setAlvo("extrato")} className="mt-1" />
              <span>O lançamento do extrato inteiro, com a conciliação.</span>
            </label>
          </div>
        )}
        {alvo === "extrato" && <p className="text-texto-suave">O lançamento some do extrato e não volta na próxima leitura do banco nem reimportando o mesmo arquivo.</p>}
        <Motivo id={`a_${movimentoId}`} valor={motivo} aoMudar={setMotivo} />
        {!temAutenticador && <Aviso>Para apagar, ative o app autenticador em Minha conta.</Aviso>}
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Botao type="button" variante="perigo" tamanho="sm" disabled={semMotivo || !temAutenticador} onClick={() => setModo("codigo")}>Continuar</Botao>
          {cancelar}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-perigo/40 bg-elevado/50 p-3 text-sm">
      <p>Último passo: o código do app autenticador. Ao confirmar, {alvo === "extrato" ? "o lançamento é apagado" : "a conciliação é apagada"} na hora.</p>
      <CodigoMfa botao={pendente ? "Apagando…" : "Apagar agora"}
        aoConfirmar={() => rodar(() => (alvo === "extrato" ? apagarDoExtrato(movimentoId, motivo) : apagarConciliacao(movimentoId, motivo)))} />
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {cancelar}
    </div>
  );
}
