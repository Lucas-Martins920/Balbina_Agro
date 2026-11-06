import { redirect } from "next/navigation";
import { TelaAcesso } from "@/components/tela-acesso";
import { exigirSegundoFator } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";
import { destinoSeguro } from "@/lib/termos";
import { FormPrimeiroAcesso } from "./form";

// Primeiro acesso de quem entra com usuário criado pelo master: troca a senha que o master passou.
export default async function PaginaPrimeiroAcesso({ searchParams }: PageProps<"/auth/primeiro-acesso">) {
  const { voltar } = await searchParams;
  const destino = destinoSeguro(voltar);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  await exigirSegundoFator(`/auth/primeiro-acesso?voltar=${encodeURIComponent(destino)}`);
  const { data: local } = await supabase.rpc("meu_login_local");
  if (!(local as { trocar_senha?: boolean } | null)?.trocar_senha) redirect(destino);
  return (
    <TelaAcesso titulo="Crie a sua senha" descricao="A senha que o master passou só vale para o primeiro acesso. Escolha uma senha só sua.">
      <FormPrimeiroAcesso voltar={destino} />
    </TelaAcesso>
  );
}
