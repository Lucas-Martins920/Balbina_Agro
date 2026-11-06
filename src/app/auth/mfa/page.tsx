import { redirect } from "next/navigation";
import { TelaAcesso } from "@/components/tela-acesso";
import { eLoginLocal } from "@/lib/login-local";
import { segundoFatorPendente, usarDispositivoConfiavel } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";
import { destinoSeguro } from "@/lib/termos";
import { FormMfa } from "./form";

function abertaComSenha(amr: unknown) {
  return Array.isArray(amr) && amr.some((a) => a === "password" || (a as { method?: string })?.method === "password");
}

// Segunda etapa obrigatória do login: código do app autenticador ou, para quem não usa app,
// código enviado por e-mail.
export default async function PaginaMfa({ searchParams }: PageProps<"/auth/mfa">) {
  const { voltar } = await searchParams;
  const destino = destinoSeguro(voltar);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  if (!(await segundoFatorPendente())) redirect(destino);
  // navegador confiado nos últimos 14 dias: entra sem pedir o código
  if (await usarDispositivoConfiavel().catch(() => false)) redirect(destino);
  return (
    <TelaAcesso titulo="Verificação em duas etapas" descricao="Para proteger a piscicultura, o Balbina confirma que é você além da senha.">
      <FormMfa destino={destino} email={String(data.claims.email ?? "")} comSenha={abertaComSenha(data.claims.amr)}
        local={eLoginLocal(String(data.claims.email ?? ""))} />
    </TelaAcesso>
  );
}
