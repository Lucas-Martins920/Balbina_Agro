"use client";

import { useState } from "react";
import { Clock, Scale } from "lucide-react";
import { proximaBiometria } from "@/lib/campo/indicadores";
import { useCampo } from "./contexto";
import { GraficoCrescimento } from "./grafico-crescimento";
import { AvisoCampo, BotaoGrande, dataCurta, fmt, Numero, Subtitulo } from "./pecas";

const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

// Aba Biometria: o crescimento de cada lote (peso, ganho por dia, conversão, curva contra o padrão da espécie)
// e a próxima pesagem. Começa pelo viveiro com a biometria mais atrasada.
export function BiometriaCampo() {
  const campo = useCampo();
  const ocupados = campo.dados.painel.tanques.filter((t) => t.lote);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const situacao = new Map(ocupados.map((t) => [t.id, proximaBiometria(t.lote!, campo.hoje)]));
  const maisAtrasado = [...ocupados].sort((a, b) => situacao.get(a.id)!.data.localeCompare(situacao.get(b.id)!.data))[0];
  const tanque = ocupados.find((t) => t.id === escolhido) ?? maisAtrasado;

  if (!tanque) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-sm text-texto-suave">
        <Scale aria-hidden size={24} />
        Nenhum viveiro com peixe para pesar. Abra um lote na aba Viveiros.
      </div>
    );
  }
  const l = tanque.lote!;
  const bio = situacao.get(tanque.id)!;
  const naFila = campo.pendentes(tanque.id).filter((i) => i.tipo === "biometria");
  const biometrias = l.biometrias;

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Viveiro" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {ocupados.map((t) => {
          const atrasada = situacao.get(t.id)!.atrasada;
          const ativo = t.id === tanque.id;
          return (
            <button key={t.id} type="button" aria-pressed={ativo} onClick={() => setEscolhido(t.id)}
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] ${
                ativo ? "bg-marca text-marca-texto" : "bg-elevado text-texto shadow-[inset_0_0_0_1px_var(--brilho)]"}`}>
              {t.nome}
              {atrasada && <span aria-label="biometria atrasada" className={`size-2 rounded-full ${ativo ? "bg-marca-texto" : "bg-alerta"}`} />}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Numero titulo="Peso médio" valor={l.peso_g !== null ? `${fmt(l.peso_g, 0)} g` : "—"}
          detalhe={l.ultima_biometria ? `pesado em ${dataCurta(l.ultima_biometria)}` : "estimado pela curva"} />
        <Numero titulo="Ganho por dia" valor={l.gpd !== null ? `${fmt(l.gpd, 1)} g` : "—"} detalhe={`${l.dias}º dia de cultivo`} />
        <Numero titulo="Conversão alimentar" valor={fmt(l.conversao, 2)} detalhe="kg de ração / kg ganho" />
        <Numero titulo="Contra a curva" valor={l.desvio_peso_pct !== null ? `${l.desvio_peso_pct >= 0 ? "+" : ""}${fmt(l.desvio_peso_pct, 0)}%` : "—"}
          tom={l.desvio_peso_pct !== null && l.desvio_peso_pct < -15 ? "alerta" : l.desvio_peso_pct !== null && l.desvio_peso_pct >= 0 ? "positivo" : undefined}
          detalhe={l.desvio_peso_pct === null ? "sem padrão da espécie" : l.desvio_peso_pct < 0 ? "abaixo do padrão" : "acima do padrão"} />
      </div>

      {bio.atrasada
        ? <AvisoCampo tom="alerta" titulo={`Biometria atrasada desde ${dataCurta(bio.data)}`}>{bio.intervalo === 15 ? "Até 70 g, pese a cada 15 dias." : "Acima de 70 g, pese uma vez por mês."} A ração sugerida depende do peso.</AvisoCampo>
        : <AvisoCampo titulo={bio.hoje ? "Biometria marcada para hoje" : `Próxima biometria em ${dataCurta(bio.data)}`}>{bio.intervalo === 15 ? "A cada 15 dias até 70 g; depois, uma vez por mês." : "Uma vez por mês a partir de 70 g."}</AvisoCampo>}
      {naFila.length > 0 && (
        <p className="flex items-center gap-2 px-1 text-sm text-alerta"><Clock aria-hidden size={15} /> {naFila.length === 1 ? "1 biometria" : `${naFila.length} biometrias`} na fila de envio.</p>
      )}
      <BotaoGrande onClick={() => campo.abrir({ tipo: "biometria", tanque: tanque.id })}><Scale size={20} /> Registrar biometria</BotaoGrande>

      <section className="vidro rounded-[1.375rem] px-4 py-4">
        <Subtitulo>Crescimento · lote {l.codigo}</Subtitulo>
        <GraficoCrescimento key={l.id} lote={l} />
      </section>

      {biometrias.length > 0 && (
        <section>
          <Subtitulo>Biometrias</Subtitulo>
          <ul className="divide-y divide-linha rounded-2xl bg-elevado/60 px-4">
            {biometrias.map((b, i) => {
              const anterior = biometrias[i + 1];
              const intervalo = anterior ? dias(anterior.data, b.data) : 0;
              const ganho = anterior && intervalo > 0 ? (b.peso_g - anterior.peso_g) / intervalo : null;
              return (
                <li key={`${b.data}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="text-texto-suave tabular-nums">{dataCurta(b.data)}</span>
                  <span className="flex-1 font-semibold tabular-nums">{fmt(b.peso_g, 0)} g</span>
                  <span className="text-right text-xs text-texto-suave tabular-nums">
                    {b.peixes} peixes{ganho !== null ? ` · ${ganho >= 0 ? "+" : ""}${fmt(ganho, 1)} g/dia` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
