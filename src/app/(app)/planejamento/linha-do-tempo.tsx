import Link from "next/link";
import type { CSSProperties } from "react";
import { classeBotao, Segmentos, Vazio } from "@/components/ui";
import { formatarData } from "@/lib/formato";
import { NOME_ETAPA, NOME_FINALIDADE, dia, somarMeses, type Viveiro, type Ocupacao, type Origem } from "@/lib/planejamento";

export { NOME_FINALIDADE };

export function AbasPlanejamento({ atual }: { atual: "geral" | "viabilidade" | "parametros" }) {
  return (
    <Segmentos rotulo="Planejamento" opcoes={[
      { href: "/planejamento", nome: "Lotes e viveiros", ativo: atual === "geral" },
      { href: "/planejamento/viabilidade", nome: "Viabilidade", ativo: atual === "viabilidade" },
      { href: "/planejamento/parametros", nome: "Parâmetros e custos", ativo: atual === "parametros" },
    ]} />
  );
}

// Enquanto a piscicultura não cadastra o próprio manejo, o planejamento não supõe prazos: pede o cadastro.
export function SemManejo() {
  return (
    <Vazio acao={<Link href="/planejamento/parametros" className={classeBotao("secundario", "sm")}>Cadastrar o manejo da piscicultura</Link>}>
      Para prever transferências, renovação e viabilidade, informe o manejo da sua piscicultura: quantas semanas o lote fica na alevinagem e na
      recria, com quantas semanas de cultivo vai à despesca, o vazio sanitário de cada viveiro e de quanto em quanto tempo entra um lote novo.
    </Vazio>
  );
}

const ORDEM: Record<string, number> = { alevinagem: 0, alevinagem_recria: 1, recria: 2, engorda: 3 };

const COR: Record<Origem, string> = {
  real: "bg-verde text-white",
  planejado: "bg-azul text-white",
  sugerido: "border border-dashed border-violeta/70 bg-violeta/10 text-texto",
};

// Gráfico de Gantt dos viveiros: cada barra é um lote no viveiro; a faixa listrada depois é o vazio sanitário.
export function LinhaDoTempo({ viveiros, ocupacoes, inicio, fim, hoje }: {
  viveiros: (Viveiro & { setor: string })[]; ocupacoes: Ocupacao[]; inicio: string; fim: string; hoje: string;
}) {
  const a = dia(inicio), b = dia(fim), total = Math.max(1, b - a);
  const pos = (d: string) => Math.min(100, Math.max(0, ((dia(d) - a) / total) * 100));
  const meses: string[] = [];
  for (let m = `${inicio.slice(0, 7)}-01`; m <= fim; m = somarMeses(m, 1)) if (m >= inicio) meses.push(m);
  const ordenados = [...viveiros].sort((x, y) => ORDEM[x.finalidade] - ORDEM[y.finalidade] || x.nome.localeCompare(y.nome, "pt-BR", { numeric: true }));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-x-auto">
        <div className="relative min-w-[760px]">
          <div className="relative ml-36 h-6 border-b border-linha text-[11px] text-texto-suave">
            {meses.map((m) => (
              <span key={m} className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: `${pos(m)}%` }}>
                {m.slice(5, 7) === "01" ? m.slice(0, 4) : new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(`${m}T00:00:00Z`)).replace(".", "")}
              </span>
            ))}
          </div>
          <div className="relative">
            <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 left-36">
              {meses.map((m) => <span key={m} className="absolute inset-y-0 border-l border-linha/60" style={{ left: `${pos(m)}%` }} />)}
              <span className="absolute inset-y-0 border-l-2 border-marca" style={{ left: `${pos(hoje)}%` }} title="Hoje" />
            </div>
            {ordenados.map((g) => {
              const doViveiro = ocupacoes.filter((o) => o.viveiroId === g.id && o.livre > inicio && o.inicio < fim);
              return (
                <div key={g.id} className="flex h-9 items-center border-b border-linha/60">
                  <div className="w-36 shrink-0 truncate pr-2 text-[13px]">
                    <span className="font-medium">{g.nome}</span>
                    {g.nome !== NOME_FINALIDADE[g.finalidade] && <span className="block truncate text-[11px] text-texto-suave">{NOME_FINALIDADE[g.finalidade]}</span>}
                  </div>
                  <div className="relative h-6 flex-1">
                    {doViveiro.map((o) => {
                      const x1 = pos(o.inicio), x2 = pos(o.fim), x3 = pos(o.livre);
                      return (
                        <div key={`${o.loteId}-${o.inicio}`}>
                          {x2 > x1 && (
                            <div
                              className={`crescer-x absolute inset-y-0.5 flex items-center overflow-hidden rounded-full px-2 text-[11px] font-medium whitespace-nowrap ${COR[o.origem]}`}
                              style={{ left: `${x1}%`, width: `${x2 - x1}%`, "--i": Math.round(x1 / 6) } as CSSProperties}
                              title={`${o.codigo} · ${NOME_ETAPA[o.etapa]} · ${formatarData(o.inicio)} a ${formatarData(o.fim)}`}
                            >
                              {o.codigo}
                            </div>
                          )}
                          {x3 > x2 && (
                            <div
                              className="absolute inset-y-1 rounded-sm bg-[repeating-linear-gradient(135deg,var(--amarelo)_0_2px,transparent_2px_6px)] opacity-60"
                              style={{ left: `${x2}%`, width: `${x3 - x2}%` }}
                              title={`Vazio sanitário até ${formatarData(o.livre)}`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-suave">
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-full bg-verde" />Lote povoado</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-full bg-azul" />Lote planejado</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-full border border-dashed border-violeta/70 bg-violeta/10" />Sugestão do sistema</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-[3px] bg-[repeating-linear-gradient(135deg,var(--amarelo)_0_2px,transparent_2px_4px)]" />Vazio sanitário</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 border-l-2 border-marca" />Hoje</li>
      </ul>
    </div>
  );
}
