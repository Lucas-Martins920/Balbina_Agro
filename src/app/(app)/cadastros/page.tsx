import { Titulo, Aviso } from "@/components/ui";
import { GRUPOS, podeVerModulo } from "@/lib/modulos";
import { getPermissoes } from "@/lib/permissoes";
import { itensDoCadastro } from "@/lib/menu";
import { ListaCadastros } from "./lista";

// Hub dos cadastros: uma tela só, com busca, em vez de sete itens espalhados no menu.
export default async function PaginaCadastros() {
  const { pode } = await getPermissoes();
  const visiveis = GRUPOS.flatMap((g) => g.modulos).filter((m) => podeVerModulo(m, pode)).map((m) => m.slug);
  const itens = itensDoCadastro(visiveis);
  return (
    <>
      <Titulo descricao="Clientes, fornecedores, produtos, insumos, medicamentos, tabelas de preço, categorias e centros de custo, em um lugar só.">
        Cadastros
      </Titulo>
      {itens.length === 0 ? (
        <Aviso tipo="info">Você não tem acesso a nenhum cadastro. Peça ao master para liberar.</Aviso>
      ) : (
        <ListaCadastros itens={itens} />
      )}
    </>
  );
}
