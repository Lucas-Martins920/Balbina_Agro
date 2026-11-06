// Login por usuário e senha (sem e-mail), criado pelo master. O Supabase Auth só entra por e-mail, então
// o usuário vira um e-mail interno no domínio reservado .test, que nunca entrega mensagem. A mesma regra
// está em app.dominio_login_local() e logins_locais.login (supabase/migrations/20261029223000_login_local.sql).
export const DOMINIO_LOGIN_LOCAL = "usuarios.balbina.test";
export const FORMATO_LOGIN = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function normalizarLogin(valor: unknown) {
  return String(valor ?? "").trim().toLowerCase();
}

export function emailDoLogin(login: string) {
  return `${normalizarLogin(login)}@${DOMINIO_LOGIN_LOCAL}`;
}

// Na tela de entrada vale e-mail ou usuário: sem @ é usuário.
export function emailDeEntrada(valor: unknown) {
  const v = String(valor ?? "").trim();
  return v.includes("@") ? v : emailDoLogin(v);
}

export function eLoginLocal(email: string | null | undefined) {
  return Boolean(email?.toLowerCase().endsWith(`@${DOMINIO_LOGIN_LOCAL}`));
}

export function loginDoEmail(email: string | null | undefined) {
  return eLoginLocal(email) ? email!.slice(0, -(DOMINIO_LOGIN_LOCAL.length + 1)) : null;
}
