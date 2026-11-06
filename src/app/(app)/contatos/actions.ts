"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { cnpjValido, cpfValido } from "@/lib/documento";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";

const TIPOS = ["cliente", "fornecedor", "funcionario", "socio"];

export async function salvarContato(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const id = t("id");
  const tipos = form.getAll("tipos").map(String).filter((x) => TIPOS.includes(x));
  const pessoa = t("pessoa") === "juridica" ? "juridica" : "fisica";
  const doc = t("cpf_cnpj").replace(/\D/g, "");
  const ie = t("inscricao_estadual");
  const produtorRural = pessoa === "fisica" && form.get("produtor_rural") === "on";
  const cep = t("cep").replace(/\D/g, "");
  const uf = t("uf").toUpperCase();

  if (!t("nome")) return falha(pessoa === "fisica" ? "Informe o nome." : "Informe a razão social.");
  if (tipos.length === 0) return falha("Marque se é cliente, fornecedor, funcionário ou sócio.");
  if (doc && pessoa === "fisica" && !cpfValido(doc)) return falha("CPF inválido. Confira os números.");
  if (doc && pessoa === "juridica" && !cnpjValido(doc)) return falha("CNPJ inválido. Confira os números.");
  if (produtorRural && (!doc || !ie)) return falha("Produtor rural precisa de CPF e inscrição estadual para a nota fiscal.");
  if (cep && cep.length !== 8) return falha("CEP tem 8 números.");
  if (uf && !/^[A-Z]{2}$/.test(uf)) return falha("UF com duas letras.");
  const email = t("email");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return falha("E-mail inválido.");

  const supabase = await createClient();
  const anterior = id ? (await supabase.from("contatos").select("endereco").eq("id", id).maybeSingle()).data : null;
  const dados = {
    tipos, nome: t("nome"), cpf_cnpj: doc || null, inscricao_estadual: ie || null, produtor_rural: produtorRural,
    email: email || null, telefone: t("telefone") || null, cidade: t("cidade") || null, uf: uf || null,
    endereco: { ...((anterior?.endereco as object) ?? {}), logradouro: t("logradouro"), numero: t("numero"), complemento: t("complemento"), bairro: t("bairro"), cep },
    observacoes: t("observacoes") || null,
    // o campo só aparece quando há mais de uma tabela; sem ele, não mexe
    ...(form.has("lista_preco_id") ? { lista_preco_id: t("lista_preco_id") || null } : {}),
    arquivado: form.get("arquivado") === "on",
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error, count } = await supabase.from("contatos").update(dados, { count: "exact" }).eq("id", id);
    if (error) return falha(mensagemBanco(error));
    if (!count) return falha("Seu usuário não tem permissão para editar este cadastro.");
  } else {
    const { atual } = await getEmpresaAtual();
    const { error } = await supabase.from("contatos").insert({ ...dados, empresa_id: atual.id });
    if (error) return falha(error.code === "23505" ? "Já existe um cadastro com este CPF ou CNPJ." : mensagemBanco(error));
  }
  revalidatePath("/contatos");
  return sucesso(id ? `${dados.nome} atualizado.` : `${dados.nome} cadastrado.`);
}

export async function excluirContato(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = String(form.get("id") ?? "");
  const supabase = await createClient();
  const { error, count } = await supabase.from("contatos").delete({ count: "exact" }).eq("id", id);
  if (error) {
    if (error.code === "23503") return falha("Este cadastro tem lançamentos, pedidos ou notas. Arquive em vez de excluir.");
    return falha(mensagemBanco(error));
  }
  if (!count) return falha("Seu usuário não tem permissão para excluir este cadastro.");
  revalidatePath("/contatos");
  return sucesso("Cadastro excluído.");
}
