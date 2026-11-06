import { getEmpresaAtual, nomeEmpresa } from "@/lib/empresa";
import { getPermissoes } from "@/lib/permissoes";
import { carregarDre, lerAno, lerRegime } from "@/lib/consultas-relatorio";
import { dreCsvLinhas, drePdf, dreXlsx } from "@/lib/dre-exportar";
import { formatarData, hojeISO } from "@/lib/formato";
import { abaTitulos, planilhaXlsx, rotulosSituacao } from "@/lib/planilha";
import { paraCsv } from "@/lib/relatorios";
import { CONFIG_TITULO } from "@/lib/titulos";
import { createClient } from "@/lib/supabase/server";
import { lerTodas } from "@/lib/supabase/todas";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function arquivo(nome: string, conteudo: string | ArrayBuffer, tipo = "text/csv; charset=utf-8") {
  return new Response(conteudo, {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}

const SITUACOES = ["aberto", "parcial", "vencido", "quitado", "cancelado", "perda"];

export async function GET(request: Request) {
  if (!(await getPermissoes()).pode("relatorios.ver")) return new Response("Sem permissão", { status: 403 });
  const url = new URL(request.url);
  const { atual } = await getEmpresaAtual();
  const relatorio = url.searchParams.get("relatorio");

  if (relatorio === "resultado") {
    const regime = lerRegime(url.searchParams.get("regime"));
    const ano = lerAno(url.searchParams.get("ano"), Number(hojeISO(atual.fuso).slice(0, 4)));
    const cc = url.searchParams.get("cc") || undefined;
    const supabase = await createClient();
    const [dre, centro] = await Promise.all([
      carregarDre(atual.id, regime, ano, cc),
      cc ? supabase.from("centros_custo").select("nome").eq("id", cc).maybeSingle().then((r) => r.data?.nome) : undefined,
    ]);
    const cabecalho = { empresa: nomeEmpresa(atual), regime, ano, centroCusto: centro ?? undefined, geradoEm: formatarData(hojeISO(atual.fuso)) };
    const nome = `resultado-${regime}-${ano}`;
    const formato = url.searchParams.get("formato");
    if (formato === "pdf") return arquivo(`${nome}.pdf`, drePdf(dre, cabecalho), "application/pdf");
    if (formato === "csv") return arquivo(`${nome}.csv`, paraCsv(dreCsvLinhas(dre, cabecalho)));
    return arquivo(`${nome}.xlsx`, await dreXlsx(dre, cabecalho), XLSX);
  }

  if (relatorio === "titulos") {
    const tipo = url.searchParams.get("tipo") === "receber" ? "receber" : "pagar";
    const de = url.searchParams.get("de") ?? "";
    const ate = url.searchParams.get("ate") ?? "";
    const situacoes = (url.searchParams.get("situacao") ?? "").split(",").filter((s) => SITUACOES.includes(s));
    const supabase = await createClient();
    const consulta = () => {
      let c = supabase.from("titulos").select("*").eq("empresa_id", atual.id).eq("tipo", tipo);
      if (/^\d{4}-\d{2}-\d{2}$/.test(de)) c = c.gte("vencimento", de);
      if (/^\d{4}-\d{2}-\d{2}$/.test(ate)) c = c.lte("vencimento", ate);
      if (situacoes.length) c = c.in("situacao", situacoes);
      return c.order("vencimento").order("id");
    };
    const { data, error } = await lerTodas(consulta, 20000);
    if (error) return new Response(error.message, { status: 500 });
    const hoje = hojeISO(atual.fuso);
    if (url.searchParams.get("formato") === "csv") {
      const linhas: (string | number | null)[][] = [["Vencimento", "Competência", "Descrição", "Parcela", tipo === "pagar" ? "Fornecedor" : "Cliente",
        "Categorias", "Centros de custo", "Valor", "Pago", "Saldo", "Situação", "Documento"]];
      for (const t of data ?? []) {
        linhas.push([formatarData(t.vencimento), t.competencia.slice(0, 7), t.descricao,
          t.parcela_total ? `${t.parcela_numero}/${t.parcela_total}` : "", t.contato_nome ?? "", t.categorias ?? "", t.centros_custo ?? "",
          Number(t.valor_cents), Number(t.pago_cents), Number(t.saldo_cents), t.situacao, t.referencia ?? ""]);
      }
      return arquivo(`contas-a-${tipo}-${hoje}.csv`, paraCsv(linhas));
    }
    const rotulos = rotulosSituacao(tipo);
    const nomeLista = `${CONFIG_TITULO[tipo].titulo}${situacoes.length ? ` · ${situacoes.map((s) => rotulos[s].toLowerCase()).join(", ")}` : ""}`;
    const periodo = [/^\d{4}-\d{2}-\d{2}$/.test(de) ? `de ${formatarData(de)}` : "", /^\d{4}-\d{2}-\d{2}$/.test(ate) ? `até ${formatarData(ate)}` : ""].filter(Boolean).join(" ");
    const empresa = nomeEmpresa(atual);
    const aba = abaTitulos(tipo, data ?? [], {
      titulo: `Balbina · ${empresa}`, completa: true,
      subtitulo: `${nomeLista}${periodo ? ` · vencimento ${periodo}` : ""} · valores em R$`,
      nota: `Gerado pelo Balbina em ${formatarData(hoje)} · ${empresa} · ${nomeLista}`,
    });
    aba.rodape = `${empresa} · ${nomeLista}`;
    return arquivo(`contas-a-${tipo}-${hoje}.xlsx`, await planilhaXlsx([aba], nomeLista), XLSX);
  }

  return new Response("Relatório desconhecido", { status: 400 });
}
