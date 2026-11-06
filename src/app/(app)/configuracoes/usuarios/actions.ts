"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { emailDoLogin, FORMATO_LOGIN, normalizarLogin } from "@/lib/login-local";
import { getPermissoes } from "@/lib/permissoes";
import { CHAVES_VALIDAS, chavesDoCargo, PERFIS } from "@/lib/permissoes-regras";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// O campo "cargo" traz um cargo pronto (perfil) ou "cargo:<id>" para um cargo criado pela empresa.
function lerAcesso(form: FormData) {
  const cargo = String(form.get("cargo") ?? "");
  const daEmpresa = cargo.startsWith("cargo:") ? cargo.slice(6) : null;
  const perfil = daEmpresa ? "personalizado" : cargo;
  const permissoes = form.getAll("permissoes").map(String).filter((c) => CHAVES_VALIDAS.has(c));
  const nome = String(form.get("nome") ?? "").trim() || null;
  return { perfil, cargo: daEmpresa, permissoes, nome, master: form.get("master") === "on" };
}

// Manda o e-mail de convite do Supabase; o link abre /auth/convite para a pessoa definir a senha.
// Sem a chave secreta, ou se o e-mail já tem conta sem confirmar, o convite fica só no banco.
async function enviarEmailConvite(email: string) {
  if (!process.env.SUPABASE_SECRET_KEY) return false;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email, { redirectTo: `${site}/auth/convite` });
  return !error;
}

export async function convidarUsuario(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const { perfil, cargo, permissoes, nome, master } = lerAcesso(form);
  if (!email.includes("@")) return falha("Informe o e-mail da pessoa.");
  if (!(perfil in PERFIS)) return falha("Escolha o cargo.");

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convidar_usuario", {
    p_empresa: atual.id, p_email: email, p_perfil: perfil, p_permissoes: permissoes, p_master: master, p_nome: nome, p_cargo: cargo,
  });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/configuracoes/usuarios");
  if (data === "adicionado") return sucesso(`${email} já tinha conta e entrou na empresa.`);
  if (await enviarEmailConvite(email)) return sucesso(`Convite enviado para ${email}. O link do e-mail leva direto para definir a senha.`);
  return sucesso(`Convite criado. Peça para ${email} criar a conta (ou entrar) com este e-mail em ${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/login.`);
}

export async function atualizarUsuario(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const userId = String(form.get("user_id") ?? "");
  const { perfil, cargo, permissoes, nome, master } = lerAcesso(form);
  if (!(perfil in PERFIS)) return falha("Escolha o cargo.");

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_usuario", {
    p_empresa: atual.id, p_user: userId, p_perfil: perfil, p_permissoes: permissoes, p_master: master,
    p_ativo: form.get("ativo") === "on", p_nome: nome, p_cargo: cargo,
  });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/configuracoes/usuarios");
  return sucesso("Acesso atualizado.");
}

export async function removerUsuario(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const userId = String(form.get("user_id") ?? "");
  // login por usuário só existe nesta empresa: sai da empresa e a conta é apagada junto
  const { data: login } = await supabase.from("logins_locais").select("login").eq("empresa_id", atual.id).eq("user_id", userId).maybeSingle();
  const { error } = await supabase.rpc("remover_usuario", { p_empresa: atual.id, p_user: userId });
  if (error) return falha(mensagemBanco(error));
  if (login) await createAdminClient().auth.admin.deleteUser(userId).catch(() => null);
  revalidatePath("/configuracoes/usuarios");
  return sucesso(login ? `Usuário ${login.login} removido e apagado.` : "Usuário removido da empresa.");
}

