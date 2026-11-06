"use client";

import { CheckCheck, CircleAlert, Clock, CloudUpload, Fish, FlaskConical, LogIn, Scale, Shovel, Wheat, WifiOff, type LucideIcon } from "lucide-react";
import { AvisosPush } from "@/components/avisos-push";
import type { Existente, ItemFila, TipoEnvio } from "@/lib/campo/fila";
import { resumoFila } from "@/lib/campo/fila";
import { useCampo } from "./contexto";
import { AvisoCampo, BotaoGrande, BotaoPilula, fmt, quando, Subtitulo, useDoisToques } from "./pecas";

const ICONES: Record<TipoEnvio, LucideIcon> = { apontamento: Wheat, biometria: Scale, insumo: FlaskConical, abrir_lote: Fish, fechar_lote: Shovel };
const ORIGEM: Record<string, string> = { app: "celular", web: "computador" };

const semEstoque = (i: ItemFila) => /saldo insuficiente|estoque/i.test(i.erro ?? "");

function textoExistente(e: Existente, hoje: string) {
  const partes = [Number(e.racao_kg) > 0 ? `${fmt(Number(e.racao_kg), 1)} kg de ração` : null, e.mortes ? `${e.mortes} ${e.mortes === 1 ? "morte" : "mortes"}` : null];
  return `${partes.filter(Boolean).join(", ") || "lançamento sem ração"} (${ORIGEM[e.origem] ?? e.origem}, ${quando(e.criado_em, hoje)})`;
}

function ItemDaFila({ item, hoje }: { item: ItemFila; hoje: string }) {
  const { fila, online } = useCampo();
  const [armado, tocar] = useDoisToques();
  const Icone = ICONES[item.tipo];
  const precisa = Boolean(item.conflito || item.parado);

  function semBaixar() {
    fila.reenviar(item.client_id, (i) => ({
      ...i, corpo: i.tipo === "apontamento" ? { ...i.corpo, racoes: [] } : { ...i.corpo, baixar_estoque: false },
    }));
  }

  return (
    <li className={`vidro flex flex-col gap-2.5 rounded-[1.375rem] px-4 py-3.5 ${precisa ? "ring-1 ring-perigo/40" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${precisa ? "bg-perigo/12 text-perigo" : "bg-alerta/12 text-alerta"}`}>
          <Icone aria-hidden size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-medium">{item.rotulo}</p>
          <p className="text-xs text-texto-suave">
            Lançado {quando(item.criado_em, hoje)}
            {item.tentativas ? ` · ${item.tentativas} ${item.tentativas === 1 ? "tentativa" : "tentativas"}` : ""}
            {precisa ? "" : !online ? " · esperando sinal" : fila.sessaoExpirada ? " · espera você entrar de novo" : fila.enviando ? " · enviando" : " · na fila"}
          </p>
        </div>
      </div>
      {item.conflito ? (
        <AvisoCampo tom="alerta" titulo="Já tem lançamento neste viveiro e turno">
          {item.conflito.length ? `No servidor: ${item.conflito.map((e) => textoExistente(e, hoje)).join("; ")}.` : item.erro} Somar este também ou descartar?
        </AvisoCampo>
      ) : item.erro ? (
        <p className={`text-sm ${item.parado ? "text-perigo" : "text-texto-suave"}`}>{item.erro}</p>
      ) : null}
      {(precisa || item.erro) && (
        <div className="flex flex-wrap gap-2">
          {item.conflito ? (
            <BotaoPilula variante="primario" onClick={() => fila.reenviar(item.client_id, (i) => ({ ...i, corpo: { ...i.corpo, forcar: true } }))}>Somar mesmo assim</BotaoPilula>
          ) : (
            <BotaoPilula variante="primario" disabled={!online} onClick={() => fila.reenviar(item.client_id)}>Tentar de novo</BotaoPilula>
          )}
          {item.parado && semEstoque(item) && (item.tipo === "apontamento" || item.tipo === "insumo") && (
            <BotaoPilula onClick={semBaixar}>Enviar sem baixar do estoque</BotaoPilula>
          )}
          <BotaoPilula variante="perigo" onClick={() => tocar(() => fila.descartar(item.client_id))}>
            {armado ? "Toque de novo: descartar" : "Descartar"}
          </BotaoPilula>
        </div>
      )}
    </li>
  );
}

