import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getEmpresaAtual } from "@/lib/empresa";
import { encontrarModulo } from "@/lib/modulos";
import { createClient } from "@/lib/supabase/server";
import { planoInclui, SEM_ACESSO, temPermissao, type Acesso } from "@/lib/permissoes-regras";

export type Permissoes = Acesso & { pode: (chave: string) => boolean; noPlano: (modulo: string) => boolean };

// Acesso do usuário logado na empresa atual. O banco aplica a mesma regra nas policies.
export const getPermissoes = cache(async (): Promise<Permissoes> => {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data } = await supabase.rpc("minhas_permissoes", { p_empresa: atual.id });
  const acesso: Acesso = data ? (data as Acesso) : SEM_ACESSO;
  return { ...acesso, pode: (chave) => temPermissao(acesso, chave), noPlano: (modulo) => planoInclui(acesso, modulo) };
});

// Primeira linha de cada página de módulo: sem "<modulo>.ver" o usuário volta com aviso
// (que convida para trocar de plano quando é o plano que não inclui o módulo).
export async function exigirAcesso(modulo: string) {
  const { pode } = await getPermissoes();
  if (!pode(`${modulo}.ver`)) redirect(`/sem-acesso?modulo=${encodeURIComponent(modulo)}`);
}

export async function exigirMaster() {
  const { master } = await getPermissoes();
  if (!master) redirect("/sem-acesso?modulo=usuarios");
}

// Para ações que chamam serviço de fora (Asaas, Focus, Pluggy) antes de gravar: o RLS só barraria depois.
// Devolve a mensagem para o usuário quando o plano da empresa não inclui o módulo.
export async function foraDoPlano(modulo: string): Promise<string | null> {
  const { noPlano } = await getPermissoes();
  if (noPlano(modulo)) return null;
  const nome = encontrarModulo(modulo)?.nome ?? modulo;
  return `${nome} não faz parte do plano da empresa. O usuário master pode trocar de plano em Assinatura.`;
}
