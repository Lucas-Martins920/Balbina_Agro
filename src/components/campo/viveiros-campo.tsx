"use client";

import { useState } from "react";
import { ChevronRight, Clock, Fish, Plus, TriangleAlert, WavesHorizontal } from "lucide-react";
import { Etiqueta } from "@/components/ui";
import { FASES } from "@/lib/rotulos";
import { proximaBiometria } from "@/lib/campo/indicadores";
import type { Tanque } from "@/lib/campo/tipos";
import { useCampo } from "./contexto";
import { biomassaTexto } from "./detalhe-tanque";
import { dataCurta, fmt, Numero, Segmentado } from "./pecas";

type Filtro = "todos" | "ocupados" | "vazios";

function CartaoTanque({ tanque, hoje, pendentes, abrir }: { tanque: Tanque; hoje: string; pendentes: number; abrir: () => void }) {
  const l = tanque.lote;
  const alertas = l ? [
    l.racao?.alerta ? { texto: l.racao.alerta, tom: "perigo" as const } : null,
    proximaBiometria(l, hoje).atrasada ? { texto: "Biometria atrasada", tom: "alerta" as const } : null,
    l.carencia_ate && l.carencia_ate >= hoje ? { texto: `Carência até ${dataCurta(l.carencia_ate)}`, tom: "alerta" as const } : null,
  ].filter((a) => a !== null) : [];

  return (
    <li>
      <button type="button" onClick={abrir}
        className="vidro flex w-full flex-col gap-2.5 rounded-[1.375rem] px-4 py-3.5 text-left transition-transform duration-150 ease-out active:scale-[0.98]">
        <div className="flex w-full items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold">{tanque.nome}</p>
            <p className="truncate text-[13px] text-texto-suave">
              {l ? `Lote ${l.codigo} · ${l.dias}º dia` : ["Vazio", tanque.area_m2 ? `${fmt(tanque.area_m2, 0)} m²` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {pendentes > 0 && (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-alerta/15 px-2 text-xs font-medium text-alerta">
                <Clock aria-hidden size={12} /> {pendentes}
                <span className="sr-only">{pendentes === 1 ? "envio na fila" : "envios na fila"}</span>
              </span>
            )}
            {l ? <Etiqueta tom="info">{FASES[l.fase] ?? l.fase}</Etiqueta> : <Etiqueta>Vazio</Etiqueta>}
            <ChevronRight aria-hidden size={18} className="text-texto-suave" />
          </div>
        </div>
        {l ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-[13px]">
              <span><span className="block text-base font-semibold tabular-nums">{fmt(l.peixes, 0)}</span><span className="text-texto-suave">peixes</span></span>
              <span><span className="block text-base font-semibold tabular-nums">{l.peso_g !== null ? `${fmt(l.peso_g, 0)} g` : "—"}</span><span className="text-texto-suave">peso médio</span></span>
              <span><span className="block text-base font-semibold tabular-nums">{biomassaTexto(l.biomassa_kg)}</span><span className="text-texto-suave">biomassa</span></span>
            </div>
            {l.racao && (
              <p className="text-[13px] text-texto-suave">
                Ração hoje: <span className="font-semibold text-texto tabular-nums">{fmt(l.racao.kg, 1)} kg</span>
                {l.racao.refeicoes ? ` em ${l.racao.refeicoes} tratos` : ""}{l.racao.granulo ? ` · ${l.racao.granulo}` : ""}
              </p>
            )}
            {alertas.map((a) => (
              <p key={a.texto} className={`flex items-start gap-1.5 text-[13px] font-medium ${a.tom === "perigo" ? "text-perigo" : "text-alerta"}`}>
                <TriangleAlert aria-hidden size={14} className="mt-0.5 shrink-0" /> {a.texto}
              </p>
            ))}
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-marca"><Plus aria-hidden size={15} /> Abrir lote ou registrar o preparo</p>
        )}
      </button>
    </li>
  );
}

// Aba Viveiros: todos os viveiros da piscicultura, com o lote de cada um. Um toque abre a ficha do viveiro.
export function ViveirosCampo() {
  const campo = useCampo();
  const { tanques } = campo.dados.painel;
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const ocupados = tanques.filter((t) => t.lote);
  const lista = filtro === "ocupados" ? ocupados : filtro === "vazios" ? tanques.filter((t) => !t.lote) : tanques;
  const biomassa = ocupados.reduce((s, t) => s + (t.lote!.biomassa_kg ?? 0), 0);
  const peixes = ocupados.reduce((s, t) => s + t.lote!.peixes, 0);
  const setores = [...new Set(lista.map((t) => t.setor))];

  if (!tanques.length) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-marca-suave text-marca"><WavesHorizontal size={26} /></span>
        <p className="text-lg font-semibold">Nenhum viveiro cadastrado</p>
        <p className="text-sm text-texto-suave">No computador, cadastre os viveiros e tanques em Viveiros. Depois abra esta tela com sinal.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-tour="viveiros">
      <div className="grid grid-cols-3 gap-2">
        <Numero titulo="Com peixe" valor={`${ocupados.length} de ${tanques.length}`} />
        <Numero titulo="Peixes" valor={fmt(peixes, 0)} />
        <Numero titulo="Biomassa" valor={biomassaTexto(biomassa)} />
      </div>
      <Segmentado rotulo="Mostrar" valor={filtro} mudar={setFiltro}
        opcoes={[{ valor: "todos", nome: "Todos" }, { valor: "ocupados", nome: "Com peixe" }, { valor: "vazios", nome: "Vazios" }]} />
      {lista.length === 0 && (
        <p className="flex flex-col items-center gap-2 py-10 text-center text-sm text-texto-suave">
          <Fish aria-hidden size={22} /> {filtro === "vazios" ? "Todos os viveiros estão com peixe." : "Nenhum viveiro com peixe agora."}
        </p>
      )}
      {setores.map((setor) => (
        <section key={setor || "-"} className="flex flex-col gap-2">
          {setores.length > 1 && setor && <h2 className="px-1 text-[13px] font-semibold tracking-[0.06em] text-texto-suave uppercase">{setor}</h2>}
          <ul className="flex flex-col gap-2.5">
            {lista.filter((t) => t.setor === setor).map((t) => (
              <CartaoTanque key={t.id} tanque={t} hoje={campo.hoje} pendentes={campo.pendentes(t.id).length}
                abrir={() => campo.abrir({ tipo: "tanque", tanque: t.id })} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
