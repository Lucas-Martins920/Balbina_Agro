"use client";

import { useState } from "react";
import { Check, CheckCheck, Clock, FlaskConical, TriangleAlert, Wheat } from "lucide-react";
import { TURNOS } from "@/lib/rotulos";
import { apontamentoDoTurno } from "@/lib/campo/fila";
import { racaoPorTurno, sacosParaKg } from "@/lib/campo/indicadores";
import { useCampo } from "./contexto";
import { BotaoGrande, BotaoPilula, fmt, quando, Segmentado, Subtitulo } from "./pecas";

// Aba Ração: o trato do turno viveiro por viveiro (quanto dar pela tabela, o que já foi lançado) e os insumos
// aplicados nos viveiros (calagem, adubação, medicamento).
export function RacaoCampo() {
  const campo = useCampo();
  const { dados, fila, hoje, turno, kgSaco } = campo;
  const [parte, setParte] = useState<"racao" | "insumos">("racao");
  const ocupados = dados.painel.tanques.filter((t) => t.lote);
  const situacoes = ocupados.map((t) => apontamentoDoTurno(t.id, hoje, turno, fila.fila, fila.enviados));
  const lancados = situacoes.filter(Boolean).length;
  const totalDia = ocupados.reduce((s, t) => s + (t.lote!.racao?.kg ?? 0), 0);

  const insumosFila = fila.fila.filter((i) => i.tipo === "insumo");
  const insumosEnviados = fila.enviados.filter((e) => e.tipo === "insumo").slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <Segmentado rotulo="Ração ou insumos" valor={parte} mudar={setParte}
        opcoes={[{ valor: "racao", nome: "Ração do dia" }, { valor: "insumos", nome: "Insumos" }]} />

      {parte === "racao" ? (
        ocupados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-sm text-texto-suave">
            <Wheat aria-hidden size={24} />
            Nenhum viveiro com peixe. Abra um lote na aba Viveiros.
          </div>
        ) : (
          <>
            <section className="vidro flex flex-col gap-3 rounded-[1.375rem] px-4 py-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-texto-suave">Ração de hoje pela tabela</p>
                  <p className="text-[28px] leading-tight font-semibold tabular-nums">{fmt(totalDia, 1)} kg</p>
                  <p className="text-sm text-texto-suave">{kgSaco > 0 ? `≈ ${sacosParaKg(totalDia, kgSaco)} sacos de ${fmt(kgSaco, 1)} kg` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-texto-suave">{TURNOS[turno]}</p>
                  <p className="text-lg font-semibold tabular-nums">{lancados} de {ocupados.length}</p>
                  <p className="text-xs text-texto-suave">lançados</p>
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-linha" aria-hidden>
                <div className="h-full origin-left rounded-full bg-marca transition-transform duration-500 ease-out"
                  style={{ transform: `scaleX(${ocupados.length ? lancados / ocupados.length : 0})` }} />
              </div>
            </section>

            <ul className="flex flex-col gap-2">
              {ocupados.map((t, i) => {
                const l = t.lote!;
                const situacao = situacoes[i];
                const turnoKg = racaoPorTurno(l.racao?.kg);
                return (
                  <li key={t.id}>
                    <div className="vidro flex items-center gap-3 rounded-[1.375rem] py-3 pr-3 pl-4">
                      <button type="button" onClick={() => campo.abrir({ tipo: "tanque", tanque: t.id })} className="min-w-0 flex-1 text-left">
                        <p className="flex items-center gap-1.5 truncate text-[16px] font-semibold">
                          {t.nome}
                          {situacao === "enviado" && <CheckCheck aria-label="lançado e enviado" size={16} className="shrink-0 text-positivo" />}
                          {situacao === "fila" && <Check aria-label="lançado, esperando sinal" size={16} className="shrink-0 text-alerta" />}
                          {l.racao?.alerta && <TriangleAlert aria-label={l.racao.alerta} size={15} className="shrink-0 text-perigo" />}
                        </p>
                        <p className="truncate text-[13px] text-texto-suave">
                          {l.racao ? `${fmt(l.racao.kg, 1)} kg/dia${turnoKg !== null ? ` · ~${fmt(turnoKg, 1)} kg no turno` : ""}${l.racao.granulo ? ` · ${l.racao.granulo}` : ""}` : "sem ração sugerida"}
                        </p>
                      </button>
                      <BotaoPilula variante={situacao ? "secundario" : "primario"} onClick={() => campo.abrir({ tipo: "racao", tanque: t.id })}>
                        {situacao ? "Outro" : "Lançar"}
                      </BotaoPilula>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="px-1 text-xs text-texto-suave">
              <CheckCheck aria-hidden size={13} className="mr-1 inline text-positivo" />enviado
              <Check aria-hidden size={13} className="mr-1 ml-3 inline text-alerta" />esperando sinal. Sugestão pela tabela de arraçoamento da espécie (padrão Embrapa) e o peso estimado do lote.
            </p>
          </>
        )
      ) : (
        <>
          <BotaoGrande onClick={() => campo.abrir({ tipo: "insumo", tanque: "" })}><FlaskConical size={20} /> Lançar insumo no viveiro</BotaoGrande>
          <p className="-mt-1 px-1 text-sm text-texto-suave">Calagem, adubação, medicamento, banho, limpeza. Vale para viveiro com peixe ou em preparo.</p>
          {(insumosFila.length > 0 || insumosEnviados.length > 0) && (
            <section>
              <Subtitulo>Últimos lançamentos</Subtitulo>
              <ul className="flex flex-col gap-1.5">
                {insumosFila.map((i) => (
                  <li key={i.client_id} className="flex items-center gap-2.5 rounded-xl bg-elevado/60 px-3 py-2.5 text-sm">
                    <Clock aria-hidden size={15} className={i.parado ? "text-perigo" : "text-alerta"} />
                    <span className="min-w-0 flex-1 truncate">{i.rotulo}</span>
                    <span className="shrink-0 text-xs text-texto-suave">{i.parado ? "ver Envios" : "na fila"}</span>
                  </li>
                ))}
                {insumosEnviados.map((e) => (
                  <li key={e.client_id} className="flex items-center gap-2.5 rounded-xl bg-elevado/60 px-3 py-2.5 text-sm">
                    <CheckCheck aria-hidden size={15} className="text-positivo" />
                    <span className="min-w-0 flex-1 truncate">{e.rotulo}</span>
                    <span className="shrink-0 text-xs text-texto-suave">{quando(e.enviado_em, hoje)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {dados.painel.insumos.length > 0 && (
            <section>
              <Subtitulo>No estoque</Subtitulo>
              <ul className="divide-y divide-linha rounded-2xl bg-elevado/60 px-4">
                {dados.painel.insumos.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{i.nome}</span>
                    <span className="shrink-0 font-medium tabular-nums">{i.saldo !== null ? `${fmt(i.saldo, 1)} ${i.unidade}` : "—"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
