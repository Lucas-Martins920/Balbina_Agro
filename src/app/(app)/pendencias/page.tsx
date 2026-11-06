import Link from "next/link";
import { Calendar, Check, ChevronRight, Fish, Landmark, ShoppingCart, type LucideIcon } from "lucide-react";
import { Cartao, classeBotao, Etiqueta, Titulo, type Cor } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, formatarInteiro, hojeISO, somarDias } from "@/lib/formato";
import { organizarRotina, type Area, type Pendencia } from "@/lib/pendencias";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

const ICONE_AREA: Record<Area, { icone: LucideIcon; cor: Cor }> = {
  viveiro: { icone: Fish, cor: "azul" },
  comercial: { icone: ShoppingCart, cor: "verde" },
  financeiro: { icone: Landmark, cor: "azul" },
  periodo: { icone: Calendar, cor: "violeta" },
};

// Rotina do dia (no lugar da caixa de pendências): o checklist do que precisa ser alimentado hoje, por área.
// Cada item se marca sozinho quando o dado entra; o botão leva direto ao lançamento (?lancar= abre a gaveta).
// Cada pessoa vê só o que pode ver.
export default async function PaginaRotina() {
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const hoje = hojeISO(atual.fuso);
  const [ano, mes] = hoje.split("-").map(Number);
  const mesAnterior = new Date(Date.UTC(ano, mes - 2, 1)).toISOString().slice(0, 10);
  const contar = async (sim: boolean, consulta: () => PromiseLike<{ count: number | null }>) => (sim ? (await consulta()).count ?? 0 : null);
  const tamanho = async (sim: boolean, consulta: () => PromiseLike<{ data: unknown[] | null }>) => (sim ? (await consulta()).data?.length ?? 0 : null);
  const cabeca = { count: "exact" as const, head: true };

  const verApontamentos = pode("apontamentos.ver");
  const verInsumos = pode("estoque.ver") || pode("racao.ver");
  const [
    nfes, documentos, extrato, regras, recorrencias, pagarVencidas, pagarHoje, receberVencidas, alertas,
    ocupados, manejos, paraFaturar, paraEntregar, insumos, fechado,
  ] = await Promise.all([
    contar(pode("notas.ver") && pode("contas-a-pagar.ver"), () => supabase.from("nfes_recebidas").select("id", cabeca).eq("empresa_id", atual.id).eq("status", "nova").eq("situacao", "autorizada")),
    contar(pode("contas-a-pagar.ver"), () => supabase.from("documentos_recebidos").select("id", cabeca).eq("empresa_id", atual.id).eq("status", "nova")),
    contar(pode("conciliacao.ver"), () => supabase.from("movimentos_bancarios").select("id", cabeca).eq("empresa_id", atual.id).eq("status", "pendente")),
    tamanho(pode("conciliacao.ver"), () => supabase.rpc("regras_sugeridas", { p_empresa: atual.id })),
    tamanho(pode("contas-a-pagar.ver"), () => supabase.rpc("recorrencias_sugeridas", { p_empresa: atual.id })),
    contar(pode("contas-a-pagar.ver"), () => supabase.from("titulos").select("id", cabeca).eq("empresa_id", atual.id).eq("tipo", "pagar").eq("situacao", "vencido")),
    contar(pode("contas-a-pagar.ver"), () => supabase.from("titulos").select("id", cabeca).eq("empresa_id", atual.id).eq("tipo", "pagar").eq("vencimento", hoje).in("status", ["aberto", "parcial"])),
    contar(pode("contas-a-receber.ver"), () => supabase.from("titulos").select("id", cabeca).eq("empresa_id", atual.id).eq("tipo", "receber").eq("situacao", "vencido")),
    contar(pode("lotes.ver"), () => supabase.from("alertas").select("titulo", cabeca).eq("empresa_id", atual.id).eq("nivel", "critico")),
    verApontamentos ? supabase.from("alocacoes_atuais").select("viveiro_id, viveiro_nome, lote_codigo, data_povoamento, ultimo_apontamento, ultima_biometria").eq("empresa_id", atual.id).order("setor_nome").order("viveiro_nome") : null,
    contar(pode("sanidade.ver"), () => supabase.from("eventos_sanitarios").select("id", cabeca).eq("empresa_id", atual.id).eq("status", "planejado").lte("data", hoje)),
    contar(pode("vendas.ver"), () => supabase.from("pedidos").select("id", cabeca).eq("empresa_id", atual.id).in("status", ["aberto", "separado"]).lte("entrega_prevista", hoje)),
    contar(pode("vendas.ver"), () => supabase.from("pedidos").select("id", cabeca).eq("empresa_id", atual.id).eq("status", "faturado")),
    verInsumos ? supabase.from("produtos").select("id, estoque_minimo").eq("empresa_id", atual.id).eq("ativo", true).neq("tipo", "peixe").not("estoque_minimo", "is", null) : null,
    contar(pode("financeiro.fechar"), () => supabase.from("periodos_fechados").select("mes", cabeca).eq("empresa_id", atual.id).eq("mes", mesAnterior)),
  ]);

  // insumo abaixo do mínimo: soma o saldo dos depósitos
  let repor: number | null = null;
  if (insumos) {
    const comMinimo = insumos.data ?? [];
    const { data: saldos } = comMinimo.length
      ? await supabase.from("estoque_produtos").select("produto_id, saldo").eq("empresa_id", atual.id).in("produto_id", comMinimo.map((p) => p.id))
      : { data: [] as { produto_id: string; saldo: number }[] };
    const saldo = new Map<string, number>();
    for (const s of saldos ?? []) saldo.set(s.produto_id, (saldo.get(s.produto_id) ?? 0) + Number(s.saldo));
    repor = comMinimo.filter((p) => (saldo.get(p.id) ?? 0) < Number(p.estoque_minimo)).length;
  }
  // biometria a cada 30 dias no máximo: conta do povoamento enquanto o viveiro não teve nenhuma
  const limiteBiometria = somarDias(hoje, -30);
  const semBiometria = ocupados ? (ocupados.data ?? []).filter((g) => (g.ultima_biometria ?? g.data_povoamento) <= limiteBiometria).length : null;

  const viveiros: Pendencia[] = (ocupados?.data ?? []).map((g) => ({
    chave: `apontamento-${g.viveiro_id}`, area: "viveiro", titulo: `Apontamento · ${g.viveiro_nome}`, detalhe: `lote ${g.lote_codigo}`,
    quantidade: g.ultimo_apontamento === hoje ? 0 : 1, link: "/apontamentos?lancar=Novo%20apontamento", urgente: false, acao: "Apontar",
  }));
  const itens: Pendencia[] = [
    ...viveiros,
    {
      chave: "biometria", area: "viveiro", titulo: "Biometria dos viveiros", link: "/lotes", urgente: false, acao: "Pesar",
      quantidade: semBiometria,
      detalhe: semBiometria ? `${semBiometria === 1 ? "1 viveiro está" : `${formatarInteiro(semBiometria)} viveiros estão`} há mais de 30 dias sem pesagem` : "todos pesados nos últimos 30 dias",
    },
    { chave: "manejos", area: "viveiro", titulo: "Manejos sanitários programados", quantidade: manejos, link: "/sanidade", urgente: true, detalhe: "para hoje ou atrasados" },
    { chave: "alertas", area: "viveiro", titulo: "Alertas críticos da piscicultura", quantidade: alertas, link: "/painel", urgente: true },

    { chave: "faturar", area: "comercial", titulo: "Pedidos para faturar", quantidade: paraFaturar, link: "/vendas?ver=abertos", urgente: false, detalhe: "com entrega até hoje" },
    { chave: "entregar", area: "comercial", titulo: "Pedidos para entregar", quantidade: paraEntregar, link: "/vendas?ver=faturados", urgente: false },
    { chave: "receber", area: "comercial", titulo: "Contas a receber vencidas", quantidade: receberVencidas, link: "/contas-a-receber/regua", urgente: true, detalhe: "lembrete pronto no WhatsApp" },

    { chave: "extrato", area: "financeiro", titulo: "Lançamentos do extrato para conciliar", quantidade: extrato, link: "/conciliacao", urgente: false, detalhe: "os de sempre saem em lote" },
    { chave: "nfes", area: "financeiro", titulo: "Notas de compra para lançar", quantidade: nfes, link: "/notas/recebidas", urgente: false, detalhe: "chegaram da SEFAZ; viram conta a pagar num clique" },
    { chave: "documentos", area: "financeiro", titulo: "Boletos e notas para conferir", quantidade: documentos, link: "/contas-a-pagar/documentos", urgente: false, detalhe: "lidos por IA; confira e lance" },
    { chave: "pagar-hoje", area: "financeiro", titulo: "Contas a pagar que vencem hoje", quantidade: pagarHoje, link: "/contas-a-pagar", urgente: false },
    { chave: "pagar", area: "financeiro", titulo: "Contas a pagar vencidas", quantidade: pagarVencidas, link: "/contas-a-pagar?situacao=vencido", urgente: true },
    { chave: "regras", area: "financeiro", titulo: "Regras de conciliação sugeridas", quantidade: regras, link: "/conciliacao/regras", urgente: false },
    { chave: "recorrencias", area: "financeiro", titulo: "Contas que parecem recorrência", quantidade: recorrencias, link: "/contas-a-pagar", urgente: false },

    { chave: "repor", area: "periodo", titulo: "Insumos abaixo do mínimo", quantidade: repor, link: "/produtos", urgente: false, detalhe: "compre antes de faltar" },
    {
      chave: "fechamento", area: "periodo", titulo: `Fechar o mês de ${formatarData(mesAnterior).slice(3)}`, link: "/relatorios", urgente: false,
      quantidade: fechado === null ? null : fechado > 0 ? 0 : 1, detalhe: "confira e trave os lançamentos do mês",
    },
  ];
  const { areas, feitos, total, pendentes } = organizarRotina(itens);
  const pct = total ? Math.round((feitos / total) * 100) : 100;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Titulo descricao="O que precisa entrar no sistema hoje, por área. Cada item se marca sozinho quando o dado entra; o botão leva direto ao lançamento.">
        Rotina do dia
      </Titulo>

      <div className="vidro flex flex-col gap-3 rounded-2xl border border-borda p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[17px] font-semibold">{pendentes ? `${formatarInteiro(pendentes)} de ${formatarInteiro(total)} para fazer` : "Tudo em dia"}</p>
          <p className="text-sm text-texto-suave tabular-nums">{formatarInteiro(feitos)} feitos · {pct}%</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-elevado" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Rotina feita">
          <div className="crescer-x h-full rounded-full bg-positivo" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {areas.map((a) => {
        const { icone, cor } = ICONE_AREA[a.area];
        return (
          <Cartao key={a.area} titulo={a.nome} descricao={a.descricao} icone={icone} cor={cor}
            acoes={a.pendentes ? <Etiqueta tom="alerta">{a.pendentes} para fazer</Etiqueta> : <Etiqueta tom="positivo">em dia</Etiqueta>}>
            <ul className="-my-2 divide-y divide-linha">
              {a.itens.map((p) => {
                const feito = p.quantidade === 0;
                return (
                  <li key={p.chave} className="flex items-center gap-3 py-2.5 text-sm">
                    <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full border ${feito ? "border-positivo bg-positivo text-white" : "border-borda bg-elevado"}`}>
                      {feito && <Check size={14} strokeWidth={2.5} />}
                    </span>
                    <span className={`flex min-w-0 flex-1 flex-col ${feito ? "text-texto-suave" : ""}`}>
                      <span className={feito ? "line-through decoration-texto-suave/40" : "font-medium"}>
                        {p.titulo}
                        {!feito && p.quantidade! > 1 && <span className="ml-1.5 tabular-nums text-texto-suave">{formatarInteiro(p.quantidade)}</span>}
                        <span className="sr-only">{feito ? " (feito)" : " (para fazer)"}</span>
                      </span>
                      {p.detalhe && <span className="text-xs text-texto-suave">{p.detalhe}</span>}
                    </span>
                    {!feito && p.urgente && <Etiqueta tom="perigo">Atrasado</Etiqueta>}
                    {!feito && (
                      p.acao ? (
                        <Link href={p.link} className={classeBotao("secundario", "sm")}>{p.acao}</Link>
                      ) : (
                        <Link href={p.link} aria-label={`Abrir: ${p.titulo}`} className={classeBotao("secundario", "sm")}>
                          Abrir <ChevronRight size={14} aria-hidden />
                        </Link>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          </Cartao>
        );
      })}
    </div>
  );
}
