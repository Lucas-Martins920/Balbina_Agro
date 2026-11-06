import type { ReactNode } from "react";
import { ScrollView } from "react-native";
import { Fundo } from "./ui";

// Tela das abas: papel de parede, rolagem e folga para a barra de abas de vidro.
export function Tela({ children }: { children: ReactNode }) {
  return (
    <Fundo>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} contentInsetAdjustmentBehavior="automatic">
        {children}
      </ScrollView>
    </Fundo>
  );
}
