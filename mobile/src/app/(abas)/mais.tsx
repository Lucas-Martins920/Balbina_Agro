import { Pressable, Switch, View } from "react-native";
import { Tela } from "@/componentes/tela";
import { Botao, CabecalhoSecao, Cartao, Divisor, Texto, Titulo } from "@/componentes/ui";
import { nomeEmpresa, useSessao } from "@/lib/sessao";
import { ESP, FONTE, useTema } from "@/tema";

// Conta: trocar de piscicultura, Face ID e sair.
export default function Mais() {
  const { estado, trocarEmpresa, biometria, sair } = useSessao();
  const { cores } = useTema();
  if (estado.fase !== "pronto") return null;
  return (
    <Tela>
      <Titulo>Mais</Titulo>
      {estado.empresas.length > 1 && (
        <>
          <CabecalhoSecao>Piscicultura</CabecalhoSecao>
          <Cartao atraso={0}>
            {estado.empresas.map((e, i) => {
              const atual = e.id === estado.empresa.id;
              return (
                <View key={e.id}>
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: atual }} onPress={() => !atual && trocarEmpresa(e.id)} style={{ minHeight: 44, justifyContent: "center", paddingVertical: ESP.sm }}>
                    <Texto style={{ fontWeight: atual ? "600" : "400", color: atual ? cores.marca : cores.texto }}>{nomeEmpresa(e)}</Texto>
                  </Pressable>
                  {i < estado.empresas.length - 1 && <Divisor />}
                </View>
              );
            })}
          </Cartao>
        </>
      )}
      {biometria.disponivel && (
        <Cartao atraso={80}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Texto style={{ fontWeight: "600" }}>Abrir com Face ID ou digital</Texto>
              <Texto suave style={{ fontSize: FONTE.pequeno }}>Pede o rosto ou a digital toda vez que o app abrir.</Texto>
            </View>
            <Switch value={biometria.ligada} onValueChange={biometria.alternar} trackColor={{ true: cores.marca }} />
          </View>
        </Cartao>
      )}
      <Botao variante="secundario" onPress={sair}>
        Sair
      </Botao>
    </Tela>
  );
}
