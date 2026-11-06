"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_EMPRESA, listarEmpresas } from "@/lib/empresa";

export async function trocarEmpresa(form: FormData) {
  const id = String(form.get("empresa_id") ?? "");
  const permitidas = await listarEmpresas();
  if (!permitidas.some((e) => e.id === id)) return;
  (await cookies()).set(COOKIE_EMPRESA, id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
