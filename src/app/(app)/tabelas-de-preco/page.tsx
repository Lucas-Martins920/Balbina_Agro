import Link from "next/link";
import { CLASSE_BOTAO_TEXTO, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO } from "@/lib/formato";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { vigenteEm, type ListaPreco } from "@/lib/vendas";
import { ListaTabelas, type ProdutoPreco, type Tabela } from "./lista";

export default async function PaginaTabelasDePreco() {
  await exigirAcesso("vendas");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const hoje = hojeISO(atual.fuso);
  const [{ data: listas }, { data: produtos }, { data: precos }, { data: clientes }] = await Promise.all([
    supabase.from("listas_preco").select("id, nome, padrao, ajuste_pct, ativa, observacoes").eq("empresa_id", atual.id)
      .order("padrao", { ascending: false }).order("nome"),
    supabase.from("produtos").select("id, nome, tipo, unidade").eq("empresa_id", atual.id).eq("ativo", true).eq("base_estoque", false).eq("para_venda", true).order("nome"),
    supabase.from("tabelas_preco").select("lista_id, produto_id, preco_cents, vigencia").eq("empresa_id", atual.id).is("cliente_id", null),
    supabase.from("contatos").select("lista_preco_id").eq("empresa_id", atual.id).not("lista_preco_id", "is", null),
  ]);

  // preço de hoje de cada produto em cada tabela
  const vigentes: Record<string, Record<string, number>> = {};
  for (const p of precos ?? []) {
    if (!vigenteEm(p.vigencia, hoje)) continue;
    (vigentes[p.lista_id] ??= {})[p.produto_id] = Number(p.preco_cents);
  }
  const clientesPorLista = new Map<string, number>();
  for (const c of clientes ?? []) clientesPorLista.set(c.lista_preco_id!, (clientesPorLista.get(c.lista_preco_id!) ?? 0) + 1);

  // pescado primeiro, que é o que mais se vende
  const ordenados = ((produtos ?? []) as ProdutoPreco[]).sort((a, b) => Number(b.tipo === "peixe") - Number(a.tipo === "peixe") || a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div className="flex flex-col gap-6">
      <Titulo descricao="A tabela padrão vale para todos os produtos e clientes. Crie outras (atacado, varejo, revenda) com preço próprio ou um ajuste em % e ligue cada cliente à sua no cadastro dele. Mudar um preço vale a partir de hoje e o antigo fica no histórico.">
        Tabelas de preço
      </Titulo>
      <ListaTabelas
        tabelas={((listas ?? []) as (ListaPreco & { observacoes: string | null })[]).map((l): Tabela => ({
          ...l, ajuste_pct: Number(l.ajuste_pct), precos: vigentes[l.id] ?? {}, clientes: clientesPorLista.get(l.id) ?? 0,
        }))}
        produtos={ordenados}
        podeEditar={pode("vendas.precos")}
        rodape={<Link href="/vendas/precos" className={CLASSE_BOTAO_TEXTO}>Preços especiais por cliente</Link>}
      />
    </div>
  );
}
