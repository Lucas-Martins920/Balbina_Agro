import { redirect } from "next/navigation";
import { Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO } from "@/lib/formato";
import { getPermissoes } from "@/lib/permissoes";
import { linksRapidos, relatoriosVisiveis } from "@/lib/relatorios-catalogo";
import { CentralRelatorios } from "./central";

// Gestão > Relatórios: todos os relatórios do sistema num lugar só. Cada um continua com a permissão
// do seu assunto, então cada pessoa vê aqui só o que pode emitir.
export default async function PaginaCentralRelatorios({ searchParams }: PageProps<"/relatorios">) {
  const filtros = await searchParams;
  // links antigos da DRE (/relatorios?regime=caixa&ano=2026) continuam funcionando
  if (["regime", "ano", "cc", "ver"].some((k) => typeof filtros[k] === "string")) {
    const q = new URLSearchParams(Object.entries(filtros).filter((e): e is [string, string] => typeof e[1] === "string"));
    redirect(`/relatorios/dre?${q}`);
  }
  const { pode } = await getPermissoes();
  const visiveis = relatoriosVisiveis(pode);
  if (visiveis.length === 0) redirect("/sem-acesso?modulo=relatorios");
  const { atual } = await getEmpresaAtual();
  const hoje = hojeISO(atual.fuso);

  return (
    <div className="flex max-w-7xl flex-col gap-6">
      <Titulo descricao="Todos os relatórios do sistema num lugar só: abra na tela para filtrar o período ou baixe direto o arquivo do mês ou do ano.">
        Relatórios
      </Titulo>
      <CentralRelatorios itens={visiveis.map((r) => ({ ...r, links: linksRapidos(r, hoje) }))} />
    </div>
  );
}
