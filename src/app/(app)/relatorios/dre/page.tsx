import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Campo, Cartao, classeBotao, Selecao, Titulo } from "@/components/ui";
import { carregarDre, lerAno, lerRegime } from "@/lib/consultas-relatorio";
import { getEmpresaAtual } from "@/lib/empresa";
import { deslocarMes, formatarMoeda, hojeISO, rotuloMes } from "@/lib/formato";
import { analiseHorizontal, analiseVertical, type LinhaDre } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";
import { AbasRelatorio } from "../abas";
import { fecharMes, reabrirMes } from "./actions";
import { exigirAcesso } from "@/lib/permissoes";
import { ordenado } from "@/lib/ordem";

const pctLinha = (v: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v)}%`;
// downloads são arquivos, não páginas: <a download> em vez de <Link>
const exportar = (consulta: string) => `/relatorios/exportar?${consulta}`;
const compacto = (c: number) => (c === 0 ? "–" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(c / 100));
const pct = (v: number | null) => (v === null ? "–" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v)}%`);

const VISOES = { valores: "Valores", av: "Análise vertical", ah: "Análise horizontal" } as const;
type Visao = keyof typeof VISOES;

// O que vai em cada célula da DRE conforme a visão escolhida
function celulas(valores: number[], receita: number[], visao: Visao): string[] {
  if (visao === "av") return analiseVertical(valores, receita).map(pct);
  if (visao === "ah") return analiseHorizontal(valores).map(pct);
  return valores.map(compacto);
}