// Aba Envios: o que está no celular esperando sinal, o que precisa de decisão e o que já chegou ao servidor.
export function EnviosCampo() {
  const campo = useCampo();
  const { fila, online, hoje, dados } = campo;
  const resumo = resumoFila(fila.fila);
  const prontos = resumo.aguardando > 0;

  const estado = !online
    ? { Icone: WifiOff, cor: "text-perigo bg-perigo/12", titulo: "Sem sinal", texto: resumo.total ? `${resumo.total} ${resumo.total === 1 ? "lançamento guardado" : "lançamentos guardados"} neste celular. Vão sozinhos quando o sinal voltar.` : "Pode lançar normalmente: tudo fica guardado no celular." }
    : resumo.precisam
      ? { Icone: CircleAlert, cor: "text-perigo bg-perigo/12", titulo: `${resumo.precisam} ${resumo.precisam === 1 ? "envio precisa" : "envios precisam"} de você`, texto: "Veja abaixo o que o servidor respondeu." }
      : resumo.total
        ? { Icone: CloudUpload, cor: "text-alerta bg-alerta/12", titulo: fila.enviando ? "Enviando…" : `${resumo.total} na fila`, texto: "Os lançamentos saem na ordem em que foram feitos." }
        : { Icone: CheckCheck, cor: "text-positivo bg-positivo/12", titulo: "Tudo enviado", texto: fila.ultimoEnvio ? `Último envio ${quando(fila.ultimoEnvio, hoje)}.` : "Nada esperando envio neste celular." };

  return (
    <div className="flex flex-col gap-4">
      <section className="vidro flex flex-col gap-3 rounded-[1.375rem] px-4 py-4" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className={`grid size-11 shrink-0 place-items-center rounded-full ${estado.cor}`}><estado.Icone size={22} /></span>
          <div className="min-w-0">
            <p className="text-[17px] font-semibold">{estado.titulo}</p>
            <p className="text-sm text-texto-suave">{estado.texto}</p>
          </div>
        </div>
        {online && prontos && !fila.sessaoExpirada && (
          <BotaoGrande variante="secundario" disabled={fila.enviando} onClick={() => void fila.sincronizar()}>
            <CloudUpload size={20} /> {fila.enviando ? "Enviando…" : "Enviar agora"}
          </BotaoGrande>
        )}
      </section>

      {fila.sessaoExpirada && (
        <AvisoCampo tom="perigo" titulo="Sua sessão expirou">
          Entre de novo para enviar. Nada da fila se perde.
          <a href="/login?voltar=/campo" className="mt-2 flex h-11 w-fit items-center gap-1.5 rounded-full bg-perigo px-4 text-sm font-semibold text-white">
            <LogIn size={16} /> Entrar
          </a>
        </AvisoCampo>
      )}

      {fila.fila.length > 0 && (
        <section>
          <Subtitulo>Na fila</Subtitulo>
          <ul className="flex flex-col gap-2.5">
            {[...fila.fila].sort((a, b) => Number(Boolean(b.conflito || b.parado)) - Number(Boolean(a.conflito || a.parado)))
              .map((i) => <ItemDaFila key={i.client_id} item={i} hoje={hoje} />)}
          </ul>
        </section>
      )}

      {fila.enviados.length > 0 && (
        <section>
          <Subtitulo>Enviados deste celular</Subtitulo>
          <ul className="divide-y divide-linha rounded-2xl bg-elevado/60 px-4">
            {fila.enviados.map((e) => {
              const Icone = ICONES[e.tipo] ?? Clock;
              return (
                <li key={e.client_id} className="flex items-center gap-2.5 py-2.5 text-sm">
                  <Icone aria-hidden size={15} className="shrink-0 text-texto-suave" />
                  <span className="min-w-0 flex-1 truncate">{e.rotulo}</span>
                  <span className="shrink-0 text-xs text-texto-suave">{e.repetido ? "já estava lá" : quando(e.enviado_em, hoje)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {dados.chavePush && (
        <section className="rounded-2xl bg-elevado/60 px-4 py-3">
          <AvisosPush chavePublica={dados.chavePush} />
        </section>
      )}
      <p className="px-1 text-xs text-texto-suave">
        Os lançamentos ficam guardados neste celular até chegarem ao servidor. Não limpe os dados do navegador com itens na fila.
      </p>
    </div>
  );
}
