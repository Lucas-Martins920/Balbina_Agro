import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.balbinaagro.app",
  appName: "Balbina Agro",
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
};

export default config;