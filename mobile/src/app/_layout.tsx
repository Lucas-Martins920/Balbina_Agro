import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Carregando } from "@/componentes/ui";
import { ProvedorSessao, useSessao } from "@/lib/sessao";

// Cada fase da sessão libera só as telas dela (Stack.Protected): sem login não existe aba nenhuma,
// sem o 2º fator só a tela do código, e assim por diante.
function Telas() {
  const { estado } = useSessao();
  if (estado.fase === "carregando") return <Carregando />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}>
      <Stack.Protected guard={estado.fase === "fora"}>
        <Stack.Screen name="entrar" />
      </Stack.Protected>
      <Stack.Protected guard={estado.fase === "mfa"}>
        <Stack.Screen name="mfa" />
      </Stack.Protected>
      <Stack.Protected guard={estado.fase === "bloqueado"}>
        <Stack.Screen name="desbloquear" />
      </Stack.Protected>
      <Stack.Protected guard={estado.fase === "sem-empresa"}>
        <Stack.Screen name="sem-empresa" />
      </Stack.Protected>
      <Stack.Protected guard={estado.fase === "pronto"}>
        <Stack.Screen name="(abas)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function Raiz() {
  return (
    <SafeAreaProvider>
      <ProvedorSessao>
        <StatusBar style="auto" />
        <Telas />
      </ProvedorSessao>
    </SafeAreaProvider>
  );
}
