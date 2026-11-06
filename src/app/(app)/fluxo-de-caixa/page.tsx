import Link from "next/link";
import { ChartLine } from "lucide-react";
import { GraficoLinha } from "@/components/graficos";
import { Cartao, Faixa, Indicador, Segmentos, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { semanasFluxo } from "@/lib/fluxo";
import { somarDias } from "@/lib/formato";
import { formatarData, formatarMoeda, hojeISO } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { lerTodas } from "@/lib/supabase/todas";
import { exigirAcesso } from "@/lib/permissoes";

const HORIZONTES = [30, 60, 90, 180];

export default async function PaginaFluxo({ searchParams }: PageProps<"/fluxo-de-caixa">) {
  await exigirAcesso("fluxo-de-caixa");
  const filtros = await searchParams;
  const dias = HORIZONTES.includes(Number(filtros.dias)) ? Number(filtros.dias) : 90;
  const { atual } = await getEmpresaAtual();
  const hoje = hojeISO(atual.fuso);
  const ate = somarDias(hoje, dias);
  const supabase = await createClient();

  const [{ data: saldos }, { data: itens }] = await Promise.all([
    supabase.from("saldos_contas").select("saldo_cents, tipo").eq("empresa_id", atual.id).eq("arquivada", false),
    lerTodas(() => supabase.from("fluxo_previsto").select("*").eq("empresa_id", atual.id).lte("data", ate).order("data").order("agendamento_id")),
  ]);

  const saldoAtual = (saldos ?? []).filter((s) => s.tipo !== "cartao_credito").reduce((t, s) => t + Number(s.saldo_cents), 0);
  const lista = (itens ?? []).map((i) => ({ ...i, valor_cents: Number(i.valor_cents) }));
  const semanas = semanasFluxo(saldoAtual, hoje, ate, lista);
  const vencidos = lista.filter((i) => i.vencido);
  const aReceberVencido = vencidos.filter((i) => i.valor_cents > 0).reduce((s, i) => s + i.valor_cents, 0);
  const aPagarVencido = vencidos.filter((i) => i.valor_cents < 0).reduce((s, i) => s + i.valor_cents, 0);
  const menor = semanas.reduce((m, s) => (s.saldo < m.saldo ? s : m), semanas[0]);
  const maximo = Math.max(1, ...semanas.map((s) => Math.abs(s.saldo)));

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo descricao={`Saldo hoje: ${formatarMoeda(saldoAtual)} · previsto em ${formatarData(ate)}: ${formatarMoeda(semanas.at(-1)?.saldo ?? saldoAtual)}`}>
        Fluxo de caixa
      </Titulo>

      <Segmentos rotulo="Horizonte" opcoes={HORIZONTES.map((h) => ({ href: `/fluxo-de-caixa?dias=${h}`, nome: `${h} dias`, ativo: h === dias }))} />

      <Faixa colunas={3}>
        <Indicador
          rotulo="Menor saldo previsto"
          valor={formatarMoeda(menor?.saldo ?? saldoAtual)}
          tom={menor && menor.saldo < 0 ? "perigo" : undefined}
          detalhe={menor ? `semana de ${formatarData(menor.inicio)}` : undefined}
        />
        <Indicador rotulo="A receber vencido" valor={formatarMoeda(aReceberVencido)} detalhe="entra na projeção como se chegasse hoje" />
        <Indicador
          rotulo="A pagar vencido"
          valor={formatarMoeda(aPagarVencido)}
          tom={aPagarVencido > 0 ? "perigo" : undefined}
          detalhe="entra na projeção como se saísse hoje"
        />
      </Faixa>

      <Cartao titulo="Saldo previsto" descricao="Semana a semana, com o que está a pagar e a receber" icone={ChartLine} cor="azul">
        <GraficoLinha
          rotulo="Saldo previsto por semana"
          cor="var(--azul)"
          pontos={[{ rotulo: "Hoje", valor: saldoAtual }, ...semanas.map((s) => ({ rotulo: `até ${formatarData(s.fim).slice(0, 5)}`, valor: s.saldo }))]}
        />
      </Cartao>

      <Tabela cabecalho={["Semana", "Entradas", "Saídas", "Saldo previsto", ""]} total={semanas.length} direita={["Entradas", "Saídas", "Saldo previsto"]}>
        {semanas.map((s) => (
          <tr key={s.inicio}>
            <td className="whitespace-nowrap tabular-nums">{formatarData(s.inicio)} a {formatarData(s.fim)}</td>
            <td className={`whitespace-nowrap text-right tabular-nums ${s.entradas ? "text-positivo" : "text-texto-suave"}`}>{s.entradas ? `+${formatarMoeda(s.entradas)}` : "–"}</td>
            <td className={`whitespace-nowrap text-right tabular-nums ${s.saidas ? "" : "text-texto-suave"}`}>{s.saidas ? `−${formatarMoeda(Math.abs(s.saidas))}` : "–"}</td>
            <td className={`whitespace-nowrap text-right tabular-nums font-medium ${s.saldo < 0 ? "text-perigo" : ""}`}>{formatarMoeda(s.saldo)}</td>
            <td className="w-1/3">
              <div className="h-1.5 rounded-full bg-elevado/70" aria-hidden>
                <div className={`h-1.5 rounded-full ${s.saldo < 0 ? "bg-perigo" : "bg-marca"}`} style={{ width: `${(Math.abs(s.saldo) / maximo) * 100}%` }} />
              </div>
            </td>
          </tr>
        ))}
      </Tabela>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Próximos lançamentos</h2>
        <Tabela cabecalho={["Data", "Descrição", "Contato", "Valor"]} principal="Descrição" total={lista.length} vazio="Nada previsto no período." direita={["Valor"]}>
          {lista.slice(0, 100).map((i) => (
            <tr key={i.agendamento_id}>
              <td className="whitespace-nowrap tabular-nums">
                {formatarData(i.data)}
                {i.vencido && <span className="block text-xs text-perigo">venceu {formatarData(i.vencimento)}</span>}
              </td>
              <td><Link href={i.tipo === "pagar" ? "/contas-a-pagar" : "/contas-a-receber"} className="hover:underline">{i.descricao}</Link></td>
              <td>{i.contato_nome ?? "–"}</td>
              <td className={`whitespace-nowrap text-right tabular-nums ${i.valor_cents < 0 ? "" : "text-positivo"}`}>{i.valor_cents < 0 ? `−${formatarMoeda(-i.valor_cents)}` : `+${formatarMoeda(i.valor_cents)}`}</td>
            </tr>
          ))}
        </Tabela>
      </section>
    </div>
  );
}
