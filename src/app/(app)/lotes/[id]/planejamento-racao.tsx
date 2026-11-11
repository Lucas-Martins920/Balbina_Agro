import Link from "next/link";
import { Wheat } from "lucide-react";
import { Cartao, CLASSE_BOTAO_TEXTO, Etiqueta, type TomEtiqueta } from "@/components/ui";
import { formatarData, formatarNumero } from "@/lib/formato";
import { planejarReserva, type Confianca, type Origem, type Valor } from "@/lib/previsao-racao";
import type { PlanoRacao, PrevisaoDoLote } from "@/lib/previsao-racao-dados";
import { descricaoRacao, sacosDoSaldo } from "@/lib/racao-estoque";

const ORIGEM: Record<Origem, { texto: string; tom: TomEtiqueta }> = {
  medido: { texto: "medido", tom: "positivo" },
  calculado: { texto: "calculado", tom: "info" },
  previsao: { texto: "previsão", tom: "neutro" },
  recomendacao: { texto: "recomendação", tom: "alerta" },
  ausente: { texto: "sem dado", tom: "perigo" },
};
const CONFIANCA: Record<Confianca, { texto: string; tom: TomEtiqueta }> = {
  alta: { texto: "confiança alta", tom: "positivo" },
  media: { texto: "confiança média", tom: "alerta" },
  baixa: { texto: "confiança baixa", tom: "perigo" },
  indisponivel: { texto: "previsão indisponível", tom: "perigo" },
};

const kg = (v: number | null | undefined, casas = 1) => (v === null || v === undefined ? "–" : `${formatarNumero(v, casas)} kg`);

function Item({ rotulo, valor, origem, detalhe }: { rotulo: string; valor: React.ReactNode; origem?: Valor<unknown>; detalhe?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-borda p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] text-texto-suave">{rotulo}</p>
        {origem && <Etiqueta tom={ORIGEM[origem.origem].tom} className="shrink-0">{ORIGEM[origem.origem].texto}</Etiqueta>}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{valor}</p>
      {(detalhe || origem?.nota) && <p className="text-xs text-texto-suave">{detalhe ?? origem?.nota}</p>}
    </div>
  );
}

