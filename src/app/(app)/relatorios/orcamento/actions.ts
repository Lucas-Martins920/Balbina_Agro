"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { lerCentavos, lerDecimal, lerInteiro } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";

function lerAno(form: FormData) {
  const ano = lerInteiro(form.get("ano"));
  return ano && ano >= 2000 && ano <= 2100 ? ano : null;
}

export async function salvarOrcamento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const ano = lerAno(form);
  const categoria = String(form.get("categoria_id") ?? "");
  if (!ano || !categoria) return falha("Faltou o ano ou a categoria.");
  const valores: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const bruto = String(form.get(`m${m}`) ?? "").trim();
    const v = bruto ? lerCentavos(bruto) : 0;
    if (v === null) return falha(`Valor inválido no mês ${m}.`);
    valores.push(v);
  }
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_orcamento", { p_empresa: atual.id, p_ano: ano, p_categoria: categoria, p_valores: valores });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/relatorios/orcamento");
  return sucesso("Orçamento salvo.");
}

export async function orcamentoDoRealizado(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const ano = lerAno(form);
  if (!ano) return falha("Escolha o ano.");
  const reajuste = lerDecimal(form.get("reajuste")) ?? 0;
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("orcamento_do_realizado", { p_empresa: atual.id, p_ano: ano, p_reajuste_pct: reajuste });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/relatorios/orcamento");
  return data ? sucesso(`${data} meses orçados a partir de ${ano - 1}.`) : falha(`Nada novo para orçar: ${ano - 1} não tem lançamentos ou as categorias já estão orçadas.`);
}
