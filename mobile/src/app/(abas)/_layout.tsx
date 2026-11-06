import { BlurView } from "expo-blur";
import { Tabs } from "expo-router/tabs";
import { Box, ClipboardList, Ellipsis, House, ShoppingCart } from "lucide-react-native";
import { Platform, StyleSheet, View, type ColorValue } from "react-native";
import { useSessao } from "@/lib/sessao";
import { useTema } from "@/tema";

export default function Abas() {
  const { pode } = useSessao();
  const { cores, escuro } = useTema();
  const icone = (Icone: typeof House) =>
    function IconeAba({ color }: { color: ColorValue }) {
      return <Icone size={22} color={String(color)} strokeWidth={1.75} />;
    };

  const temApontar = pode("apontamentos.ver");
  const temVender = pode("vendas.lancar") || pode("pdv.operar");
  const temEstoque = pode("estoque.ver");

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "transparent" },
        tabBarActiveTintColor: cores.marca,
        tabBarInactiveTintColor: cores.textoSuave,
        tabBarStyle: { position: "absolute", borderTopColor: cores.borda, backgroundColor: "transparent", elevation: 0 },
        tabBarBackground: () =>
          Platform.OS === "android" ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: cores.cristal }]} />
          ) : (
            <BlurView intensity={80} tint={escuro ? "dark" : "light"} style={[StyleSheet.absoluteFill, { backgroundColor: cores.cristal }]} />
          ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Início", tabBarIcon: icone(House) }} />
      <Tabs.Screen name="apontar" options={{ title: "Apontar", tabBarIcon: icone(ClipboardList), href: temApontar ? undefined : null }} />
      <Tabs.Screen name="vender" options={{ title: "Vender", tabBarIcon: icone(ShoppingCart), href: temVender ? undefined : null }} />
      <Tabs.Screen name="estoque" options={{ title: "Estoque", tabBarIcon: icone(Box), href: temEstoque ? undefined : null }} />
      <Tabs.Screen name="mais" options={{ title: "Mais", tabBarIcon: icone(Ellipsis) }} />
    </Tabs>
  );
}