// Login por usuário e senha, para quem não tem e-mail. O master cria a conta com a senha inicial;
// a pessoa troca a senha no primeiro acesso. A conta nasce pela chave de serviço, já confirmada, e só
// entra na empresa por registrar_login_local (que confere de novo que quem pede é o master).
export async function criarLoginLocal(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const login = normalizarLogin(form.get("login"));
  const senha = String(form.get("senha") ?? "");
  const { perfil, cargo, permissoes, nome } = lerAcesso(form);
  if (!nome) return falha("Informe o nome da pessoa.");
  if (!FORMATO_LOGIN.test(login)) return falha("Usuário inválido: use de 3 a 30 letras minúsculas sem acento, números, ponto, hífen ou sublinhado.");
  if (senha.length < 8) return falha("A senha inicial precisa de pelo menos 8 caracteres.");
  if (!(perfil in PERFIS)) return falha("Escolha o cargo.");
  if (!(await getPermissoes()).master) return falha("Só o usuário master da empresa pode gerenciar usuários.");
  if (!process.env.SUPABASE_SECRET_KEY) return falha("O login por usuário precisa da chave secreta do Supabase (SUPABASE_SECRET_KEY) no servidor.");

  const { atual } = await getEmpresaAtual();
  const admin = createAdminClient();
  const { data: criado, error: erroConta } = await admin.auth.admin.createUser({
    email: emailDoLogin(login), password: senha, email_confirm: true, app_metadata: { login_local: true }, user_metadata: { nome },
  });
  if (erroConta || !criado.user) {
    return falha(/registered|exists/i.test(erroConta?.message ?? "") ? "Este usuário já existe. Escolha outro nome de usuário." : `Não foi possível criar o login: ${erroConta?.message}`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_login_local", {
    p_empresa: atual.id, p_user: criado.user.id, p_login: login, p_nome: nome, p_perfil: perfil, p_permissoes: permissoes,
    p_cargo: cargo, p_dispensa_2fa: form.get("sem_2fa") === "on",
  });
  if (error) {
    await admin.auth.admin.deleteUser(criado.user.id).catch(() => null);
    return falha(mensagemBanco(error));
  }
  revalidatePath("/configuracoes/usuarios");
  return sucesso(`Login criado. A pessoa entra com o usuário ${login} e a senha que você definiu, e troca a senha no primeiro acesso.`);
}

// Nova senha dada pelo master (a pessoa esqueceu): vale para um acesso, depois ela troca.
export async function novaSenhaLoginLocal(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const userId = String(form.get("user_id") ?? "");
  const senha = String(form.get("senha") ?? "");
  if (senha.length < 8) return falha("A senha precisa de pelo menos 8 caracteres.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("exigir_troca_senha", { p_empresa: atual.id, p_user: userId });
  if (error) return falha(mensagemBanco(error));
  const { error: erroSenha } = await createAdminClient().auth.admin.updateUserById(userId, { password: senha });
  if (erroSenha) return falha(`Não foi possível trocar a senha: ${erroSenha.message}`);
  return sucesso("Senha nova definida. A pessoa troca de novo no próximo acesso.");
}

// Perdeu o celular: apaga o app autenticador do login; no próximo acesso ele cadastra de novo.
export async function zerarAppLoginLocal(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const userId = String(form.get("user_id") ?? "");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("login_local_da_empresa", { p_empresa: atual.id, p_user: userId });
  if (error) return falha(mensagemBanco(error));
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.mfa.listFactors({ userId });
  for (const f of data?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
  return sucesso("App autenticador zerado. No próximo acesso a pessoa cadastra o app de novo.");
}

export async function definirDispensa2fa(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const dispensa = form.get("sem_2fa") === "on";
  const { error } = await supabase.rpc("definir_dispensa_2fa", { p_empresa: atual.id, p_user: String(form.get("user_id") ?? ""), p_dispensa: dispensa });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/configuracoes/usuarios");
  return sucesso(dispensa ? "Liberado sem 2º fator." : "O 2º fator (app autenticador) passa a ser pedido no próximo acesso.");
}

export async function cancelarConvite(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_convite", { p_convite: String(form.get("id") ?? "") });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/configuracoes/usuarios");
  return sucesso("Convite cancelado.");
}

// Cargo da empresa: nome, descrição e permissões. "Começar de" soma as permissões de um cargo pronto.
export async function salvarCargo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = String(form.get("id") ?? "") || null;
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome) return falha("Dê um nome ao cargo.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();

  let base: string[] = [];
  const partida = String(form.get("base") ?? "");
  if (partida && partida in PERFIS) {
    const { data } = await supabase.rpc("permissoes_dos_perfis");
    base = ((data ?? {}) as Record<string, string[]>)[partida] ?? [];
  }
  const permissoes = chavesDoCargo(form.getAll("permissoes").map(String), base);
  if (permissoes.length === 0) return falha("Marque pelo menos uma permissão ou escolha um cargo pronto para começar.");

  const { error } = await supabase.rpc("salvar_cargo", {
    p_empresa: atual.id, p_id: id, p_nome: nome, p_descricao: String(form.get("descricao") ?? ""), p_permissoes: permissoes,
  });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/configuracoes/usuarios");
  return sucesso(id ? `Cargo ${nome} atualizado. Quem tem esse cargo já está com o acesso novo.` : `Cargo ${nome} criado.`);
}

export async function apagarCargo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("apagar_cargo", { p_cargo: String(form.get("id") ?? "") });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/configuracoes/usuarios");
  return sucesso("Cargo apagado.");
}
