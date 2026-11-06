// Endereços vêm do .env.local (desenvolvimento) ou do perfil do eas.json (versões de teste e da loja).
export const CONFIG = {
  siteUrl: (process.env.EXPO_PUBLIC_SITE_URL ?? "").replace(/\/$/, ""),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? "",
  // "teste" mostra a faixa amarela, como no site de teste
  ambiente: process.env.EXPO_PUBLIC_AMBIENTE === "producao" ? "producao" : "teste",
  // Só no app de teste: o site de teste fica atrás do Deployment Protection da Vercel, que responde 401 a
  // quem não está logado na Vercel. Com o segredo de "Protection Bypass for Automation" o app passa.
  bypassVercel: process.env.EXPO_PUBLIC_AMBIENTE === "producao" ? "" : (process.env.EXPO_PUBLIC_VERCEL_BYPASS ?? ""),
} as const;
