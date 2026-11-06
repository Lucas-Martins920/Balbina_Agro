import type { Metadata } from "next";
import { headers } from "next/headers";
import { Figtree, IBM_Plex_Mono, Sora } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AvisoAmbiente } from "@/components/aviso-ambiente";
import { AvisoCookies } from "@/components/aviso-cookies";
import { SCRIPT_TEMA } from "@/components/tema";
import { SCRIPT_LATERAL } from "@/lib/lateral";
import { SCRIPT_VERSAO } from "@/lib/versao";
import "./globals.css";

// Identidade "Várzea": Figtree no texto corrido, Sora nos títulos e números de destaque, Plex Mono em código.
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"] });

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const _testes = process.env.BALBINA_AMBIENTE === "testes";

export const metadata: Metadata = {
  title: { default: _testes ? "Balbina ERP — TESTES" : "Balbina ERP", template: _testes ? "%s — TESTES" : "%s" },
  description: "ERP para pisciculturas de engorda: produção, financeiro e custo do kg.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="pt-BR"
      className={`${figtree.variable} ${sora.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT_LATERAL }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT_VERSAO }} />
        <AvisoAmbiente />
        {children}
        <AvisoCookies />
        {/* velocidade real de quem usa (Web Vitals), no painel Speed Insights da Vercel */}
        <SpeedInsights />
      </body>
    </html>
  );
}
