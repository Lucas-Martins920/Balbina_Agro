import { Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarInteiro, formatarNumero } from "@/lib/formato";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { CadastroPiscicultura, type Classe, type Viveiro, type Setor } from "./lista";

export default async function PaginaPiscicultura() {
  await exigirAcesso("piscicultura");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: setores }, { data: viveiros }, { data: ocupacao }, { data: classes }] = await Promise.all([
    supabase.from("setores").select("id, nome, registro_sanitario, endereco, ativo").eq("empresa_id", atual.id).order("nome"),
    supabase.from("viveiros").select("id, nome, setor_id, finalidade, sistema, capacidade_peixes, area_m2, volume_m3, profundidade_m, aeracao, ativo")
      .eq("empresa_id", atual.id).order("nome"),
    supabase.from("alocacoes_atuais").select("viveiro_id, lote_codigo, peixes_atuais").eq("empresa_id", atual.id),
    supabase.from("classes_peixe").select("id, nome, peso_min_g, peso_max_g, comercializavel, ordem, sem_classificacao").eq("empresa_id", atual.id).order("ordem").order("nome"),
  ]);

  const lote = new Map<string, string>();
  for (const o of ocupacao ?? []) lote.set(o.viveiro_id, `${o.lote_codigo} · ${formatarInteiro(o.peixes_atuais)} peixes`);
  const ativos = (viveiros ?? []).filter((g) => g.ativo);
  const capacidadeTotal = ativos.reduce((s, g) => s + g.capacidade_peixes, 0);
  const lamina = ativos.reduce((s, g) => s + (Number(g.area_m2) || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <Titulo descricao={`${setores?.length ?? 0} setores, ${viveiros?.length ?? 0} viveiros, capacidade de ${formatarInteiro(capacidadeTotal)} peixes${lamina ? `, ${formatarNumero(lamina / 10000, 2)} ha de lâmina d'água` : ""}. Clique numa linha para editar.`}>
        Piscicultura
      </Titulo>
      <CadastroPiscicultura
        setores={(setores ?? []) as Setor[]}
        viveiros={((viveiros ?? []) as Viveiro[]).map((g) => ({ ...g, lote: lote.get(g.id) ?? null }))}
        classes={(classes ?? []) as Classe[]}
        podeEditar={pode("piscicultura.editar")}
        podeEditarClasses={pode("estoque.editar") || pode("configuracoes.editar")}
      />
    </div>
  );
}
