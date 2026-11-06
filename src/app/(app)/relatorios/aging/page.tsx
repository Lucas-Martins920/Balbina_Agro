import Link from "next/link";
import { Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarMoeda } from "@/lib/formato";
import { FAIXAS_AGING, montarAging, type LinhaAging } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";
import { lerTodas } from "@/lib/supabase/todas";
import { AbasRelatorio } from "../abas";
import { exigirAcesso } from "@/lib/permissoes";

export default async function PaginaAging({ searchParams }: PageProps<"/relatorios/aging">) {
  await exigirAcesso("relatorios");
  const filtros = await searchParams;
  const tipo = filtros.tipo === "pagar" ? "pagar" : "receber";
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data, error } = await lerTodas(() => supabase.from("aging_titulos").select("contato_id, contato_nome, faixa, saldo_cents")
    .eq("empresa_id", atual.id).eq("tipo", tipo).order("contato_id").order("contato_nome").order("faixa").order("saldo_cents"));
  if (error) throw new Error(`Erro ao carregar o aging: ${error.message}`);
  const a = montarAging((data ?? []) as LinhaAging[]);
  const atrasado = a.total - a.totais[0];

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo descricao="Saldo em aberto por faixa de atraso, contado a partir do vencimento.">Relatórios</Titulo>
      <AbasRelatorio atual="/relatorios/aging" />

      <nav aria-label="Tipo" className="inline-flex gap-0.5 self-start rounded-lg bg-elevado/70 p-0.5 text-[13px]">
        {([["receber", "A receber"], ["pagar", "A pagar"]] as const).map(([t, n]) => (
          <Link key={t} href={`/relatorios/aging?tipo=${t}`} aria-current={tipo === t ? "page" : undefined}
            className={`rounded-md px-3 py-1 font-medium transition-colors duration-150 ${tipo === t ? "bg-superficie text-texto shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-texto-suave hover:text-texto"}`}>{n}</Link>
        ))}
      </nav>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {a.faixas.map((f, i) => (
          <div key={f} className="vidro rounded-2xl border border-borda p-3">
            <dt className="text-xs text-texto-suave">{FAIXAS_AGING[f]}</dt>
            <dd className={`tabular-nums font-semibold ${i > 0 && a.totais[i] > 0 ? "text-perigo" : ""}`}>{formatarMoeda(a.totais[i])}</dd>
          </div>
        ))}
        <div className="vidro rounded-2xl border border-borda p-3">
          <dt className="text-xs text-texto-suave">Em atraso</dt>
          <dd className="tabular-nums font-semibold">{a.total ? `${Math.round((atrasado / a.total) * 100)}%` : "–"}</dd>
        </div>
      </dl>

      {a.contatos.length === 0 ? (
        <p className="text-sm text-texto-suave">Nada em aberto.</p>
      ) : (
        <div className="relative overflow-x-auto vidro rounded-2xl border border-borda">
          <table className="w-full text-right text-sm tabular-nums">
            <thead className="bg-elevado/40 text-xs text-texto-suave">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{tipo === "receber" ? "Cliente" : "Fornecedor"}</th>
                {a.faixas.map((f) => <th key={f} className="px-3 py-2 font-medium">{FAIXAS_AGING[f]}</th>)}
                <th className="px-3 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {a.contatos.map((c) => (
                <tr key={c.id} className="border-t border-borda/50">
                  <td className="px-3 py-1.5 text-left">{c.nome}</td>
                  {c.valores.map((v, i) => <td key={i} className={`px-3 py-1.5 ${i > 0 && v > 0 ? "text-perigo" : ""}`}>{v ? formatarMoeda(v) : "–"}</td>)}
                  <td className="px-3 py-1.5 font-medium">{formatarMoeda(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
