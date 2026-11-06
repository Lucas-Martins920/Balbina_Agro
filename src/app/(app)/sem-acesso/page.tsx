import Link from "next/link";
import { Cartao, classeBotao, LinkBotao, Titulo } from "@/components/ui";
import { nivelQueLibera, type NivelPlano } from "@/lib/assinatura-mapa";
import { encontrarModulo } from "@/lib/modulos";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

export default async function PaginaSemAcesso({ searchParams }: PageProps<"/sem-acesso">) {
  const { modulo } = await searchParams;
  const slug = typeof modulo === "string" ? modulo : "";
  const mod = encontrarModulo(slug);
  const nome = slug === "usuarios" ? "Usuários e cargos" : mod?.nome;
  const { noPlano, master } = await getPermissoes();
  const chave = mod?.permissao ?? slug;

  // Fora do plano: convida para o plano que libera o módulo, em vez de mandar pedir permissão.
  if (slug && !noPlano(chave)) {
    const supabase = await createClient();
    const { data: niveis } = await supabase.from("niveis_plano").select("id, nome, descricao, ordem, modulos").returns<NivelPlano[]>();
    const plano = nivelQueLibera(niveis ?? [], chave);
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <Titulo>{nome ?? "Módulo"} não está no seu plano</Titulo>
        <Cartao>
          <p className="text-sm">
            {nome ? <strong>{nome}</strong> : "Esta tela"} faz parte do plano {plano ? <strong>{plano.nome}</strong> : "Gestão"}
            {plano?.descricao ? `: ${plano.descricao}` : "."}
          </p>
          <p className="mt-2 text-sm text-texto-suave">
            {master ? "Troque de plano quando quiser. Os dados que você já lançou continuam como estão." : "Peça ao usuário master da empresa para trocar de plano."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {master && <LinkBotao href="/assinatura">Conhecer os planos</LinkBotao>}
            <Link href="/painel" className={classeBotao("secundario", "sm")}>Voltar ao painel</Link>
          </div>
        </Cartao>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Titulo>Sem acesso</Titulo>
      <Cartao>
        <p className="text-sm">
          Seu usuário não tem permissão para abrir {nome ? <strong>{nome}</strong> : "esta tela"}.
          Peça ao usuário master da empresa para liberar o acesso em Usuários e cargos.
        </p>
        <Link href="/painel" className={`${classeBotao("secundario", "sm")} mt-3`}>Voltar ao painel</Link>
      </Cartao>
    </div>
  );
}
