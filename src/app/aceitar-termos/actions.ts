"use server";

import { redirect } from "next/navigation";
import { registrarAceite } from "@/lib/aceite-termos";
import { destinoSeguro } from "@/lib/termos";

export type EstadoAceite = { erro?: string };

export async function aceitarTermos(_: EstadoAceite, form: FormData): Promise<EstadoAceite> {
  if (form.get("aceite") !== "on") return { erro: "Para continuar, marque que leu e aceita os documentos." };
  const { error } = await registrarAceite("tela_aceite");
  if (error) return { erro: "Não foi possível registrar o aceite. Entre de novo e tente outra vez." };
  redirect(destinoSeguro(form.get("voltar")));
}