// Planejamento da ração do lote: o que foi medido, o que o sistema calculou e o que ele prevê, com a origem de
// cada número. Nada é inventado: sem dado, aparece "sem dado" e o motivo.
export function PlanejamentoRacao({ plano, lote }: { plano: PlanoRacao; lote: PrevisaoDoLote }) {
  const p = lote.previsao;
  const atual = p.racaoAtual.valor;
  const proxima = p.proximaRacao.valor;
  const sacosEstoque = atual ? sacosDoSaldo(p.estoqueAtualKg.valor ?? 0, atual.saco_kg) : null;
  // reserva do lote: os N sacos divididos entre a ração atual e a próxima, pelo consumo deste lote
  const itens = [
    ...(atual ? [{ racao: atual, consumo: p.consumoPorDia.atual }] : []),
    ...(proxima && proxima.id !== atual?.id ? [{ racao: proxima, consumo: p.consumoPorDia.proxima }] : []),
  ].filter((i) => i.consumo.some((v) => v > 0));
  const reserva = itens.length
    ? planejarReserva(itens, plano.saldos, { reservaSacos: plano.parametros.reserva_sacos, prazoEntregaDias: plano.parametros.prazo_entrega_dias })
    : [];

  return (
    <Cartao titulo="Planejamento da ração" icone={Wheat} cor="verde"
      descricao={`Pela biometria, pela tabela de arraçoamento da espécie (${lote.especie ?? "sem espécie"}) e pelo trato lançado. O produtor confirma: a previsão não lança nada sozinha.`}
      acoes={<Etiqueta tom={CONFIANCA[p.confianca].tom}>{CONFIANCA[p.confianca].texto}</Etiqueta>}>
      {p.motivos.length > 0 && (
        <ul className="mb-4 list-disc pl-5 text-sm text-texto-suave">
          {p.motivos.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Item rotulo="Última biometria" valor={p.pesoUltimaBiometria.valor === null ? "–" : `${formatarNumero(p.pesoUltimaBiometria.valor, 1)} g`}
          origem={p.pesoUltimaBiometria} detalhe={p.dataUltimaBiometria ? `em ${formatarData(p.dataUltimaBiometria)} (há ${p.diasDesdeBiometria} dias)` : "nenhuma biometria"} />
        <Item rotulo="Peso médio hoje" valor={p.pesoHoje.valor === null ? "–" : `${formatarNumero(p.pesoHoje.valor, 1)} g`} origem={p.pesoHoje} />
        <Item rotulo="Biomassa" valor={kg(p.biomassaKg.valor, 0)} origem={p.biomassaKg}
          detalhe={p.peixes.valor !== null ? `${formatarNumero(p.peixes.valor, 0)} peixes vivos` : undefined} />
        <Item rotulo="Crescimento" valor={p.gmdG.valor === null ? "–" : `${formatarNumero(p.gmdG.valor, 2)} g/dia`} origem={p.gmdG}
          detalhe={p.ganhoG.valor !== null ? `+${formatarNumero(p.ganhoG.valor, 1)} g desde a biometria anterior` : p.gmdG.nota} />
        <Item rotulo="Ração atual" valor={atual ? descricaoRacao(atual) : "–"} origem={p.racaoAtual}
          detalhe={p.faixaAtual ? `faixa ${p.faixaAtual.fase} da tabela` : p.racaoAtual.nota} />
        <Item rotulo="Consumo diário" valor={kg(p.consumoDiaKg.valor)} origem={p.consumoDiaKg}
          detalhe={p.consumoRealDiaKg.valor !== null ? `trato real: ${kg(p.consumoRealDiaKg.valor)} por dia` : p.consumoDiaKg.nota} />
        <Item rotulo="Estoque da ração atual" valor={kg(p.estoqueAtualKg.valor, 0)} origem={p.estoqueAtualKg}
          detalhe={sacosEstoque ? `${sacosEstoque.fechados} sacos fechados${sacosEstoque.abertoKg ? ` + ${kg(sacosEstoque.abertoKg)} no aberto` : ""}` : p.estoqueAtualKg.nota} />
        <Item rotulo="Cobertura" valor={p.coberturaDias.valor === null ? "–" : `${p.coberturaDias.valor} dias`} origem={p.coberturaDias}
          detalhe={p.dataFalta.valor ? `falta em ${formatarData(p.dataFalta.valor)}` : p.dataFalta.nota ?? p.coberturaDias.nota} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-borda p-3">
          <p className="mb-2 text-sm font-medium">Previsão de consumo</p>
          {p.horizontes.length === 0 ? <p className="text-sm text-texto-suave">Sem previsão: {p.consumoDiaKg.nota}.</p> : (
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-[13px] text-texto-suave">
                <tr><th scope="col" className="pb-1 font-medium">Dias</th><th scope="col" className="pb-1 text-right font-medium">Total</th>
                  <th scope="col" className="pb-1 text-right font-medium">Sacos</th><th scope="col" className="pb-1 text-right font-medium max-sm:hidden">Ração atual</th>
                  <th scope="col" className="pb-1 text-right font-medium max-sm:hidden">Próxima</th></tr>
              </thead>
              <tbody className="divide-y divide-linha [&_td]:py-1.5">
                {p.horizontes.map((h) => (
                  <tr key={h.dias}>
                    <td>{h.dias} dias</td>
                    <td className="text-right font-medium">{kg(h.kg, 0)}</td>
                    <td className="text-right">{h.sacos === null ? "–" : formatarNumero(h.sacos, 1)}</td>
                    <td className="text-right max-sm:hidden">{kg(h.kgAtual, 0)}</td>
                    <td className="text-right max-sm:hidden">{h.kgProxima ? kg(h.kgProxima, 0) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-texto-suave">Previsão: peso pelo ganho entre biometrias (ou pela curva), biomassa × taxa da tabela{p.ajusteApetite.valor !== null ? ", ajustada pelo apetite real" : ""}. A sobra de ração não é lançada no apontamento, então não entra.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Item rotulo="Próxima ração" valor={proxima ? descricaoRacao(proxima) : p.proximaRecomendada ? `Comprar ${p.proximaRecomendada}` : "–"} origem={p.proximaRacao}
            detalhe={p.transicao.valor ? `troca prevista em ${formatarData(p.transicao.valor)}` : p.transicao.nota} />
          <div className="rounded-xl border border-borda p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] text-texto-suave">Reserva (até {plano.parametros.reserva_sacos} sacos)</p>
              <Etiqueta tom="alerta">recomendação</Etiqueta>
            </div>
            {reserva.length === 0 ? <p className="mt-1 text-sm text-texto-suave">Sem consumo previsto para dividir a reserva.</p> : (
              <ul className="mt-1 text-sm">
                {reserva.map((r) => (
                  <li key={r.racao.id} className="flex justify-between gap-2 tabular-nums">
                    <span>{r.racao.nome}</span>
                    <span className="font-medium">{r.reservaSacos === null ? "sem peso do saco" : `${r.reservaSacos} sacos`}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-texto-suave">Para os próximos {reserva[0]?.janelaDias ?? "–"} dias. Compra e estoque de todas as rações no <Link href="/racao" className={CLASSE_BOTAO_TEXTO}>estoque de ração</Link>.</p>
          </div>
        </div>
      </div>
    </Cartao>
  );
}
