"use server";

import { mensagemBanco } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { TIPOS_DEPOSITO, TIPOS_PRODUTO } from "@/lib/estoque";
import { createClient } from "@/lib/supabase/server";

// Cadastro rápido de dentro de um lançamento ("+ Novo" ao lado da lista de escolha): cria só com o nome
// (e o tipo, para produto e depósito) e devolve o id para a lista já vir com ele escolhido. O resto do
// cadastro se completa depois na tela do cadastro. Quem pode inserir é decidido pelo RLS, como nas telas.
export type TipoRapido = "produto" | "deposito" | "fornecedor" | "cliente";
export type ResultadoRapido = { id: string; nome: string } | { erro: string };

export async function cadastrarRapido(tipo: TipoRapido, nome: string, subtipo?: string, documento?: string): Promise<ResultadoRapido> {
  const limpo = nome.trim();
  if (!limpo) return { erro: "Informe o nome." };
  if (limpo.length > 120) return { erro: "Nome muito longo." };
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();

  if (tipo === "produto") {
    const t = subtipo && subtipo in TIPOS_PRODUTO ? subtipo : "insumo_racao";
    const unidade = ["embalagem", "outro"].includes(t) ? "un" : t === "vacina" ? "dose" : t === "medicamento" ? "ml" : "kg";
    const { data, error } = await supabase.from("produtos").insert({ empresa_id: atual.id, nome: limpo, tipo: t, unidade }).select("id, nome, unidade").single();
    if (error) return { erro: mensagemBanco(error) };
    return { id: data.id, nome: `${data.nome} (${data.unidade})` };
  }
  if (tipo === "deposito") {
    const t = subtipo && subtipo in TIPOS_DEPOSITO ? subtipo : "insumos";
    const { data, error } = await supabase.from("depositos").insert({ empresa_id: atual.id, nome: limpo, tipo: t }).select("id, nome").single();
    if (error) return { erro: mensagemBanco(error) };
    return data;
  }
  // fornecedor/cliente: CPF ou CNPJ opcional; se já houver cadastro com ele, usa o existente
  const doc = (documento ?? "").replace(/\D/g, "");
  if (doc && doc.length !== 11 && doc.length !== 14) return { erro: "CPF tem 11 números e CNPJ tem 14." };
  if (doc) {
    const { data: existe } = await supabase.from("contatos").select("id, nome").eq("empresa_id", atual.id).eq("cpf_cnpj", doc).maybeSingle();
    if (existe) return existe;
  }
  const { data, error } = await supabase.from("contatos").insert({ empresa_id: atual.id, nome: limpo, tipos: [tipo], cpf_cnpj: doc || null }).select("id, nome").single();
  if (error) return { erro: mensagemBanco(error) };
  return data;
}
