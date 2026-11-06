import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AvisoAmbiente } from "@/components/aviso-ambiente";
import { AvisoCookies } from "@/components/aviso-cookies";
import { BrilhoVidro, FiltroLente } from "@/components/brilho-vidro";
import { SCRIPT_TEMA } from "@/components/tema";
import { SCRIPT_LATERAL } from "@/lib/lateral";
import { SCRIPT_VERSAO } from "@/lib/versao";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT_LATERAL }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT_VERSAO }} />
        <FiltroLente />
        <AvisoAmbiente />
        {children}
        <BrilhoVidro />
        <AvisoCookies />
        {/* velocidade real de quem usa (Web Vitals), no painel Speed Insights da Vercel */}
        <SpeedInsights />
      </body>
    </html>
  );
}
