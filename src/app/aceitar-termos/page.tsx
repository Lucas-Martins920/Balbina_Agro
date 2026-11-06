import type { Metadata } from "next";
import { getUsuario } from "@/lib/auth";
import { TelaAcesso } from "@/components/tela-acesso";
import { sair } from "@/app/login/actions";
import { FormAceite } from "./form";
import { classeBotao } from "@/components/ui";

export const metadata: Metadata = { title: "Termos de uso · Balbina" };

// Para quem entrou por convite, criou a conta antes dos termos ou ainda não aceitou a versão nova.
export default async function PaginaAceitarTermos({ searchParams }: PageProps<"/aceitar-termos">) {
  await getUsuario();
  const { voltar } = await searchParams;
  return (
    <TelaAcesso
      titulo="Termos de uso"
      descricao="Para continuar usando o Balbina, leia e aceite os documentos abaixo. Se eles mudarem, pediremos o aceite de novo."
    >
      <FormAceite voltar={typeof voltar === "string" ? voltar : undefined} />
      <form action={sair} className="mt-4">
        <button type="submit" className={classeBotao("secundario", "sm")}>
          Sair sem aceitar
        </button>
      </form>
    </TelaAcesso>
  );
}
