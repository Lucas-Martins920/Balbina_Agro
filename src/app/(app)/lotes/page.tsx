import Link from "next/link";
import { classeBotao, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { CadastroLotes, type Lote } from "./lista";

export default async function PaginaLotes() {
  await exigirAcesso("lotes");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: lotes }, { data: atuais }, { data: especies }, { data: viveiros }, { data: fornecedores }] = await Promise.all([
    supabase.from("lotes")
      .select("id, codigo, fase, especie_id, data_povoamento, qtd_povoada, peso_inicial_g, peso_alvo_g, custo_aquisicao_cents, fornecedor_id, previsao_despesca, observacoes, encerrado_em")
      .eq("empresa_id", atual.id).order("data_povoamento", { ascending: false }),
    supabase.from("alocacoes_atuais").select("lote_id, lote_codigo, viveiro_id, viveiro_nome, setor_nome, peixes_atuais, dias_cultivo, peso_medio_g, biomassa_kg, ultimo_apontamento").eq("empresa_id", atual.id),
    supabase.from("especies").select("id, nome, empresa_id").or(`empresa_id.is.null,empresa_id.eq.${atual.id}`).order("nome"),
    supabase.from("viveiros").select("id, nome, finalidade, capacidade_peixes, setores(nome)").eq("empresa_id", atual.id).eq("ativo", true).order("nome"),
    supabase.from("contatos").select("id, nome").eq("empresa_id", atual.id).eq("arquivado", false).contains("tipos", ["fornecedor"]).order("nome"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Titulo descricao="Lotes povoados, em que viveiro estão, quantos peixes e quantos kg têm hoje. Clique numa linha para editar; no código, abre o desempenho."
        acoes={<Link href="/lotes/especies" className={classeBotao("secundario", "sm")}>Espécies e curvas de crescimento</Link>}>
        Lotes
      </Titulo>
      <CadastroLotes
        lotes={(lotes ?? []) as Lote[]}
        locais={atuais ?? []}
        especies={(especies ?? []).map((l) => ({ id: l.id, nome: l.empresa_id ? `${l.nome} (sua)` : l.nome }))}
        viveiros={(viveiros ?? []).map((g) => ({ id: g.id, nome: `${(g.setores as unknown as { nome: string } | null)?.nome ?? ""} / ${g.nome}`, finalidade: g.finalidade, capacidade: g.capacidade_peixes }))}
        fornecedores={fornecedores ?? []}
        podeEditar={pode("lotes.editar")}
      />
    </div>
  );
}
