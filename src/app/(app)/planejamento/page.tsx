import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Aviso, Cartao, CLASSE_BOTAO_TEXTO, Etiqueta, Faixa, Indicador, LinkBotao, Titulo } from "@/components/ui";
import { formatarData, formatarInteiro, rotuloMes, somarDias } from "@/lib/formato";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { carregarPlanejamento, estudosDoPlano } from "@/lib/planejamento-dados";
import { ColunasEmpilhadas } from "@/components/graficos-planejamento";
import { peixesPorMes, fluxoMensal, situacaoRenovacao, type Evento } from "@/lib/planejamento";
import { AbasPlanejamento, LinhaDoTempo, SemManejo, NOME_FINALIDADE } from "./linha-do-tempo";
import { LotesPlanejados, type LinhaPlano } from "./lotes-planejados";

const TOM_EVENTO: Record<Evento["tipo"], "info" | "positivo" | "alerta" | "perigo" | "neutro"> = {
  povoamento: "info", transferencia_recria: "neutro", transferencia_engorda: "positivo", despesca: "alerta", viveiro_livre: "neutro",
};
const NOME_EVENTO: Record<Evento["tipo"], string> = {
  povoamento: "Povoar", transferencia_recria: "Recria", transferencia_engorda: "Engorda", despesca: "Despesca", viveiro_livre: "Viveiro livre",
};

// "4 semanas de alevinagem, 12 de recria, despesca com 52 semanas de cultivo…": as fases com 0 semanas não aparecem.
function resumoManejo(p: { semanasAlevinagem: number; semanasRecria: number; semanasCultivo: number; intervaloSemanas: number }) {
  const fases = [
    p.semanasAlevinagem ? `${p.semanasAlevinagem} ${p.semanasAlevinagem === 1 ? "semana" : "semanas"} de alevinagem` : null,
    p.semanasRecria ? `${p.semanasRecria} de recria` : null,
  ].filter(Boolean);
  const despesca = `despesca com ${p.semanasCultivo} semanas de cultivo e um lote novo a cada ${p.intervaloSemanas} ${p.intervaloSemanas === 1 ? "semana" : "semanas"}.`;
  return fases.length ? `${fases.join(", ")}, ${despesca}` : `Juvenis direto na engorda, ${despesca}`;
}

