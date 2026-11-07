import type { Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirAceiteTermos } from "@/lib/aceite-termos";
import { getAssinatura } from "@/lib/assinatura";
import { CONVITE_UPGRADE, situacao } from "@/lib/assinatura-mapa";
import { getUsuario } from "@/lib/auth";
import { getEmpresaAtual, nomeEmpresa } from "@/lib/empresa";
import { hojeISO } from "@/lib/formato";
import { GRUPOS, podeVerModulo } from "@/lib/modulos";
import { getPermissoes } from "@/lib/permissoes";
import { MarcaBalbina } from "@/components/marca";
import { BarraLateral, type DadosBarra } from "@/components/barra-lateral";
import { NavegacaoMovel } from "@/components/menu-lateral";
import { SeletorVersao } from "@/components/versao";
import { Tutorial } from "@/components/tutorial";
import { chavesPermitidas, telasVistas } from "@/lib/tutoriais-dados";
import { CHAVE_VERSAO, LARGURA_COMPLETA } from "@/lib/versao";
import { CLASSE_BOTAO_TEXTO } from "@/components/ui";
import { ModoOffline } from "@/components/offline";
import { montarMenu } from "@/lib/menu";

// Versão completa no celular: a largura vem do servidor, pelo cookie. Sem initial-scale, o navegador encolhe os
// 1280px para caber na tela.
export async function generateViewport(): Promise<Viewport> {
  const completa = (await cookies()).get(CHAVE_VERSAO)?.value === "completa";
  return completa ? { width: LARGURA_COMPLETA, initialScale: undefined } : { width: "device-width", initialScale: 1 };
}

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  // As empresas já vêm do banco junto com o aceite (uma ida a menos), mas os termos são conferidos antes:
  // quem não aceitou vai para o aceite mesmo sem empresa cadastrada.
  const empresas = getEmpresaAtual();
  empresas.catch(() => {}); // se os termos redirecionarem antes, a rejeição daqui não fica solta
  const [usuario] = await Promise.all([getUsuario(), exigirAceiteTermos("/painel")]);
  const { atual, todas } = await empresas;
  // O banco já bloqueia os dados de quem não paga; aqui só levamos a pessoa para a tela de pagamento.
  const [assinatura, { pode, master, nivel, nome_plano }, vistos] = await Promise.all([getAssinatura(atual.id), getPermissoes(), telasVistas()]);
  if (!assinatura.liberada) redirect("/assinatura");
  const avisoAssinatura = master && ["teste", "aguardando", "atrasada", "cancelada"].includes(assinatura.status);
  const visiveis = GRUPOS.flatMap((g) => g.modulos).filter((m) => podeVerModulo(m, pode)).map((m) => m.slug);

  const dadosBarra: DadosBarra = {
    visiveis,
    master,
    empresa: {
      atual: atual.id,
      opcoes: todas.map((e) => ({ id: e.id, nome: nomeEmpresa(e) })),
      subtitulo: nome_plano ?? "Piscicultura de engorda",
    },
    email: usuario.email,
    // O menu já esconde o que o plano não inclui; o convite leva para os planos acima.
    plano: nivel && nivel !== "gestao" ? { nome: nome_plano ?? "Seu plano", convite: CONVITE_UPGRADE[nivel] ?? "Mais módulos nos outros planos." } : null,
  };

  // telas do menu que o service worker guarda de antemão para abrir sem internet (src/components/offline.tsx)
  const telasOffline = montarMenu(visiveis, { master }).flatMap((s) => s.itens.flatMap((i) => (i.tipo === "link" ? [i.href] : i.filhos.map((f) => f.href))));

  return (
    <div className="flex min-h-full flex-1 flex-col grade-app md:grid md:grid-cols-[var(--lateral)_minmax(0,1fr)]">
      <NavegacaoMovel marca={<MarcaBalbina tamanho={26} />} visiveis={visiveis}>
        <BarraLateral dados={dadosBarra} movel />
      </NavegacaoMovel>
      {/* Lateral de cristal solta da borda: aberta ou recolhida num trilho de ícones (src/components/barra-lateral.tsx). */}
      <BarraLateral dados={dadosBarra} />
      {/* Na versão completa a página encolhe para caber 1280px; este seletor flutua no canto, aumentado na mesma
          proporção, para voltar à versão do celular sem procurar na lateral. */}
      <div className="versao-flutuante">
        <SeletorVersao />
      </div>
      <Tutorial usuario={usuario.id} vistos={vistos} permitidas={chavesPermitidas(pode, master)} master={master} />
      <main className="min-w-0 px-4 pt-6 pb-28 md:px-10 md:py-10">
        <div className="cascata mx-auto w-full max-w-6xl">
          <ModoOffline telas={telasOffline} />
          {avisoAssinatura && (
            <p className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-elevado/60 px-3.5 py-2.5 text-sm">
              <span>{situacao(assinatura, hojeISO("America/Sao_Paulo"))}</span>
              <Link href="/assinatura" className={CLASSE_BOTAO_TEXTO}>
                {assinatura.status === "teste" && !assinatura.tem_assinatura ? "Assinar agora" : "Ver assinatura"}
              </Link>
            </p>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
