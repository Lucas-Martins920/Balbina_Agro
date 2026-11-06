import { TelaAcesso } from "@/components/tela-acesso";
import { LinkEmail } from "./link";

// Destino do link do e-mail de verificação (alternativa a digitar o código).
export default function PaginaLinkEmail() {
  return (
    <TelaAcesso titulo="Verificação em duas etapas" descricao="Confirmando o link do seu e-mail.">
      <LinkEmail />
    </TelaAcesso>
  );
}
