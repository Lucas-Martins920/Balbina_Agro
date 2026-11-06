"use client";

import { Clock, Fish, FlaskConical, Scale, Shovel, Wheat, type LucideIcon } from "lucide-react";
import { Etiqueta } from "@/components/ui";
import { FASES } from "@/lib/rotulos";
import { proximaBiometria } from "@/lib/campo/indicadores";
import type { Tanque } from "@/lib/campo/tipos";
import { useCampo, type AcaoFolha } from "./contexto";
import { AvisoCampo, BotaoGrande, dataCurta, fmt, Numero, RodapeFolha, Subtitulo } from "./pecas";

function Acao({ icone: Icone, nome, onClick }: { icone: LucideIcon; nome: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-elevado text-[13px] font-medium shadow-[inset_0_1px_0_var(--aresta),inset_0_0_0_1px_var(--brilho)] transition-transform duration-150 ease-out active:scale-[0.96]">
      <Icone size={20} strokeWidth={2} />
      {nome}
    </button>
  );
}

export const biomassaTexto = (kg: number | null | undefined) =>
  kg === null || kg === undefined ? "—" : kg >= 10_000 ? `${fmt(kg / 1000, 1)} t` : `${fmt(kg, 0)} kg`;

// O viveiro na palma da mão: como está o lote, quanto dar de ração hoje, o que falta enviar e os lançamentos.
export function DetalheTanque({ tanque }: { tanque: Tanque }) {
  const campo = useCampo();
  const l = tanque.lote;
  const pendentes = campo.pendentes(tanque.id);
  const abrir = (tipo: AcaoFolha["tipo"]) => campo.abrir({ tipo, tanque: tanque.id });
  const estrutura = [
    tanque.area_m2 ? `${fmt(tanque.area_m2, 0)} m²` : null,
    tanque.volume_m3 ? `${fmt(tanque.volume_m3, 0)} m³` : null,
    tanque.aeracao ? "com aerador" : null,
  ].filter(Boolean).join(" · ");

  const fila = pendentes.length > 0 && (
    <section>
      <Subtitulo>Na fila deste viveiro</Subtitulo>
      <ul className="flex flex-col gap-1.5">
        {pendentes.map((p) => (
          <li key={p.client_id} className="flex items-center gap-2 rounded-xl bg-elevado/60 px-3 py-2 text-sm">
            <Clock aria-hidden size={15} className={p.parado || p.conflito ? "text-perigo" : "text-alerta"} />
            <span className="min-w-0 flex-1 truncate">{p.rotulo}</span>
          </li>
        ))}
      </ul>
    </section>
  );

  if (!l) {
    const loteNaFila = pendentes.find((p) => p.tipo === "abrir_lote");
    return (
      <div className="flex flex-col gap-4 pt-1">
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-elevado/60 px-4 py-6 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-marca-suave text-marca"><Fish size={24} /></span>
          <p className="font-semibold">Viveiro vazio</p>
          {estrutura && <p className="text-sm text-texto-suave">{estrutura}</p>}
        </div>
        {loteNaFila
          ? <AvisoCampo titulo="Lote aguardando envio">{loteNaFila.rotulo}. Já dá para lançar a ração: vai para o servidor depois do lote.</AvisoCampo>
          : <p className="px-1 text-sm text-texto-suave">Antes de povoar, registre aqui a calagem e a adubação do preparo do viveiro.</p>}
        {fila}
        <RodapeFolha>
          {loteNaFila
            ? <BotaoGrande onClick={() => abrir("racao")}><Wheat size={20} /> Ração e mortes</BotaoGrande>
            : <BotaoGrande onClick={() => abrir("abrir")}><Fish size={20} /> Abrir lote</BotaoGrande>}
          <BotaoGrande variante="secundario" onClick={() => abrir("insumo")}><FlaskConical size={20} /> Calagem, adubação ou outro insumo</BotaoGrande>
        </RodapeFolha>
      </div>
    );
  }

  const bio = proximaBiometria(l, campo.hoje);
  const r = l.racao;
  const emCarencia = l.carencia_ate !== null && l.carencia_ate >= campo.hoje;
  const abaixoDaCurva = l.desvio_peso_pct !== null && l.desvio_peso_pct < -15;

  return (
    <div className="flex flex-col gap-4 pt-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Etiqueta tom="info">{FASES[l.fase] ?? l.fase}</Etiqueta>
        <Etiqueta>Lote {l.codigo}</Etiqueta>
        {l.especie && <Etiqueta>{l.especie}</Etiqueta>}
        <Etiqueta>{l.dias}º dia</Etiqueta>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Numero titulo="Peixes" valor={fmt(l.peixes, 0)} detalhe={l.sobrevivencia !== null ? `${fmt(l.sobrevivencia, 1)}% vivos` : undefined} />
        <Numero titulo="Peso médio" valor={l.peso_g !== null ? `${fmt(l.peso_g, 0)} g` : "—"} tom={abaixoDaCurva ? "alerta" : undefined}
          detalhe={l.ultima_biometria ? `biometria ${dataCurta(l.ultima_biometria)}` : "estimado pela curva"} />
        <Numero titulo="Biomassa" valor={biomassaTexto(l.biomassa_kg)}
          detalhe={l.kg_m3 !== null ? `${fmt(l.kg_m3, 1)} kg/m³` : l.peixes_m2 !== null ? `${fmt(l.peixes_m2, 1)} peixes/m²` : undefined} />
        <Numero titulo="Ganho por dia" valor={l.gpd !== null ? `${fmt(l.gpd, 1)} g` : "—"} detalhe="desde o povoamento" />
        <Numero titulo="Conversão alimentar" valor={fmt(l.conversao, 2)} detalhe="kg de ração por kg ganho" />
        <Numero titulo="Despesca prevista" valor={dataCurta(l.previsao_despesca)} detalhe={l.peso_alvo_g ? `alvo de ${fmt(l.peso_alvo_g, 0)} g` : undefined} />
      </div>

      {r ? (
        <section className="rounded-2xl bg-marca-suave/70 px-4 py-3.5">
          <p className="text-xs font-medium text-texto-suave">Ração de hoje pela tabela{r.fase ? ` · ${r.fase}` : ""}</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">{fmt(r.kg, 1)} kg</p>
          <p className="mt-0.5 text-sm text-texto-suave">
            {[r.refeicoes && r.por_refeicao_kg !== null ? `${r.refeicoes} tratos de ${fmt(r.por_refeicao_kg, 1)} kg` : null,
              r.proteina ? `${fmt(r.proteina, 0)}% de proteína` : null, r.granulo, r.taxa_pct !== null ? `${fmt(r.taxa_pct, 1)}% do peso vivo` : null]
              .filter(Boolean).join(" · ")}
          </p>
        </section>
      ) : (
        <p className="px-1 text-sm text-texto-suave">Sem ração sugerida: falta a tabela de arraçoamento da espécie ou o peso do lote.</p>
      )}
      {r?.alerta && <AvisoCampo tom="perigo">{r.alerta}</AvisoCampo>}
      {emCarencia && <AvisoCampo tom="alerta" titulo={`Em carência até ${dataCurta(l.carencia_ate)}`}>Medicamento aplicado: não despesque para venda antes dessa data.</AvisoCampo>}
      {bio.atrasada
        ? <AvisoCampo tom="alerta" titulo="Biometria atrasada">Era para {dataCurta(bio.data)}. Pese uma amostra para a ração seguir certa.</AvisoCampo>
        : <AvisoCampo titulo={bio.hoje ? "Biometria hoje" : `Próxima biometria em ${dataCurta(bio.data)}`}>
            {bio.intervalo === 15 ? "A cada 15 dias até 70 g; depois, uma vez por mês." : "Uma vez por mês a partir de 70 g."}
          </AvisoCampo>}
      {fila}

      <RodapeFolha>
        <BotaoGrande onClick={() => abrir("racao")}><Wheat size={20} /> Ração e mortes</BotaoGrande>
        <div className="grid grid-cols-3 gap-2">
          <Acao icone={Scale} nome="Biometria" onClick={() => abrir("biometria")} />
          <Acao icone={FlaskConical} nome="Insumo" onClick={() => abrir("insumo")} />
          <Acao icone={Shovel} nome="Despesca" onClick={() => abrir("fechar")} />
        </div>
      </RodapeFolha>
    </div>
  );
}
