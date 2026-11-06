import { PaginaTitulos } from "../_titulos/pagina";
import { exigirAcesso } from "@/lib/permissoes";

export default async function PaginaContasAPagar({ searchParams }: PageProps<"/contas-a-pagar">) {
  await exigirAcesso("contas-a-pagar");
  return <PaginaTitulos tipo="pagar" filtros={await searchParams} />;
}
