import { useEffect } from "react";
import { View } from "react-native";
import { ScanFace } from "lucide-react-native";
import { Botao, Cartao, Fundo, Texto, Titulo } from "@/componentes/ui";
import { useSessao } from "@/lib/sessao";
import { useTema } from "@/tema";

// Com o Face ID ou a digital ligados (aba Mais), o app abre trancado até a pessoa confirmar.
export default function Desbloquear() {
  const { desbloquear, sair } = useSessao();
  const { cores } = useTema();
  useEffect(() => {
    desbloquear();
  }, [desbloquear]);
  return (
    <Fundo>
      <View style={{ flex: 1, justifyContent: "center", padding: 16 }}>
        <Cartao style={{ padding: 20, alignItems: "stretch" }}>
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <ScanFace size={48} color={cores.marca} strokeWidth={1.75} />
          </View>
          <Titulo subtitulo="Use o Face ID ou a digital para abrir o Balbina.">App trancado</Titulo>
          <Botao onPress={desbloquear}>Desbloquear</Botao>
          <Botao variante="fantasma" onPress={sair}>
            Entrar com a senha
          </Botao>
          <Texto suave style={{ fontSize: 13, textAlign: "center" }}>
            Entrar com a senha encerra a sessão guardada neste aparelho.
          </Texto>
        </Cartao>
      </View>
    </Fundo>
  );
}
