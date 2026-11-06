import { Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { ListaMedicamentos, type Medicamento } from "./lista";

export default async function PaginaMedicamentos() {
  await exigirAcesso("sanidade");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: medicamentos }, { data: produtos }] = await Promise.all([
    supabase.from("medicamentos")
      .select("id, nome, tipo, principio_ativo, dose_por_unidade, unidade_dose, via, carencia_dias, produto_id, dose_por_unidade_estoque, observacoes, ativo")
      .eq("empresa_id", atual.id).order("nome"),
    supabase.from("produtos").select("id, nome, unidade, tipo").eq("empresa_id", atual.id).neq("tipo", "peixe").eq("ativo", true).order("nome"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Titulo descricao="Medicamentos, vitaminas e vacinas com a dose (por kg de ração ou por m³ de água) e a carência antes da despesca. O que for aplicado em cada viveiro é marcado no apontamento diário.">
        Medicamentos e vitaminas
      </Titulo>
      <ListaMedicamentos medicamentos={(medicamentos ?? []) as Medicamento[]} produtos={produtos ?? []} podeEditar={pode("sanidade.editar")} />
    </div>
  );
}
