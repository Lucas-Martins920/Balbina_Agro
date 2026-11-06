"use server";

import { getEmpresaAtual } from "@/lib/empresa";
import { contarMortes, ErroIa, TAMANHO_MAXIMO, type MortalidadeLida } from "@/lib/ia";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

const IMAGENS = ["image/jpeg", "image/png", "image/webp"] as const;

// A8: conta os peixes mortos da foto e sugere a causa. Experimental: a pessoa confere antes de salvar.
export async function contarMortesPorFoto(form: FormData): Promise<{ erro?: string; resultado?: MortalidadeLida }> {
  if (!(await getPermissoes()).pode("apontamentos.editar")) return { erro: "Seu usuário não pode lançar apontamentos." };
  const foto = form.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return { erro: "Tire a foto dos peixes." };
  const tipo = IMAGENS.find((t) => t === foto.type);
  if (!tipo) return { erro: "Mande uma foto (JPG, PNG ou WebP)." };
  if (foto.size > TAMANHO_MAXIMO) return { erro: "Foto grande demais." };
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const uso = await supabase.rpc("registrar_uso_ia", { p_empresa: atual.id, p_tipo: "mortalidade" });
  if (uso.error) return { erro: uso.error.message };
  try {
    return { resultado: await contarMortes(Buffer.from(await foto.arrayBuffer()).toString("base64"), tipo) };
  } catch (e) {
    if (e instanceof ErroIa) return { erro: e.message };
    throw e;
  }
}
