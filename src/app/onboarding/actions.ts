"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_EMPRESA } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";

export type EstadoOnboarding = { erro?: string };

export async function criarEmpresa(_: EstadoOnboarding, form: FormData): Promise<EstadoOnboarding> {
  // CNPJ da empresa ou CPF do produtor rural pessoa física
  const cnpj = String(form.get("cnpj") ?? "").replace(/\D/g, "");
  const ie = String(form.get("inscricao_estadual") ?? "").trim();
  const razao = String(form.get("razao_social") ?? "").trim();
  const fantasia = String(form.get("nome_fantasia") ?? "").trim();
  if (cnpj.length !== 14 && cnpj.length !== 11) return { erro: "Informe o CNPJ (14 dígitos) ou o CPF do produtor rural (11 dígitos)." };
  if (cnpj.length === 11 && !ie) return { erro: "Produtor rural com CPF precisa da inscrição estadual." };
  if (!razao) return { erro: "Informe a razão social." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("criar_empresa", {
    p_cnpj: cnpj,
    p_razao_social: razao,
    p_nome_fantasia: fantasia || null,
    p_inscricao_estadual: ie || null,
  });
  if (error) return { erro: error.message };

  (await cookies()).set(COOKIE_EMPRESA, String(data), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  // Empresa nova começa pelo assistente de primeiros passos (viveiros, lotes, estoque inicial...).
  redirect("/primeiros-passos");
}
