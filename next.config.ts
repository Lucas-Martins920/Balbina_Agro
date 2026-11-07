import type { NextConfig } from "next";

// ERP é todo autenticado e dinâmico, então ficamos no modelo de cache anterior
// (sem cacheComponents). Ver docs/legado/finavi/replica/architecture.md.
// CSP com nonce gerado pelo proxy.ts a cada requisição; os demais cabeçalhos de segurança ficam aqui.
const SEGURANCA = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["192.168.100.115"],
  // geradores da exportação da DRE: rodam do node_modules, com a versão Node de cada um
  serverExternalPackages: ["exceljs", "jspdf", "jspdf-autotable"],
  async headers() {
    return [{ source: "/:path*", headers: SEGURANCA }];
  },
  // Relatórios que moravam nos módulos foram para a central (Gestão > Relatórios): links e favoritos antigos continuam valendo.
  async redirects() {
    return [
      { source: "/vendas/relatorios", destination: "/relatorios/vendas", permanent: false },
      { source: "/indicadores", destination: "/relatorios/indicadores", permanent: false },
    ];
  },
  // extratos OFX de um ano passam de 1 MB
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
