import { TelaAcesso } from "@/components/tela-acesso";
import { FormRecuperacao } from "./form";

// Destino do e-mail de "Esqueci minha senha" (via /auth/confirmar, que já abriu a sessão).
export default function PaginaNovaSenha() {
  return (
    <TelaAcesso titulo="Crie uma nova senha" descricao="Escolha a senha que você vai usar para entrar no Balbina.">
      <FormRecuperacao />
    </TelaAcesso>
  );
}
