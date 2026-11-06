import { Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { ListaCentros, type Centro } from "./lista";

export default async function PaginaCentrosCusto() {
  await exigirAcesso("centros-de-custo");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data } = await supabase.from("centros_custo").select("id, nome, tipo, parent_id, ordem, ativo").eq("empresa_id", atual.id).order("ordem").order("nome");

  return (
    <div className="flex flex-col gap-6">
      <Titulo descricao="Onde cada gasto cai. Setores, viveiros e lotes ganham o seu sozinhos quando são cadastrados e viram o custo por lote.">
        Centros de custo
      </Titulo>
      <ListaCentros centros={(data ?? []) as Centro[]} podeEditar={pode("centros-de-custo.editar") || pode("configuracoes.editar")} />
    </div>
  );
}