export default async function PaginaDre({ searchParams }: PageProps<"/relatorios/dre">) {
  await exigirAcesso("relatorios");
  const filtros = await searchParams;
  const regime = lerRegime(filtros.regime);
  const { atual } = await getEmpresaAtual();
  const anoAtual = Number(hojeISO(atual.fuso).slice(0, 4));
  const ano = lerAno(filtros.ano, anoAtual);
  const cc = typeof filtros.cc === "string" ? filtros.cc : "";
  const visao: Visao = filtros.ver === "av" || filtros.ver === "ah" ? filtros.ver : "valores";
  const supabase = await createClient();

  const [dre, { data: centros }, { data: fechados }] = await Promise.all([
    carregarDre(atual.id, regime, ano, cc || undefined),
    supabase.from("centros_custo").select("id, nome, parent_id, ordem").eq("empresa_id", atual.id).order("ordem").order("nome").then(ordenado),
    supabase.from("periodos_fechados").select("mes, fechado_em").eq("empresa_id", atual.id).order("mes", { ascending: false }).limit(24),
  ]);

  const params = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ regime, ano: String(ano), ...(cc ? { cc } : {}), ...(visao !== "valores" ? { ver: visao } : {}), ...extra });
    return p.toString();
  };
  const receita = dre.receita;
  const fechadosSet = new Set((fechados ?? []).map((f) => f.mes));
  const mesPassado = deslocarMes(hojeISO(atual.fuso), -1);

  return (
    <div className="flex max-w-7xl flex-col gap-6">
      <Titulo descricao="DRE gerencial do ano, de janeiro a dezembro, no mesmo formato do NIBO. Caixa mostra quando o dinheiro entrou ou saiu; competência mostra o mês a que a receita ou despesa pertence.">
        DRE
      </Titulo>
      <AbasRelatorio atual="/relatorios/dre" />

      <div className="flex flex-wrap items-end gap-3">
        <nav aria-label="Regime" className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-elevado/70 p-0.5 text-[13px] whitespace-nowrap">
          {(["caixa", "competencia"] as const).map((r) => (
            <Link key={r} href={`/relatorios/dre?${params({ regime: r })}`} aria-current={regime === r ? "page" : undefined}
              className={`rounded-md px-3 py-1 font-medium transition-colors duration-150 ${regime === r ? "bg-superficie text-texto shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-texto-suave hover:text-texto"}`}>
              {r === "caixa" ? "Caixa" : "Competência"}
            </Link>
          ))}
        </nav>
        <nav aria-label="Visão" className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-elevado/70 p-0.5 text-[13px] whitespace-nowrap">
          {(Object.keys(VISOES) as Visao[]).map((v) => (
            <Link key={v} href={`/relatorios/dre?${params({ ver: v })}`} aria-current={visao === v ? "page" : undefined}
              className={`rounded-md px-3 py-1 font-medium transition-colors duration-150 ${visao === v ? "bg-superficie text-texto shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-texto-suave hover:text-texto"}`}>{VISOES[v]}</Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="regime" value={regime} />
          {visao !== "valores" && <input type="hidden" name="ver" value={visao} />}
          <Selecao rotulo="Ano" id="ano" name="ano" defaultValue={String(ano)}>
            {Array.from({ length: 6 }, (_, i) => anoAtual + 1 - i).map((a) => <option key={a} value={a}>{a}</option>)}
          </Selecao>
          <Selecao rotulo="Centro de custo" id="cc" name="cc" defaultValue={cc}>
            <option value="">Todos</option>
            {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
          <button type="submit" className={classeBotao("secundario")}>Aplicar</button>
        </form>
        <div className="flex h-10 items-center gap-3 text-sm">
          <a download href={exportar(params({ relatorio: "resultado", formato: "xlsx" }))} className={classeBotao("secundario", "sm")}>Exportar Excel</a>
          <a download href={exportar(params({ relatorio: "resultado", formato: "pdf" }))} className={classeBotao("secundario", "sm")}>Exportar PDF</a>
          <a download href={exportar(params({ relatorio: "resultado", formato: "csv" }))} className={classeBotao("secundario", "sm")}>CSV</a>
        </div>
      </div>

      {dre.vazio ? (
        <p className="text-sm text-texto-suave">Nenhum lançamento em {ano}.</p>
      ) : (
        <div className="relative overflow-x-auto vidro rounded-2xl border border-borda">
          <table className="w-full text-right text-xs tabular-nums">
            <thead className="bg-elevado/40 text-texto-suave">
              <tr>
                <th className={`${COLUNA_FIXA} px-3 py-2 text-left font-medium`}>Resultado</th>
                {dre.meses.map((x) => <th key={x} className="px-2 py-2 font-medium">{rotuloMes(x)}{fechadosSet.has(x) && " 🔒"}</th>)}
                <th className="px-3 py-2 font-medium">{ano}</th>
              </tr>
            </thead>
            <tbody>
              {dre.linhas.map((l) => <LinhaDreTabela key={`${l.tipo}-${l.chave}`} l={l} receita={receita} visao={visao} />)}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Fechamento de mês">
          <p className="mb-3 text-sm text-texto-suave">Depois de conciliar o extrato e conferir com o contador, feche o mês para ninguém alterar pagamentos e recebimentos dele.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormAcao acao={fecharMes} botao="Fechar mês" limparAoSalvar={false}>
              <Campo rotulo="Mês" id="fechar_mes" name="mes" type="month" defaultValue={mesPassado} required />
            </FormAcao>
            <FormAcao acao={reabrirMes} botao="Reabrir" variante="secundario" limparAoSalvar={false}>
              <Selecao rotulo="Mês fechado" id="reabrir_mes" name="mes" required defaultValue="">
                <option value="" disabled>Escolha…</option>
                {(fechados ?? []).map((f) => <option key={f.mes} value={f.mes.slice(0, 7)}>{rotuloMes(f.mes)}</option>)}
              </Selecao>
            </FormAcao>
          </div>
        </Cartao>
      </div>
    </div>
  );
}

// Coluna de nomes presa à esquerda: fundo opaco e acima das outras células, senão os números
// passam por baixo e aparecem através dela ao rolar a tabela para o lado (no celular).
const COLUNA_FIXA = "sticky left-0 z-10 min-w-36 bg-solido shadow-[1px_0_0_var(--borda)]";

const soma = (v: number[]) => v.reduce((s, x) => s + x, 0);

function totalLinha(valores: number[], receita: number[], visao: Visao) {
  if (visao === "av") return pct(analiseVertical([soma(valores)], [soma(receita)])[0]);
  if (visao === "ah") return "";
  return formatarMoeda(soma(valores));
}

const ESTILO: Record<LinhaDre["tipo"], string> = {
  grupo: "border-t border-borda bg-elevado/40 font-semibold",
  subgrupo: "border-t border-borda/50 font-medium",
  categoria: "border-t border-borda/50",
  subtotal: "border-t-2 border-borda font-semibold",
  percentual: "text-texto-suave",
  resultado: "border-t-2 border-borda bg-elevado/40 font-semibold",
};
const RECUO = ["pl-3", "pl-6", "pl-10"];

function LinhaDreTabela({ l, receita, visao }: { l: LinhaDre; receita: number[]; visao: Visao }) {
  // a linha de % já é percentual: não passa pelas análises vertical e horizontal
  const percentual = l.tipo === "percentual";
  const cels = percentual ? l.valores.map((v, i) => (receita[i] ? pctLinha(v) : "–")) : celulas(l.valores, receita, visao);
  const total = percentual ? pctLinha(l.total) : totalLinha(l.valores, receita, visao);
  return (
    <tr className={ESTILO[l.tipo]}>
      <td className={`${COLUNA_FIXA} py-1.5 pr-3 text-left ${RECUO[l.nivel]}`}>{l.nome}</td>
      {cels.map((c, i) => <td key={i} className={`px-2 py-1.5 ${!percentual && l.valores[i] < 0 ? "text-perigo" : ""}`}>{c}</td>)}
      <td className={`px-3 py-1.5 ${!percentual && l.total < 0 ? "text-perigo" : ""}`}>{total}</td>
    </tr>
  );
}
