"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";

// Chamada depois de a tela pedir o código do autenticador (sessão aal2 com TOTP de agora).
// O banco confere tudo de novo: master, código digitado há no máximo 5 minutos, nome da empresa e a frase.
export async function zerarSistema(confirmacao: string, frase: string): Promise<EstadoAcao> {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("zerar_sistema", {
    p_empresa: atual.id,
    p_confirmacao: confirmacao,
    p_frase: frase,
  });
  if (error) return falha(mensagemBanco(error));
  const r = (data ?? {}) as Record<string, number>;
  revalidatePath("/", "layout");
  return sucesso(
    `Sistema zerado: ${r.lotes ?? 0} lotes, ${r.apontamentos ?? 0} apontamentos, ${r.pedidos ?? 0} pedidos, ` +
      `${r.titulos ?? 0} títulos e ${r.movimentos_estoque ?? 0} movimentos de estoque apagados. ` +
      `Cadastros, usuários e configurações continuam.`,
  );
}
