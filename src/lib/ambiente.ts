// Diz onde o app está rodando: produção, fora dela (`npm run dev` na máquina, um preview da Vercel) ou no
// site de teste (preview do branch Teste-Desevolvimento ligado ao Supabase de teste, docs/site-de-teste.md),
// e se, por engano, está ligado ao banco de produção. Como rodar local: docs/rodar-local.md.
const BANCO_NA_NUVEM = /^https:\/\/[a-z0-9]+\.supabase\.co/;

type Env = Record<string, string | undefined>;

// BALBINA_REF_PRODUCAO: o Reference ID do projeto Supabase de produção (Settings > General), separado por vírgula
// se houver mais de um. Com ele, um preview ligado por engano ao banco de produção nunca conta como teste.
export function ambiente(env: Env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const refsProducao = (env.BALBINA_REF_PRODUCAO ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  const foraDaProducao = env.NODE_ENV === "development" || env.VERCEL_ENV === "preview";
  // BALBINA_AMBIENTE=testes só existe nas variáveis de Preview da Vercel (escopo do branch Teste-Desevolvimento)
  const siteTeste = env.VERCEL_ENV === "preview" && env.BALBINA_AMBIENTE === "testes";
  // sem a marca de teste, todo projeto Supabase na nuvem é tratado como a produção
  const bancoProducao = refsProducao.some((ref) => url.includes(ref)) || (BANCO_NA_NUVEM.test(url) && !siteTeste);
  return { foraDaProducao, bancoProducao, siteTeste };
}
