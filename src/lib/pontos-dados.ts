import "server-only";
import { cookies } from "next/headers";
import { cookiePonto } from "@/lib/pontos";
import { createClient } from "@/lib/supabase/server";

export type PontoVenda = {
  id: string;
  nome: string;
  tipo: string;
  sede: boolean;
  ativo: boolean;
  municipio: string | null;
  uf: string | null;
  endereco: string | null;
  documento: string | null;
  inscricao_estadual: string | null;
  conta_caixa_id: string | null;
  centro_custo_id: string | null;
  observacoes: string | null;
};

const COLUNAS = "id, nome, tipo, sede, ativo, municipio, uf, endereco, documento, inscricao_estadual, conta_caixa_id, centro_custo_id, observacoes";

// Pontos da empresa: a piscicultura (sede) primeiro, depois os outros por nome
export async function carregarPontos(empresa: string): Promise<PontoVenda[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("pontos_venda").select(COLUNAS).eq("empresa_id", empresa)
    .order("sede", { ascending: false }).order("nome");
  return (data ?? []) as PontoVenda[];
}

// Ponto em que o PDV deste navegador vende: o escolhido (se ainda ativo) ou a piscicultura
export async function pontoDoPdv(empresa: string, pontos: PontoVenda[]): Promise<PontoVenda | null> {
  const ativos = pontos.filter((p) => p.ativo);
  const escolhido = (await cookies()).get(cookiePonto(empresa))?.value;
  return ativos.find((p) => p.id === escolhido) ?? ativos.find((p) => p.sede) ?? ativos[0] ?? null;
}
