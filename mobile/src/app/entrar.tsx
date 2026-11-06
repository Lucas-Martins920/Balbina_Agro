import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Captcha } from "@/componentes/captcha";
import { Aviso, Botao, Campo, Cartao, Fundo, Texto, Titulo } from "@/componentes/ui";
import { ErroApi } from "@/lib/api";
import { useSessao } from "@/lib/sessao";
import { useTema } from "@/tema";

// Mesmo login do site: e-mail ou usuário criado pelo master, trava após 5 senhas erradas, captcha.
export default function Entrar() {
  const { entrar } = useSessao();
  const { cores } = useTema();
  const [identificacao, setIdentificacao] = useState("");
  const [senha, setSenha] = useState("");
  const [captcha, setCaptcha] = useState<string | undefined>();
  const [renovar, setRenovar] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setErro(null);
    setEnviando(true);
    try {
      await entrar(identificacao, senha, captcha);
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : "Não foi possível entrar.");
      // o token do captcha vale uma vez só
      setCaptcha(undefined);
      setRenovar((n) => n + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Fundo>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <Text style={{ fontSize: 40, fontWeight: "800", letterSpacing: -1.2, color: cores.marca }}>Balbina</Text>
            <Texto suave>Gestão da piscicultura no seu bolso</Texto>
          </View>
          <Cartao style={{ padding: 20 }}>
            <Titulo>Entrar</Titulo>
            {erro && <Aviso tipo="perigo">{erro}</Aviso>}
            <Campo rotulo="E-mail ou usuário" value={identificacao} onChangeText={setIdentificacao} autoCapitalize="none" autoCorrect={false} autoComplete="username" keyboardType="email-address" textContentType="username" />
            <Campo rotulo="Senha" value={senha} onChangeText={setSenha} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={enviar} />
            <Captcha aoToken={setCaptcha} chaveRenovar={renovar} />
            <Botao onPress={enviar} carregando={enviando} desativado={!identificacao || !senha}>
              Entrar
            </Botao>
            <Texto suave style={{ fontSize: 13, textAlign: "center" }}>
              Esqueceu a senha? Peça uma nova no site do Balbina ou ao master da piscicultura.
            </Texto>
          </Cartao>
        </ScrollView>
      </KeyboardAvoidingView>
    </Fundo>
  );
}
