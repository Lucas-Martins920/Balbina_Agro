import { MonitorSmartphone } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Cartao, Titulo } from "@/components/ui";
import { WhatsAppPessoal } from "@/components/whatsapp-pessoal";
import { getUsuario } from "@/lib/auth";
import { contarDispositivosConfiaveis } from "@/lib/mfa";
import { esquecerDispositivosConfiaveis } from "./actions";
import { VerificacaoDuasEtapas } from "./mfa";

export default async function PaginaSeguranca() {
  const usuario = await getUsuario();
  const confiaveis = await contarDispositivosConfiaveis(usuario.id).catch(() => 0);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Titulo descricao={`Proteção de acesso da conta ${usuario.email} e o seu WhatsApp no Balbina.`}>Segurança da conta</Titulo>
      <VerificacaoDuasEtapas />
      <Cartao titulo="Dispositivos confiáveis" icone={MonitorSmartphone}>
        <div className="flex flex-col gap-4 text-sm">
          <p>
            {confiaveis === 0
              ? "Nenhum navegador confiado agora. Na verificação do login, marque “Confiar neste dispositivo” para não digitar o código por 14 dias."
              : `${confiaveis === 1 ? "1 navegador confiado" : `${confiaveis} navegadores confiados`}: nesses, o login pede só a senha por até 14 dias.`}
          </p>
          {confiaveis > 0 && (
            <FormAcao acao={esquecerDispositivosConfiaveis} botao="Esquecer todos" variante="secundario">
              <p className="text-texto-suave">Perdeu um aparelho ou usou um computador de outra pessoa? Esqueça todos e o código volta a ser pedido.</p>
            </FormAcao>
          )}
        </div>
      </Cartao>
      <WhatsAppPessoal />
    </div>
  );
}
