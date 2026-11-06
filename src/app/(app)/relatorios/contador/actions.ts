"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

const TEXTO = ["nome", "endereco", "numero", "complemento", "bairro", "uf", "telefone", "email", "imovel_nome", "imovel_endereco", "imovel_numero",
  "imovel_complemento", "imovel_bairro", "imovel_uf", "inscricao_estadual", "contador_nome", "contador_documento", "contador_crc", "contador_email", "contador_fone"];
const DIGITOS: Record<string, number> = { cpf: 11, cod_mun: 7, cep: 8, imovel_cod_mun: 7, imovel_cep: 8, cad_itr: 8, caepf: 14 };
const ROTULO: Record<string, string> = {
  cpf: "CPF (11 números)", cod_mun: "código IBGE do município (7 números)", cep: "CEP (8 números)", imovel_cod_mun: "código IBGE do município do imóvel (7 números)",
  imovel_cep: "CEP do imóvel (8 números)", cad_itr: "CIB/NIRF (8 números)", caepf: "CAEPF (14 números)",
};

// E2: cadastro do LCDPR (o que a Receita pede e o Balbina não tem).
export async function salvarLcdpr(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  if (!(await getPermissoes()).pode("configuracoes.editar")) return falha("Seu usuário não pode alterar as configurações da empresa.");
  const dados: Record<string, string | number | null> = {};
  for (const c of TEXTO) dados[c] = String(form.get(c) ?? "").trim() || null;
  for (const [c, n] of Object.entries(DIGITOS)) {
    const v = String(form.get(c) ?? "").replace(/\D/g, "");
    if (v && v.length !== n) return falha(`Confira o ${ROTULO[c]}.`);
    dados[c] = v || null;
  }
  dados.forma_apuracao = form.get("forma_apuracao") === "2" ? 2 : 1;
  const tipo = Number(form.get("tipo_exploracao"));
  dados.tipo_exploracao = Number.isInteger(tipo) && tipo >= 1 && tipo <= 6 ? tipo : 1;
  const part = Number(String(form.get("participacao") ?? "100").replace(",", "."));
  if (!(part > 0 && part <= 100)) return falha("Participação no imóvel: de 0,01 a 100%.");
  dados.participacao_centesimos = Math.round(part * 100);
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("lcdpr_config")
    .upsert({ empresa_id: atual.id, ...dados, updated_at: new Date().toISOString() }, { onConflict: "empresa_id" });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/relatorios/contador");
  return sucesso("Cadastro do LCDPR salvo.");
}
