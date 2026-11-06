import { plural } from "./formato.ts";

// Texto para quem está com o login travado (public.login_bloqueado_ate: 5 senhas erradas em 15 minutos).
export function mensagemBloqueio(ate: string | null, agora = new Date()) {
  if (!ate) return null;
  const minutos = Math.ceil((new Date(ate).getTime() - agora.getTime()) / 60000);
  if (minutos <= 0) return null;
  return `Muitas tentativas com senha errada. Por segurança, espere ${plural(minutos, "minuto", "minutos")} e tente de novo.`;
}
