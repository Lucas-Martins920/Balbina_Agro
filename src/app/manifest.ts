import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Balbina ERP · Campo",
    short_name: "Balbina Campo",
    description: "Apontamento diário dos viveiros, funciona sem internet.",
    id: "/campo",
    start_url: "/campo",
    scope: "/",
    display: "standalone",
    background_color: "#dce8ee",
    theme_color: "#0b7285",
    lang: "pt-BR",
    // PNG 192/512 para o Android instalar; maskable para o ícone redondo; SVG para o resto
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
