import { Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { lerTodas } from "@/lib/supabase/todas";
import { ListaContatos, type Contato } from "./lista";

const PODE_EDITAR = ["contatos.editar", "contas-a-pagar.editar", "contas-a-receber.editar", "vendas.lancar", "cobrancas.emitir", "configuracoes.editar"];

export default async function PaginaContatos({ searchParams }: PageProps<"/contatos">) {
  await exigirAcesso("contatos");
  const filtros = await searchParams;
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data }, { data: listas }] = await Promise.all([
    lerTodas(() => supabase.from("contatos")
      .select("id, tipos, nome, cpf_cnpj, inscricao_estadual, produtor_rural, email, telefone, endereco, cidade, uf, observacoes, arquivado, lista_preco_id")
      .eq("empresa_id", atual.id).order("nome").order("id"), 5000),
    supabase.from("listas_preco").select("id, nome, padrao, ativa").eq("empresa_id", atual.id).order("padrao", { ascending: false }).order("nome"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Titulo descricao="Documento e endereço completos são necessários para emitir NF-e e cobrança. Produtor rural pessoa física usa CPF com inscrição estadual.">
        Clientes e fornecedores
      </Titulo>
      <ListaContatos
        contatos={(data ?? []) as Contato[]}
        tabelas={listas ?? []}
        tipoInicial={typeof filtros.tipo === "string" ? filtros.tipo : "cliente"}
        podeEditar={PODE_EDITAR.some((p) => pode(p))}
      />
    </div>
  );
}
