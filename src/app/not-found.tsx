import { LinkBotao } from "@/components/ui";
import { MarcaBalbina } from "@/components/marca";

export default function NaoEncontrado() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <MarcaBalbina comNome={false} tamanho={36} />
      <div>
        <h1 className="text-xl font-semibold">Página não encontrada</h1>
        <p className="mt-1 text-sm text-texto-suave">O endereço pode ter mudado ou o item foi removido.</p>
      </div>
      <LinkBotao href="/painel">Voltar ao painel</LinkBotao>
    </main>
  );
}
