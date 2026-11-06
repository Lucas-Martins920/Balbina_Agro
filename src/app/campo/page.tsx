import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { AppCampo } from "@/components/campo/app-campo";
import { Tutorial } from "@/components/tutorial";
import { exigirAceiteTermos } from "@/lib/aceite-termos";
import { dadosCampo } from "@/lib/apontamento-campo-servidor";
import { getAssinatura } from "@/lib/assinatura";
import { getUsuario } from "@/lib/auth";
import { painelCampo } from "@/lib/campo/servidor";
import { getEmpresaAtual, nomeEmpresa } from "@/lib/empresa";
import { iaConfigurada } from "@/lib/ia";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { chavesPermitidas, telasVistas } from "@/lib/tutoriais-dados";

// iPhone: tela cheia ao abrir da tela inicial e ícone próprio (o Safari não lê os ícones do manifest)
export const metadata: Metadata = {
  title: "Balbina Campo",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Balbina Campo", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

// A tela ocupa até as bordas (as barras respeitam o entalhe e a barra de gestos) e, no Android, o teclado
// empurra a caixa do chat para cima em vez de cobri-la.
export const viewport: Viewport = { viewportFit: "cover", interactiveWidget: "resizes-content" };

// App de campo: chat com IA, viveiros, ração e insumos, biometria e envios. Depois de aberto uma vez com sinal,
// funciona offline (service worker + fila no celular).
export default async function PaginaCampo() {
  await exigirAceiteTermos("/campo");
  const { atual } = await getEmpresaAtual();
  if (!(await getAssinatura(atual.id)).liberada) redirect("/assinatura");
  const supabase = await createClient();
  const [campo, painel, usuario, { pode, master }, vistos] = await Promise.all([
    dadosCampo(supabase, atual), painelCampo(supabase, atual), getUsuario(), getPermissoes(), telasVistas(),
  ]);
  const chavePush = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY : undefined;
  return (
    <>
      <AppCampo
        dados={{
          empresa: { id: atual.id, nome: nomeEmpresa(atual), fuso: atual.fuso },
          hoje: campo.hoje,
          agua: campo.agua,
          ia: iaConfigurada(),
          chavePush,
          painel,
          medicamentos: campo.medicamentos,
          racoes: campo.racoes,
          checklist: campo.checklist,
          sugestoes: campo.sugestoes,
        }}
      />
      <Tutorial usuario={usuario.id} vistos={vistos} permitidas={chavesPermitidas(pode, master)} comGeral={false} />
    </>
  );
}
