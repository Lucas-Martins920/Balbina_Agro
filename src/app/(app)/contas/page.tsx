import Link from "next/link";
import { BotaoLancamento } from "@/components/lancamento";
import { Campo, classeBotao, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { diasAtrasISO, formatarData, formatarMoeda, hojeISO } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { transferir } from "./actions";
import { ListaContas, type Conta } from "./lista";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";

export default async function PaginaContas({ searchParams }: PageProps<"/contas">) {
  await exigirAcesso("contas");
  const { pode } = await getPermissoes();
  const filtros = await searchParams;
  const contaFiltro = typeof filtros.conta === "string" ? filtros.conta : "";
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const desde = diasAtrasISO(30, atual.fuso);

  let movimentos = supabase.from("movimentos_caixa").select("origem, origem_id, conta_id, data, descricao, valor_cents").eq("empresa_id", atual.id).gte("data", desde)
    .order("data", { ascending: false }).limit(200);
  if (contaFiltro) movimentos = movimentos.eq("conta_id", contaFiltro);

  const [{ data: cadastros }, { data: saldosTodos }, { data: vinculos }, { data: movs }] = await Promise.all([
    supabase.from("contas_financeiras")
      .select("id, nome, tipo, banco_codigo, agencia, conta, conta_dv, saldo_inicial_cents, saldo_inicial_data, arquivada, open_finance_conta_id")
      .eq("empresa_id", atual.id).order("nome"),
    supabase.from("saldos_contas").select("conta_id, nome, tipo, arquivada, saldo_cents, ultimo_movimento").eq("empresa_id", atual.id),
    supabase.from("importacao_vinculos").select("registro_id, origem").eq("empresa_id", atual.id).eq("entidade", "conta"),
    movimentos,
  ]);
  const saldoDe = new Map((saldosTodos ?? []).map((s) => [s.conta_id, s]));
  const origens = new Map<string, string[]>();
  for (const v of vinculos ?? []) origens.set(v.registro_id, [...new Set([...(origens.get(v.registro_id) ?? []), v.origem])]);
  const contas: Conta[] = (cadastros ?? []).map((c) => ({
    id: c.id, nome: c.nome, tipo: c.tipo, banco_codigo: c.banco_codigo, agencia: c.agencia, conta: c.conta, conta_dv: c.conta_dv,
    saldo_inicial_cents: Number(c.saldo_inicial_cents), saldo_inicial_data: c.saldo_inicial_data, arquivada: c.arquivada,
    open_finance: Boolean(c.open_finance_conta_id), origens: origens.get(c.id) ?? [],
    saldo_cents: Number(saldoDe.get(c.id)?.saldo_cents ?? c.saldo_inicial_cents),
    ultimo_movimento: saldoDe.get(c.id)?.ultimo_movimento ?? null,
  }));
  const saldos = (saldosTodos ?? []).filter((s) => !s.arquivada).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
  const total = saldos.filter((s) => s.tipo !== "cartao_credito").reduce((t, s) => t + Number(s.saldo_cents), 0);
  const hoje = hojeISO(atual.fuso);

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo
        descricao={`Saldo somado das contas: ${formatarMoeda(total)}`}
        acoes={saldos.length > 1 && (
          <BotaoLancamento rotulo="Transferir entre contas" titulo="Transferência entre contas" acao={transferir} botao="Transferir" variante="secundario" icone={null}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Selecao rotulo="De" id="conta_origem_id" name="conta_origem_id" required defaultValue="">
                <option value="" disabled>Escolha…</option>
                {saldos.map((s) => <option key={s.conta_id} value={s.conta_id}>{s.nome}</option>)}
              </Selecao>
              <Selecao rotulo="Para" id="conta_destino_id" name="conta_destino_id" required defaultValue="">
                <option value="" disabled>Escolha…</option>
                {saldos.map((s) => <option key={s.conta_id} value={s.conta_id}>{s.nome}</option>)}
              </Selecao>
              <Campo rotulo="Valor (R$)" id="tr_valor" name="valor" inputMode="decimal" placeholder="0,00" required />
              <Campo rotulo="Data" id="tr_data" name="data" type="date" defaultValue={hoje} required />
            </div>
            <Campo rotulo="Descrição (opcional)" id="tr_descricao" name="descricao" placeholder="Ex.: Sangria do caixa" />
          </BotaoLancamento>
        )}
      >
        Contas e saldos
      </Titulo>

      <ListaContas contas={contas} hoje={hoje} podeEditar={pode("contas.editar")} />

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">
          Movimentos dos últimos 30 dias{contaFiltro && ` · ${nomeConta.get(contaFiltro) ?? ""}`}
          {contaFiltro && <Link href="/contas" className={`${classeBotao("secundario", "sm")} ml-2`}>todas as contas</Link>}
        </h2>
        <Tabela cabecalho={["Data", "Conta", "Descrição", "Valor"]} principal="Descrição" total={movs?.length ?? 0} vazio="Nenhum movimento no período.">
          {(movs ?? []).map((m) => (
            <tr key={`${m.origem_id}-${m.conta_id}`}>
              <td className="whitespace-nowrap tabular-nums">{formatarData(m.data)}</td>
              <td>{nomeConta.get(m.conta_id) ?? "–"}</td>
              <td>{m.descricao}{m.origem === "transferencia" && <span className="text-texto-suave"> (transferência)</span>}</td>
              <td className={`whitespace-nowrap tabular-nums ${Number(m.valor_cents) < 0 ? "text-perigo" : "text-positivo"}`}>{formatarMoeda(m.valor_cents)}</td>
            </tr>
          ))}
        </Tabela>
      </section>
    </div>
  );
}
