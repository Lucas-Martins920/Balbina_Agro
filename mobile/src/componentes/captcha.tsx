import { useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { CONFIG } from "@/config";

// Cloudflare Turnstile, igual ao login do site: a página /app-captcha do site mostra o desafio e devolve
// o token por postMessage. Quando o site não usa captcha, ela avisa e o widget some.
export function Captcha({ aoToken, chaveRenovar }: { aoToken: (token: string | undefined) => void; chaveRenovar: number }) {
  const [visivel, setVisivel] = useState(true);
  if (!visivel) return null;
  return (
    <View style={{ height: 80, marginBottom: 12, borderRadius: 12, overflow: "hidden" }}>
      <WebView
        key={chaveRenovar}
        source={{ uri: `${CONFIG.siteUrl}/app-captcha`, headers: CONFIG.bypassVercel ? { "x-vercel-protection-bypass": CONFIG.bypassVercel, "x-vercel-set-bypass-cookie": "true" } : undefined }}
        style={{ backgroundColor: "transparent" }}
        originWhitelist={[CONFIG.siteUrl, "https://challenges.cloudflare.com"]}
        onMessage={(e) => {
          try {
            const m = JSON.parse(e.nativeEvent.data) as { tipo: string; token?: string };
            if (m.tipo === "token") aoToken(m.token);
            if (m.tipo === "sem-captcha") {
              setVisivel(false);
              aoToken(undefined);
            }
          } catch {
            // mensagem que não é do Balbina: ignora
          }
        }}
      />
    </View>
  );
}