// A tela responde três perguntas: como está a piscicultura, o que vem a seguir e quando renovar cada viveiro de engorda.
// Gráficos mês a mês ficam recolhidos no fim; custos e caixa ficam em Viabilidade.
export default async function PaginaPlanejamento() {
  // As leituras saem juntas; o banco (RLS) já protege os dados se a checagem de acesso redirecionar.
  const [, { pode }, d] = await Promise.all([exigirAcesso("planejamento"), getPermissoes(), carregarPlanejamento()]);
  const { previsao, parametros: p, hoje, viveiros } = d;
  if (!p || !previsao) {
    return (
      <div className="flex max-w-7xl flex-col gap-6">
        <Titulo descricao="Quando povoar, transferir e renovar cada lote, pelo manejo da sua piscicultura.">Planejamento</Titulo>
        <AbasPlanejamento atual="geral" />
        <SemManejo />
      </div>
    );
  }
  const estudos = await estudosDoPlano({ parametros: p, previsao, itens: d.itens });
  const porMes = peixesPorMes(previsao.lotes, hoje, previsao.fim);
  // Peixe despescado por mês, pela curva de crescimento de cada lote (kg depois da perda na despesca).
  const despescas = fluxoMensal([...estudos.values()], hoje, previsao.fim);

  const peixes = d.reais.reduce((s, l) => s + l.peixes, 0);
  const engorda = viveiros.filter((g) => g.finalidade === "engorda");
  const capEngorda = engorda.reduce((s, g) => s + g.capacidade, 0);
  const peixesEngorda = previsao.ocupacoes.filter((o) => o.origem === "real" && o.etapa === "engorda" && o.inicio <= hoje && o.fim > hoje)
    .reduce((s, o) => s + (d.reais.find((l) => l.id === o.loteId)?.peixes ?? 0), 0);
  const proximo = previsao.lotes.filter((l) => l.origem !== "real" && l.povoamento >= hoje).sort((a, b) => a.povoamento.localeCompare(b.povoamento))[0];
  const conflitoPorLote = new Set(previsao.conflitos.map((c) => c.codigo));
  const renovacao = previsao.renovacao.map((r) => ({ ...r, situacao: situacaoRenovacao(r, hoje) }));
  const atrasadas = renovacao.filter((r) => r.situacao === "atrasada").length;
  const pendencias = atrasadas + renovacao.filter((r) => r.situacao === "urgente").length + previsao.conflitos.length;
  const passos = previsao.eventos.filter((e) => e.tipo !== "viveiro_livre").slice(0, 6);
  // Uma linha do tempo de um ano e meio cabe na tela sem virar listras; o resto do horizonte está nos gráficos.
  const fimLinha = [previsao.fim, somarDias(hoje, 540)].sort()[0];

  const linhasPlano: LinhaPlano[] = [
    ...d.planejados.map((l) => {
      const proj = previsao.lotes.find((x) => x.id === l.id);
      const at = (e: string) => proj?.etapas.find((x) => x.etapa === e)?.viveiroId ?? null;
      return {
        id: l.id, codigo: l.codigo, origem: "planejado" as const, situacao: l.situacao, data: l.data_povoamento, peixes: l.qtd_peixes,
        especieId: l.especie_id, alevinagem: l.viveiro_alevinagem_id, recria: l.viveiro_recria_id, engorda: l.viveiro_engorda_id,
        inicioEngorda: proj?.inicioEngorda ?? somarDias(l.data_povoamento, (p.semanasAlevinagem + p.semanasRecria) * 7),
        despesca: proj?.despesca ?? somarDias(l.data_povoamento, p.semanasCultivo * 7),
        observacoes: l.observacoes, conflito: conflitoPorLote.has(l.codigo),
        alevinagemPrevisto: at("alevinagem"), engordaPrevista: at("engorda"),
      };
    }),
    ...previsao.lotes.filter((l) => l.origem === "sugerido").slice(0, 3).map((l) => {
      const at = (e: string) => l.etapas.find((x) => x.etapa === e)?.viveiroId ?? null;
      return {
        id: l.id, codigo: l.codigo, origem: "sugerido" as const, situacao: "planejado", data: l.povoamento, peixes: l.peixes,
        especieId: l.especieId, alevinagem: at("alevinagem"), recria: at("recria"), engorda: at("engorda"),
        inicioEngorda: l.inicioEngorda, despesca: l.despesca, observacoes: null, conflito: false,
        alevinagemPrevisto: at("alevinagem"), engordaPrevista: at("engorda"),
      };
    }),
  ];
  const ano = hoje.slice(2, 4);
  const codigoSugerido = `L${ano}-${String(d.planejados.length + d.reais.length + 1).padStart(2, "0")}`;

  return (
    <div className="flex max-w-7xl flex-col gap-6">
      <Titulo
        descricao={resumoManejo(p)}
        acoes={<LinkBotao href="/planejamento/parametros" tamanho="sm">Ajustar manejo</LinkBotao>}
      >
        Planejamento
      </Titulo>
      <AbasPlanejamento atual="geral" />

      <Faixa colunas={4}>
        <Indicador rotulo="Peixes nos viveiros" valor={formatarInteiro(peixes)} detalhe={`${d.reais.length} ${d.reais.length === 1 ? "lote" : "lotes"} em cultivo`} href="/lotes" />
        <Indicador rotulo="Engorda ocupada" valor={capEngorda ? `${formatarInteiro(Math.round((peixesEngorda / capEngorda) * 100))}%` : "–"}
          detalhe={capEngorda ? `${formatarInteiro(peixesEngorda)} de ${formatarInteiro(capEngorda)} peixes de capacidade` : "Nenhum viveiro de engorda"} />
        <Indicador rotulo="Próximo povoamento" valor={proximo ? formatarData(proximo.povoamento) : "–"}
          detalhe={proximo ? `${proximo.codigo} · ${proximo.origem === "sugerido" ? "sugestão" : "planejado"}` : "Cadastre os viveiros e a fase de cada um"} />
        <Indicador rotulo="Pede atenção" valor={pendencias === 0 ? "Nada" : formatarInteiro(pendencias)} tom={atrasadas > 0 ? "perigo" : undefined}
          detalhe={pendencias === 0 ? "Plano em dia" : atrasadas > 0 ? `${atrasadas} ${atrasadas === 1 ? "viveiro vai ficar parado" : "viveiros vão ficar parados"}` : "Veja a renovação abaixo"} />
      </Faixa>

      {previsao.conflitos.length > 0 && (
        <Aviso tipo="alerta">
          <span className="block font-medium">{previsao.conflitos.length === 1 ? "Um ponto do plano para resolver" : `${previsao.conflitos.length} pontos do plano para resolver`}</span>
          {previsao.conflitos.slice(0, 3).map((c, i) => <span key={i} className="block">{c.codigo}: {c.texto}</span>)}
          {previsao.conflitos.length > 3 && <span className="block text-[13px]">e mais {previsao.conflitos.length - 3}.</span>}
        </Aviso>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Cartao titulo="Próximos passos">
          {passos.length === 0 ? <p className="text-sm text-texto-suave">Nada previsto no horizonte.</p> : (
            <ol className="-mx-1 flex flex-col">
              {passos.map((e, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2.5 text-sm [&+&]:border-t [&+&]:border-linha">
                  <span className="w-[5.5rem] shrink-0 tabular-nums text-texto-suave">{formatarData(e.data)}</span>
                  <Etiqueta tom={TOM_EVENTO[e.tipo]}>{NOME_EVENTO[e.tipo]}</Etiqueta>
                  <span className="min-w-0 basis-full sm:flex-1 sm:basis-0 sm:truncate" title={e.texto}><span className="font-medium">{e.codigo}</span> <span className="text-texto-suave">{e.texto}</span></span>
                </li>
              ))}
            </ol>
          )}
        </Cartao>

        <Cartao titulo="Renovação da engorda" descricao={`Até quando povoar os alevinos de cada viveiro, com ${p.vazioEngorda} dias de vazio.`}>
          {engorda.length === 0 ? (
            <p className="text-sm text-texto-suave">Nenhum viveiro de engorda. <Link href="/piscicultura" className={CLASSE_BOTAO_TEXTO}>Cadastre na Piscicultura</Link>.</p>
          ) : (
            <ul className="-mx-1 flex flex-col">
              {renovacao.map((r) => (
                <li key={r.viveiro.id} className="flex items-center gap-3 px-1 py-2.5 text-sm [&+&]:border-t [&+&]:border-linha">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.viveiro.nome}</span>
                    <span className="block text-[13px] text-texto-suave sm:truncate">
                      {r.atual ? `${r.atual.codigo} sai em ${formatarData(r.atual.fim)}` : "Vazio"}
                      {r.proximo ? ` · entra ${r.proximo.codigo}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block tabular-nums ${r.situacao === "atrasada" ? "font-semibold text-perigo" : r.situacao === "urgente" ? "font-semibold text-alerta" : ""}`}>
                      {formatarData(r.povoarAte)}
                    </span>
                    <span className="block text-xs text-texto-suave">
                      {r.situacao === "atrasada" ? (r.diasParado ? `${r.diasParado} dias parado` : "vai ficar parado") : r.situacao === "urgente" ? "sem reposição" : "povoar até"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <Cartao titulo="Linha do tempo dos viveiros" descricao="Passe o mouse ou toque numa barra para ver as datas.">
        {viveiros.length === 0 ? <p className="text-sm text-texto-suave">Nenhum viveiro ativo.</p> : (
          <LinhaDoTempo viveiros={viveiros} ocupacoes={previsao.ocupacoes} inicio={somarDias(hoje, -30)} fim={fimLinha} hoje={hoje} />
        )}
      </Cartao>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.015em]">Lotes planejados</h2>
          <p className="text-[13px] text-texto-suave">As sugestões caem nas próximas datas com alevinagem, recria e engorda livres. Toque numa para incluir no plano.</p>
        </div>
        <LotesPlanejados linhas={linhasPlano} especies={d.especies}
          viveiros={viveiros.map((g) => ({ id: g.id, nome: `${g.nome} (${NOME_FINALIDADE[g.finalidade]})`, finalidade: g.finalidade }))}
          podeEditar={pode("planejamento.editar")} codigoSugerido={codigoSugerido} />
      </section>

      {/* Os números mês a mês ficam um toque abaixo: quem quer o detalhe abre, quem quer o resumo não rola por eles. */}
      <details className="group vidro rounded-2xl border border-borda">
        <summary className="flex items-center gap-2 px-5 py-4 text-[15px] font-semibold sm:px-6">
          <ChevronRight aria-hidden size={16} strokeWidth={2} className="text-texto-suave transition-transform duration-200 ease-out group-open:rotate-90" />
          Peixes e despescas mês a mês
        </summary>
        <div className="grid gap-6 px-5 pb-5 sm:px-6 sm:pb-6 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-[13px] text-texto-suave">Peixes por fase. A linha tracejada é a capacidade dos viveiros de engorda.</p>
            <ColunasEmpilhadas rotulo="Peixes por fase em cada mês" unidade="peixes" rotulos={porMes.map((m) => rotuloMes(m.mes))}
              referencia={capEngorda ? { nome: "Capacidade da engorda", valor: capEngorda, cor: "var(--laranja)" } : undefined}
              series={[
                { nome: "Engorda", cor: "var(--verde)", valores: porMes.map((m) => m.engorda) },
                { nome: "Recria", cor: "var(--azul)", valores: porMes.map((m) => m.recria) },
                { nome: "Alevinagem", cor: "var(--violeta)", valores: porMes.map((m) => m.alevinagem) },
              ]} />
          </div>
          <div>
            <p className="mb-3 text-[13px] text-texto-suave">Peixe despescado por mês, pelo peso da curva de crescimento e já sem a perda na despesca.</p>
            <ColunasEmpilhadas rotulo="Peixe despescado previsto por mês" unidade="kg" rotulos={despescas.map((m) => rotuloMes(m.mes))}
              series={[{ nome: "Peixe despescado", cor: "var(--azul)", valores: despescas.map((m) => m.kg) }]} />
          </div>
        </div>
      </details>
    </div>
  );
}
