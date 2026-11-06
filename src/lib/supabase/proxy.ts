import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";
import { falhaTemporaria } from "./falha-auth";

// webhooks e rotinas agendadas chegam sem sessão e se autenticam por token próprio
const ROTAS_PUBLICAS = ["/login", "/auth", "/api/webhooks", "/api/cron", "/api/entrada", "/pedido", "/termos", "/privacidade", "/cookies", "/app-captcha"];

// Renova a sessão a cada navegação e manda quem não está logado para /login.
export async function updateSession(request: NextRequest) {
  // API pública: autentica pela chave da API, não pela sessão
  if (request.nextUrl.pathname === "/api/v1" || request.nextUrl.pathname.startsWith("/api/v1/")) return NextResponse.next();
  // App de celular (pasta mobile/): cada rota confere o token do cabeçalho (src/lib/app-celular/sessao.ts)
  if (request.nextUrl.pathname.startsWith("/api/app/")) return NextResponse.next();
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [nome, valor] of Object.entries(headers ?? {})) {
          response.headers.set(nome, valor);
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const logado = Boolean(data?.claims);
  const caminho = request.nextUrl.pathname;
  const publica = ROTAS_PUBLICAS.some((r) => caminho === r || caminho.startsWith(`${r}/`));

  // Se o Auth falhou por rede, timeout ou 5xx, pode ser instabilidade do servidor e não sessão
  // inválida. Em vez de mandar pro login (que expulsaria quem está logado), retorna 503 para o
  // navegador tentar de novo. Sessão vencida ou recusada (4xx, token inválido) cai no login abaixo.
  if (error && !logado && !publica && falhaTemporaria(error)) {
    if (caminho.startsWith("/api/")) return NextResponse.json({ erro: "Serviço temporariamente indisponível." }, { status: 503 });
    return new NextResponse("Serviço temporariamente indisponível. Tente novamente em alguns segundos.", { status: 503, headers: { "Retry-After": "5" } });
  }

  if (!logado && !publica) {
    // o app de campo chama a API em segundo plano: responde 401 em vez de mandar para o login
    if (caminho.startsWith("/api/")) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.searchParams.set("voltar", caminho);
    // leva junto a limpeza dos cookies da sessão morta, senão o navegador volta com eles
    const redirecionar = NextResponse.redirect(destino);
    for (const cookie of response.cookies.getAll()) redirecionar.cookies.set(cookie);
    return redirecionar;
  }
  return response;
}
