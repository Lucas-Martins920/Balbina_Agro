import { TelaAcesso } from "@/components/tela-acesso";
import { FormLogin } from "./form";

// Depois de um link de e-mail (cadastro, convite, nova senha) a pessoa entra de novo com a senha:
// só a sessão aberta com senha completa a verificação em duas etapas.
const AVISOS: Record<string, string> = {
  senha: "Senha salva. Entre com o seu e-mail e a nova senha.",
  confirmado: "E-mail confirmado. Entre com o seu e-mail e senha para continuar.",
};

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const { voltar, aviso } = await searchParams;
  return (
    <TelaAcesso titulo="Acesse sua piscicultura" descricao="Entre com o e-mail e a senha da sua conta.">
      <FormLogin voltar={typeof voltar === "string" ? voltar : undefined} aviso={typeof aviso === "string" ? AVISOS[aviso] : undefined} />
    </TelaAcesso>
  );
}
