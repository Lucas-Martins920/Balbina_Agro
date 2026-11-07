import Link from "next/link";
import { BotaoLancamento } from "@/components/lancamento";
import { RefreshCw } from "lucide-react";
import { Campo, Cartao, classeBotao, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { custoKgMes, numeroKg, textoKg } from "@/lib/pescado";
import { deslocarMes, formatarData, formatarInteiro, formatarMoeda, formatarNumero, hojeISO } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { recalcularCustos } from "./actions";
import { exigirAcesso } from "@/lib/permissoes";

const COMPONENTES = [
  ["racao_cents", "Ração"],
  ["alevinos_cents", "Alevinos e juvenis"],
  ["sanidade_cents", "Sanidade"],
  ["mao_obra_cents", "Mão de obra"],
  ["energia_cents", "Energia"],
  ["embalagem_cents", "Embalagem"],
  ["outros_diretos_cents", "Outros diretos"],
  ["indiretos_rateados_cents", "Indiretos rateados"],
] as const;

type Linha = Record<(typeof COMPONENTES)[number][0], number> & {
  lote_id: string; lote_codigo: string; mes: string; peixes_medios: number; biomassa_inicio_kg: number; biomassa_fim_kg: number;
  kg_despescados: number; ganho_kg: number; racao_kg: number; custo_total_cents: number; custo_kg_cents: number | null;
  conversao_alimentar: number | null; custo_kg_ciclo_cents: number | null; preco_kg_cents: number | null; calculado_em: string;
};

export default async function PaginaCustoKg({ searchParams }: PageProps<"/custo-do-kg">) {
  await exigirAcesso("custo-do-kg");
  const filtros = await searchParams;
  const { atual } = await getEmpresaAtual();
  const mesPassado = deslocarMes(hojeISO(atual.fuso), -1);
  const mes = typeof filtros.mes === "string" && /^\d{4}-\d{2}$/.test(filtros.mes) ? filtros.mes : mesPassado;
  const supabase = await createClient();

  const [{ data: linhas }, { data: historico }, { data: margens }] = await Promise.all([
    supabase.from("custo_kg_lote").select("*").eq("empresa_id", atual.id).eq("mes", `${mes}-01`).order("lote_codigo"),
    supabase.from("custo_kg_lote").select("mes, custo_total_cents, ganho_kg, preco_kg_cents").eq("empresa_id", atual.id).order("mes").limit(1000),
    supabase.from("margem_cliente_mes").select("*").eq("empresa_id", atual.id).eq("mes", `${mes}-01`).order("margem_cents", { ascending: false }),
  ]);
  const lista = (linhas ?? []) as unknown as Linha[];
  // custo do kg produzido: todo o custo dos lotes ÷ a biomassa que ganharam no mês (como a margem por cliente)
  const doMes = custoKgMes(lista);
  const custoKg = doMes?.kgCents ?? null;
  const preco = lista.find((l) => l.preco_kg_cents !== null)?.preco_kg_cents ?? null;
  const despescado = lista.reduce((s, l) => s + Number(l.kg_despescados), 0);
  const racao = lista.reduce((s, l) => s + Number(l.racao_kg), 0);

  const porMes = new Map<string, { linhas: { custo_total_cents: number; ganho_kg: number }[]; preco: number | null }>();
  for (const h of historico ?? []) {
    const v = porMes.get(h.mes) ?? { linhas: [], preco: h.preco_kg_cents === null ? null : Number(h.preco_kg_cents) };
    v.linhas.push(h);
    porMes.set(h.mes, v);
  }
  const serie = [...porMes.entries()]
    .map(([m, v]) => [m, { custo: custoKgMes(v.linhas)?.kgCents ?? null, preco: v.preco }] as const)
    .filter(([, v]) => v.custo !== null)
    .slice(-12) as (readonly [string, { custo: number; preco: number | null }])[];
  const maxSerie = Math.max(1, ...serie.map(([, v]) => Math.max(v.custo, v.preco ?? 0)));

  return (
    <div className="flex max-w-7xl flex-col gap-6">
      <Titulo
        descricao="Quanto custa cada kg de peixe produzido, lote a lote, com o que foi lançado no financeiro pela competência."
        acoes={
          <BotaoLancamento rotulo="Recalcular" titulo="Recalcular o custo" acao={recalcularCustos} botao="Recalcular" variante="secundario" icone={<RefreshCw size={16} strokeWidth={1.75} aria-hidden />}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Até o mês" id="ate" name="ate" type="month" defaultValue={mes} required />
            <Selecao rotulo="Período" id="meses" name="meses" defaultValue="12">
              <option value="1">Só este mês</option>
              <option value="3">3 meses</option>
              <option value="6">6 meses</option>
              <option value="12">12 meses</option>
              <option value="24">24 meses</option>
            </Selecao>
          </div>
          <p className="text-xs text-texto-suave">
            Recalcule depois de lançar ou corrigir contas de um mês. Ração sem centro de custo é rateada pelo consumo de cada lote; o resto, pela biomassa de cada lote (kg de peixe por dia).
            Para jogar um custo direto num lote, use o centro de custo dele.
          </p>
        </BotaoLancamento>
        }
      >Custo do kg</Titulo>

      <div className="flex flex-wrap items-end gap-3">
        <form className="flex items-end gap-2">
          <Campo rotulo="Mês" id="mes" name="mes" type="month" defaultValue={mes} />
          <button type="submit" className={classeBotao("secundario")}>Ver</button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Cartao><p className="text-sm text-texto-suave">Custo do kg produzido</p><p className="text-2xl font-semibold tabular-nums">{custoKg === null ? "–" : formatarMoeda(custoKg)}</p></Cartao>
        <Cartao><p className="text-sm text-texto-suave">Preço médio do kg vendido</p><p className="text-2xl font-semibold tabular-nums">{preco === null ? "–" : formatarMoeda(preco)}</p></Cartao>
        <Cartao>
          <p className="text-sm text-texto-suave">Margem por kg</p>
          <p className={`text-2xl font-semibold tabular-nums ${preco !== null && custoKg !== null && preco < custoKg ? "text-perigo" : ""}`}>
            {preco === null || custoKg === null ? "–" : formatarMoeda(preco - custoKg)}
          </p>
        </Cartao>
        <Cartao>
          <p className="text-sm text-texto-suave">Biomassa produzida</p>
          <p className="text-2xl font-semibold tabular-nums">{doMes ? textoKg(doMes.ganhoKg, 0) : "–"}</p>
          <p className="text-xs text-texto-suave">
            {textoKg(despescado, 0)} despescados{doMes && racao > 0 ? ` · conversão ${formatarNumero(racao / doMes.ganhoKg, 2)}` : ""}
          </p>
        </Cartao>
      </div>

      {lista.length === 0 ? (
        <Cartao>
          <p className="text-sm">Custo de {mes.split("-").reverse().join("/")} ainda não calculado. Use o recálculo abaixo depois de lançar as contas do mês.</p>
        </Cartao>
      ) : (
        <div className="relative overflow-x-auto vidro rounded-2xl border border-borda">
          <table className="w-full text-right text-sm tabular-nums">
            <thead className="bg-elevado/40 text-xs text-texto-suave">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Lote</th>
                <th className="px-2 py-2 font-medium">Peixes</th>
                <th className="px-2 py-2 font-medium">Biomassa (kg)</th>
                <th className="px-2 py-2 font-medium">Ganho (kg)</th>
                {COMPONENTES.map(([, n]) => <th key={n} className="px-2 py-2 font-medium">{n}</th>)}
                <th className="px-2 py-2 font-medium">Total</th>
                <th className="px-2 py-2 font-medium">R$/kg</th>
                <th className="px-2 py-2 font-medium" title="kg de ração por kg de peixe ganho">Conversão</th>
                <th className="px-3 py-2 font-medium" title="Custo acumulado do lote ÷ (biomassa atual + despescado)">R$/kg no ciclo</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => (
                <tr key={l.lote_id} className="border-t border-borda">
                  <td className="px-3 py-2 text-left">
                    <Link href={`/lotes/${l.lote_id}`} className="font-medium hover:underline">{l.lote_codigo}</Link>
                    {Number(l.kg_despescados) > 0 && <span className="block text-xs text-texto-suave">{textoKg(l.kg_despescados, 0)} despescados</span>}
                  </td>
                  <td className="px-2 py-2">{formatarInteiro(Math.round(Number(l.peixes_medios)))}</td>
                  <td className="px-2 py-2">{numeroKg(l.biomassa_inicio_kg, 0)} → {numeroKg(l.biomassa_fim_kg, 0)}</td>
                  <td className={`px-2 py-2 ${Number(l.ganho_kg) < 0 ? "text-perigo" : ""}`}>{numeroKg(l.ganho_kg, 0)}</td>
                  {COMPONENTES.map(([c]) => <td key={c} className="px-2 py-2">{formatarMoeda(Number(l[c]))}</td>)}
                  <td className="px-2 py-2 font-medium">{formatarMoeda(Number(l.custo_total_cents))}</td>
                  <td className="px-2 py-2 font-semibold">{l.custo_kg_cents === null ? "–" : formatarMoeda(Number(l.custo_kg_cents))}</td>
                  <td className="px-2 py-2">{l.conversao_alimentar === null ? "–" : formatarNumero(Number(l.conversao_alimentar), 2)}</td>
                  <td className="px-3 py-2">{l.custo_kg_ciclo_cents === null ? "–" : formatarMoeda(Number(l.custo_kg_ciclo_cents))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-texto-suave">
            Calculado em {formatarData(lista[0].calculado_em)}. Ganho = biomassa no fim − no início + despescado; a biomassa vem da última biometria e da curva de crescimento.
            Despesas administrativas ficam fora do custo do kg e aparecem no DRE.
          </p>
        </div>
      )}

      {serie.length > 1 && (
        <Cartao titulo="Custo do kg × preço vendido (últimos meses)">
          <div className="flex items-end gap-3 overflow-x-auto pb-2" role="img" aria-label="Custo do kg produzido e preço do kg vendido por mês">
            {serie.map(([mesSerie, v]) => (
              <div key={mesSerie} className="flex min-w-12 flex-col items-center gap-1 text-xs">
                <div className="flex h-32 items-end gap-1">
                  <div className="w-4 rounded-t bg-perigo" style={{ height: `${(v.custo / maxSerie) * 100}%` }} title={`custo ${formatarMoeda(v.custo)}/kg`} />
                  {v.preco && <div className="w-4 rounded-t bg-marca" style={{ height: `${(v.preco / maxSerie) * 100}%` }} title={`preço ${formatarMoeda(v.preco)}/kg`} />}
                </div>
                <span className="text-texto-suave">{mesSerie.slice(5, 7)}/{mesSerie.slice(2, 4)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-texto-suave"><span className="text-perigo">■</span> custo do kg produzido · <span className="text-marca">■</span> preço médio do kg vendido</p>
        </Cartao>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Margem por cliente no mês</h2>
        <Tabela cabecalho={["Cliente", "Pedidos", "Kg", "Receita", "Preço/kg", "Custo/kg", "Margem"]} total={margens?.length ?? 0} vazio="Nenhum pedido faturado no mês.">
          {(margens ?? []).map((g) => (
            <tr key={g.cliente_id} className="tabular-nums">
              <td>{g.cliente_nome}</td>
              <td>{g.pedidos}</td>
              <td>{numeroKg(g.kg, 3)}</td>
              <td>{formatarMoeda(Number(g.receita_cents))}</td>
              <td>{g.preco_kg_cents === null ? "–" : formatarMoeda(Number(g.preco_kg_cents))}</td>
              <td>{g.custo_kg_cents === null ? "–" : formatarMoeda(Number(g.custo_kg_cents))}</td>
              <td className={Number(g.margem_cents) < 0 ? "font-semibold text-perigo" : "font-medium"}>{g.custo_kg_cents === null ? "–" : formatarMoeda(Number(g.margem_cents))}</td>
            </tr>
          ))}
        </Tabela>
      </section>
    </div>
  );
}
