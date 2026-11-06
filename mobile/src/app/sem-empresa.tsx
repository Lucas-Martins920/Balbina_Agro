import { View } from "react-native";
import { Aviso, Botao, Cartao, Fundo, Titulo } from "@/componentes/ui";
import { useSessao } from "@/lib/sessao";

// A piscicultura é criada no site (cadastro, plano e dados fiscais). O app só entra em empresa que já existe.
export default function SemEmpresa() {
  const { sair } = useSessao();
  return (
    <Fundo>
      <View style={{ flex: 1, justifyContent: "center", padding: 16 }}>
        <Cartao style={{ padding: 20 }}>
          <Titulo>Nenhuma piscicultura ainda</Titulo>
          <Aviso tipo="info">Crie a sua piscicultura no site do Balbina ou peça ao master um convite. Depois é só entrar de novo aqui.</Aviso>
          <Botao variante="secundario" onPress={sair}>
            Sair
          </Botao>
        </Cartao>
      </View>
    </Fundo>
  );
}
