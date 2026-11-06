import "server-only";
import { zipSync, strToU8 } from "fflate";
import { nomeEmpresa, type Empresa } from "@/lib/empresa";
import { carregarDre } from "@/lib/consultas-relatorio";
import { dreXlsx } from "@/lib/dre-exportar";
import { baixarArquivoFocus } from "@/lib/focus";
import { caminhoArquivoValido } from "@/lib/focus-mapa";
import { formatarData, hojeISO, MESES_LONGOS } from "@/lib/formato";
import { abaTitulos, planilhaXlsx } from "@/lib/planilha";
import { paraCsv } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";
import { lerTodas } from "@/lib/supabase/todas";
import { CONFIG_TITULO } from "@/lib/titulos";

// Pacote mensal do contador (E1): um .zip com o que o escritório pede todo mês. Tudo é lido com o usuário
// que baixa (RLS e permissões dele): o que ele não pode ver fica de fora e o LEIA-ME diz o quê.

export type Permissoes = { relatorios: boolean; notas: boolean };

export function periodoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { ano: a, de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, "0")}`, nome: `${MESES_LONGOS[m - 1]} de ${a}` };
}

const limpar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
const LIMITE_NOTAS = 300;

export async function montarPacote(empresa: Empresa, mes: string, pode: Permissoes) {
  const supabase = await createClient();
  const p = periodoMes(mes);
  const nome = nomeEmpresa(empresa);
  const hoje = hojeISO(empresa.fuso);
  const arquivos: Record<string, Uint8Array> = {};
  const conteudo: string[] = [];
  const fora: string[] = [];

  if (pode.relatorios) {
    // Resultado do ano até o mês, nos dois regimes
    for (const regime of ["competencia", "caixa"] as const) {
      const dre = await carregarDre(empresa.id, regime, p.ano);
      arquivos[`resultado-${regime}-${p.ano}.xlsx`] = new Uint8Array(await dreXlsx(dre, { empresa: nome, regime, ano: p.ano, geradoEm: formatarData(hoje) }));
    }
    conteudo.push(`Resultado (DRE) de ${p.ano} por competência e por caixa`);

    // Contas a pagar e a receber com vencimento no mês
    for (const tipo of ["pagar", "receber"] as const) {
      const { data } = await lerTodas(() => supabase.from("titulos").select("*").eq("empresa_id", empresa.id).eq("tipo", tipo)
        .gte("vencimento", p.de).lte("vencimento", p.ate).order("vencimento").order("id"), 20000);
      const aba = abaTitulos(tipo, data ?? [], {
        titulo: `Balbina · ${nome}`, completa: true,
        subtitulo: `${CONFIG_TITULO[tipo].titulo} · vencimento em ${p.nome} · valores em R$`,
        nota: `Gerado pelo Balbina em ${formatarData(hoje)} · ${nome}`,
      });
      arquivos[`contas-a-${tipo}-${mes}.xlsx`] = new Uint8Array(await planilhaXlsx([aba], CONFIG_TITULO[tipo].titulo));
    }
    conteudo.push("Contas a pagar e a receber com vencimento no mês");

    // Extrato de cada conta no mês, com a situação da conciliação
    const [{ data: contas }, { data: movimentos }] = await Promise.all([
      supabase.from("contas_financeiras").select("id, nome").eq("empresa_id", empresa.id),
      lerTodas(() => supabase.from("movimentos_bancarios").select("conta_id, data, descricao, nome_contraparte, cpf_cnpj_contraparte, valor_cents, status")
        .eq("empresa_id", empresa.id).gte("data", p.de).lte("data", p.ate).order("data").order("id"), 50000),
    ]);
    const nomeConta = new Map((contas ?? []).map((c) => [c.id, c.nome]));
    const porConta = new Map<string, (string | number | null)[][]>();
    for (const m of movimentos ?? []) {
      const linhas = porConta.get(m.conta_id) ?? [["Data", "Descrição", "Contraparte", "CPF/CNPJ", "Valor", "Situação"]];
      linhas.push([formatarData(m.data), m.descricao, m.nome_contraparte ?? "", m.cpf_cnpj_contraparte ?? "", Number(m.valor_cents), m.status]);
      porConta.set(m.conta_id, linhas);
    }
    for (const [conta, linhas] of porConta) {
      arquivos[`extratos/${limpar(nomeConta.get(conta) ?? conta)}-${mes}.csv`] = strToU8(paraCsv(linhas));
    }
    conteudo.push(porConta.size ? `Extrato de ${porConta.size} conta(s) no mês` : "Extratos: nenhum lançamento no mês");
  } else {
    fora.push("Resultado, contas e extratos (seu usuário não vê relatórios financeiros)");
  }

  if (pode.notas) {
    const inicio = new Date(`${p.de}T00:00:00`).toISOString();
    const { data: notas } = await supabase.from("notas_fiscais").select("modelo, numero, serie, status, chave_acesso, xml_path, xml_cancelamento_path, emitida_em")
      .eq("empresa_id", empresa.id).in("status", ["autorizada", "cancelada"])
      .gte("emitida_em", inicio).lt("emitida_em", new Date(`${p.ate}T23:59:59`).toISOString())
      .order("emitida_em").limit(LIMITE_NOTAS);
    let baixadas = 0;
    const falharam: string[] = [];
    const pedidos = (notas ?? []).flatMap((n) => {
      const base = `notas/${n.modelo}-${n.serie ?? 1}-${n.numero ?? n.chave_acesso}`;
      return [[n.xml_path, `${base}.xml`], ...(n.status === "cancelada" ? [[n.xml_cancelamento_path, `${base}-cancelamento.xml`]] : [])] as [string | null, string][];
    }).filter(([c]) => caminhoArquivoValido(c));
    // de 5 em 5 para não estourar o tempo nem a Focus
    for (let i = 0; i < pedidos.length; i += 5) {
      await Promise.all(pedidos.slice(i, i + 5).map(async ([caminho, arquivo]) => {
        try {
          const r = await baixarArquivoFocus(caminho!);
          if (!r.ok) throw new Error(String(r.status));
          arquivos[arquivo] = new Uint8Array(await r.arrayBuffer());
          baixadas++;
        } catch {
          falharam.push(arquivo.replace("notas/", ""));
        }
      }));
    }
    conteudo.push(`XML de ${baixadas} nota(s) emitida(s) no mês (autorizadas e canceladas)${(notas ?? []).length === LIMITE_NOTAS ? `; só as primeiras ${LIMITE_NOTAS}` : ""}`);
    if (falharam.length) fora.push(`XML que a Focus NFe não entregou agora: ${falharam.join(", ")}`);
  } else {
    fora.push("Notas fiscais (seu usuário não vê notas)");
  }

  const leiaMe = [
    `Pacote do contador · ${nome} · ${p.nome}`,
    `Gerado pelo Balbina em ${formatarData(hoje)}.`,
    "",
    "Neste arquivo:",
    ...conteudo.map((c) => `- ${c}`),
    ...(fora.length ? ["", "Ficou de fora:", ...fora.map((c) => `- ${c}`)] : []),
    "",
  ].join("\r\n");
  arquivos["LEIA-ME.txt"] = strToU8(leiaMe);

  return { zip: zipSync(arquivos, { level: 6 }), nome: `contador-${limpar(nome)}-${mes}.zip`, conteudo, fora };
}
