import { PaginaTitulos } from "../_titulos/pagina";
import { exigirAcesso } from "@/lib/permissoes";

export default async function PaginaContasAReceber({ searchParams }: PageProps<"/contas-a-receber">) {
  await exigirAcesso("contas-a-receber");
  return <PaginaTitulos tipo="receber" filtros={await searchParams} />;
}
