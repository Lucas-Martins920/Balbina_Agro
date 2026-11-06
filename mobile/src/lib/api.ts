import { CONFIG } from "@/config";
import { supabase } from "./supabase";

export class ErroApi extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
    readonly dados: Record<string, unknown> = {},
  ) {
    super(mensagem);
  }
}

// Rotas do site feitas para o app (/api/app/*), que conferem o token em vez do cookie.
// Manda o token da sessão no cabeçalho; sem internet, lança ErroApi com status 0.
export async function chamarSite<T>(caminho: string, corpo: unknown, opcoes: { semSessao?: boolean } = {}): Promise<T> {
  const cabecalhos: Record<string, string> = { "Content-Type": "application/json" };
  if (CONFIG.bypassVercel) cabecalhos["x-vercel-protection-bypass"] = CONFIG.bypassVercel;
  if (!opcoes.semSessao) {
    const { data } = await supabase.auth.getSession();
    if (data.session) cabecalhos.Authorization = `Bearer ${data.session.access_token}`;
  }
  let resposta: Response;
  try {
    resposta = await fetch(`${CONFIG.siteUrl}${caminho}`, { method: "POST", headers: cabecalhos, body: JSON.stringify(corpo) });
  } catch {
    throw new ErroApi("Sem conexão com a internet.", 0);
  }
  const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resposta.ok) {
    // 401 sem a resposta do site (página da Vercel): o site de teste está protegido e o app não tem o segredo
    const protegido = resposta.status === 401 && typeof dados.erro !== "string" && CONFIG.ambiente === "teste";
    const mensagem = typeof dados.erro === "string" ? dados.erro : protegido ? "O site de teste está protegido pela Vercel: falta o segredo EXPO_PUBLIC_VERCEL_BYPASS no build." : `Erro ${resposta.status}`;
    throw new ErroApi(mensagem, resposta.status, dados);
  }
  return dados as T;
}
