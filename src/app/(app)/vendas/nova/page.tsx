import { LinkBotao, Titulo } from "@/components/ui";
import { NovaVenda } from "@/components/vendas/nova-venda";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso } from "@/lib/permissoes";
import { hojeISO } from "@/lib/formato";
import { carregarPontos } from "@/lib/pontos-dados";
import { carregarCatalogo } from "@/lib/vendas-dados";

export default async function PaginaNovaVenda({ searchParams }: PageProps<"/vendas/nova">) {
  await exigirAcesso("vendas");
  const params = await searchParams;
  const { atual } = await getEmpresaAtual();
  const [catalogo, pontos] = await Promise.all([carregarCatalogo(atual.id), carregarPontos(atual.id)]);
  const cliente = typeof params.cliente === "string" ? params.cliente : undefined;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Titulo descricao="Escolha o cliente, toque nos produtos e confirme." acoes={<LinkBotao href="/vendas" variante="fantasma">Voltar às vendas</LinkBotao>}>
        Nova venda
      </Titulo>
      <NovaVenda {...catalogo} hoje={hojeISO(atual.fuso)} clienteInicial={cliente} repetir={params.repetir === "1"}
        pontos={pontos.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome }))} />
    </div>
  );
}
