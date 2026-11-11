import { CLASSE_BOTAO_TEXTO, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { hojeISO } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { vigenteEm } from "@/lib/vendas";
import Link from "next/link";
import { ListaProdutos, type GrupoProduto, type Produto } from "./lista";
import { ordenado } from "@/lib/ordem";

const TELAS: Record<GrupoProduto, { titulo: string; descricao: string; outra: { href: string; nome: string } }> = {
  venda: {
    titulo: "Produtos de venda",
    descricao: "O que a piscicultura vende: pescado por kg e em caixa de 20 kg, alevinos e outros itens. Só estes aparecem na tabela de preços, nas vendas e nas notas. O estoque de cada classe de peixe fica no produto “(estoque)”, em kg. Clique numa linha para editar ou lançar estoque.",
    outra: { href: "/insumos", nome: "Insumos da piscicultura (ração, ingredientes, embalagens, medicamentos)" },
  },
  consumo: {
    titulo: "Insumos da piscicultura",
    descricao: "O que a piscicultura compra e consome: ração, embalagens, calcário, adubo e medicamentos. Não pedem preço de venda. Na ração, preencha a ficha técnica (fabricante, proteína, grânulo, peso do saco e fase); as compras de ração entram numeradas, com lote e validade, na tela Estoque.",
    outra: { href: "/produtos", nome: "Produtos de venda" },
  },
};

// Mesma tela para as duas listas: /produtos (venda) e /insumos (consumo)
export async function CadastroProdutos({ grupo }: { grupo: GrupoProduto }) {
  await exigirAcesso("produtos");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: produtos }, { data: saldos }, { data: classes }, { data: categorias }, { data: precos }, { data: saldosDeposito }, { data: depositos }, { data: lotes }, { data: fichas }, { data: faixas }] = await Promise.all([
    supabase.from("produtos")
      .select("id, tipo, nome, sku, unidade, fator_kg, classe_peixe_id, ncm, cfop_padrao, categoria_financeira_id, custo_medio_cents, ativo, base_estoque, para_venda, estoque_minimo, observacoes, fabricante, proteina_pct, granulometria, saco_kg, fase_recomendada")
      .eq("empresa_id", atual.id).order("nome"),
    supabase.from("saldos_produtos").select("produto_id, saldo").eq("empresa_id", atual.id),
    supabase.from("classes_peixe").select("id, nome").eq("empresa_id", atual.id).order("ordem").order("nome"),
    supabase.from("categorias").select("id, nome, grupo, sentido, parent_id, ordem").eq("empresa_id", atual.id).eq("ativa", true).order("ordem").order("nome").then(ordenado),
    // preço de venda = preço na tabela padrão
    supabase.from("tabelas_preco").select("produto_id, preco_cents, vigencia, listas_preco!inner(padrao)")
      .eq("empresa_id", atual.id).is("cliente_id", null).eq("listas_preco.padrao", true),
    supabase.from("estoque_produtos").select("produto_id, deposito_id, saldo").eq("empresa_id", atual.id),
    supabase.from("depositos").select("id, nome").eq("empresa_id", atual.id).neq("tipo", "peixe").order("nome"),
    supabase.from("lotes").select("id, codigo").eq("empresa_id", atual.id).neq("fase", "encerrado").order("codigo"),
    supabase.from("produto_embalagens").select("produto_id, embalagem_id, quantidade").eq("empresa_id", atual.id),
    // fases da tabela de arraçoamento, para a ficha técnica da ração
    supabase.from("tabela_arracoamento").select("fase, peso_min_g").order("peso_min_g"),
  ]);
  const ficha = new Map<string, { embalagem_id: string; quantidade: number }[]>();
  for (const f of fichas ?? []) ficha.set(f.produto_id, [...(ficha.get(f.produto_id) ?? []), { embalagem_id: f.embalagem_id, quantidade: Number(f.quantidade) }]);
  const hoje = hojeISO(atual.fuso);
  const precoVenda = new Map((precos ?? []).filter((p) => vigenteEm(p.vigencia, hoje)).map((p) => [p.produto_id, Number(p.preco_cents)]));

  const saldo = new Map((saldos ?? []).map((s) => [s.produto_id, Number(s.saldo)]));

  return (
    <div className="flex flex-col gap-6">
      <Titulo descricao={TELAS[grupo].descricao}>{TELAS[grupo].titulo}</Titulo>
      <ListaProdutos
        grupo={grupo}
        produtos={((produtos ?? []) as Produto[]).map((p) => ({ ...p, saldo: saldo.get(p.id) ?? null, preco_venda: precoVenda.get(p.id) ?? null, embalagens: ficha.get(p.id) ?? [] }))}
        classes={classes ?? []}
        categorias={categorias ?? []}
        fases={[...new Set((faixas ?? []).map((f) => f.fase))]}
        podeEditar={pode("produtos.editar") || pode("estoque.editar") || pode("racao.editar")}
        podePreco={pode("vendas.precos")}
        estoque={{
          depositos: depositos ?? [],
          saldos: (saldosDeposito ?? []).map((s) => ({ ...s, saldo: Number(s.saldo) })),
          lotes: (lotes ?? []).map((l) => ({ id: l.id, nome: l.codigo })),
          podeLancar: pode("estoque.editar") || pode("racao.editar"),
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Link href={TELAS[grupo].outra.href} className={CLASSE_BOTAO_TEXTO}>{TELAS[grupo].outra.nome}</Link>
      </div>
    </div>
  );
}
