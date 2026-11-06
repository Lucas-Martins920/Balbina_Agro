import { TelaAcesso } from "@/components/tela-acesso";
import { FormSenhaConvite } from "./form";

// Destino do e-mail de convite: a pessoa convidada define a senha e cai na empresa que convidou.
export default function PaginaConvite() {
  return (
    <TelaAcesso titulo="Bem-vindo ao Balbina" descricao="Você foi convidado para acessar uma piscicultura. Defina sua senha para entrar.">
      <FormSenhaConvite />
    </TelaAcesso>
  );
}
