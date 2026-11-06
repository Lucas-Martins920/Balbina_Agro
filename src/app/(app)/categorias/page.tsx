import { Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { ListaCategorias, type Categoria } from "./lista";

export default async function PaginaCategorias() {
  await exigirAcesso("categorias");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data } = await supabase.from("categorias")
    .select("id, nome, grupo, sentido, parent_id, ordem, codigo, componente_custo, sistema, ativa")
    .eq("empresa_id", atual.id).order("ordem").order("nome");

  return (
    <div className="flex flex-col gap-6">
      <Titulo descricao="Plano de categorias de entradas e saídas. Ele organiza contas a pagar e a receber e vira o DRE.">
        Categorias
      </Titulo>
      <ListaCategorias categorias={(data ?? []) as Categoria[]} podeEditar={pode("categorias.editar") || pode("configuracoes.editar")} />
    </div>
  );
}
