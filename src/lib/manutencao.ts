// Modo manutenção: com BALBINA_MANUTENCAO=1 na Vercel, nenhuma tela nem API toca o banco.
// Usado na troca de servidor (como na do FINAVI, docs/legado/finavi/migrar-sao-paulo.md), para ninguém gravar durante a cópia.
// Webhooks (Asaas, Focus, Pluggy) recebem 503 e o remetente tenta de novo mais tarde.
const VOLTA_EM_SEGUNDOS = 900;

const PAGINA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Balbina em manutenção</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: Canvas; color: CanvasText; }
  main { max-width: 28rem; padding: 1.5rem; text-align: center; }
  p { opacity: .75; line-height: 1.5; }
</style>
</head>
<body>
<main>
  <h1>Balbina em manutenção</h1>
  <p>Estamos trocando o servidor para deixar o sistema mais rápido. Seus dados estão guardados. Volte em alguns minutos.</p>
  <p>Apontamentos feitos no celular sem sinal ficam no aparelho e são enviados depois.</p>
</main>
</body>
</html>`;

type Env = Record<string, string | undefined>;

export function emManutencao(env: Env = process.env) {
  return env.BALBINA_MANUTENCAO === "1";
}

export function respostaManutencao(caminho: string): Response {
  const headers = { "Retry-After": String(VOLTA_EM_SEGUNDOS), "Cache-Control": "no-store" };
  if (caminho === "/api" || caminho.startsWith("/api/")) {
    return Response.json({ erro: "Balbina em manutenção. Tente de novo em alguns minutos." }, { status: 503, headers });
  }
  return new Response(PAGINA, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
