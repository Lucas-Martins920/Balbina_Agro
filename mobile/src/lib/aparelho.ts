import { Platform } from "react-native";

// Descrição curta do aparelho para a lista de dispositivos confiados (tela Segurança do site)
export function nomeAparelho() {
  return Platform.OS === "ios" ? `iPhone (iOS ${Platform.Version})` : Platform.OS === "android" ? `Android ${Platform.Version}` : Platform.OS;
}
