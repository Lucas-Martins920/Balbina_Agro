import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from "react-native";
import { nomeAparelho } from "@/lib/aparelho";
import { Aviso, Botao, Campo, Cartao, Fundo, Texto, Titulo } from "@/componentes/ui";
import { chamarSite, ErroApi } from "@/lib/api";
import { useSessao } from "@/lib/sessao";
import { supabase } from "@/lib/supabase";
import { useTema } from "@/tema";

type Metodo = "app" | "email";

// 2º fator, igual ao /auth/mfa do site: código do app autenticador ou código enviado por e-mail.
// "Confiar neste aparelho" pula o código por 14 dias neste celular.
export default function Mfa() {
  const { estado, confirmarMfa, sair } = useSessao();
  const { cores } = useTema();
  const email = estado.fase === "mfa" ? estado.email : null;
  const [fator, setFator] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<Metodo>("email");
  const [codigo, setCodigo] = useState("");
  const [confiar, setConfiar] = useState(true);
  const [mensagem, setMensagem] = useState<{ tipo: "perigo" | "info"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const totp = data?.totp?.find((f) => f.status === "verified");
      if (totp) {
        setFator(totp.id);
        setMetodo("app");
      }
    });
  }, []);

  async function rodar(acao: () => Promise<void>) {
    setMensagem(null);
    setOcupado(true);
    try {
      await acao();
    } catch (e) {
      setMensagem({ tipo: "perigo", texto: e instanceof ErroApi || e instanceof Error ? e.message : "Algo deu errado. Tente de novo." });
    } finally {
      setOcupado(false);
    }
  }

  const enviarEmail = () =>
    rodar(async () => {
      const r = await chamarSite<{ info: string }>("/api/app/mfa", { acao: "enviar_email" });
      setEnviado(true);
      setMensagem({ tipo: "info", texto: r.info });
    });

  const confirmar = () =>
    rodar(async () => {
      const aparelho = nomeAparelho();
      if (metodo === "app" && fator) {
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator, code: codigo.replace(/\D/g, "") });
        if (error) throw new Error("Código inválido. Confira o app autenticador e tente de novo.");
        const r = await chamarSite<{ dispositivo?: string }>("/api/app/mfa", { acao: "confirmar_app", confiar, aparelho });
        await confirmarMfa(r.dispositivo);
      } else {
        const r = await chamarSite<{ dispositivo?: string }>("/api/app/mfa", { acao: "confirmar_email", codigo, confiar, aparelho });
        await confirmarMfa(r.dispositivo);
      }
    });

  const semCaminho = !fator && !email;

  return (
    <Fundo>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 16 }} keyboardShouldPersistTaps="handled">
          <Cartao style={{ padding: 20 }}>
            <Titulo subtitulo="A senha sozinha não abre o Balbina: falta o código de segurança.">Confirme que é você</Titulo>
            {mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}
            {semCaminho ? (
              <Aviso tipo="alerta">Cadastre o app autenticador no site do Balbina (Segurança) e volte aqui.</Aviso>
            ) : (
              <>
                {fator && email && (
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Botao variante={metodo === "app" ? "principal" : "secundario"} onPress={() => setMetodo("app")}>
                        App autenticador
                      </Botao>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Botao variante={metodo === "email" ? "principal" : "secundario"} onPress={() => setMetodo("email")}>
                        E-mail
                      </Botao>
                    </View>
                  </View>
                )}
                {metodo === "email" && !enviado ? (
                  <Botao onPress={enviarEmail} carregando={ocupado}>
                    Enviar código para {email}
                  </Botao>
                ) : (
                  <>
                    <Campo rotulo={metodo === "app" ? "Código do app autenticador" : "Código do e-mail"} value={codigo} onChangeText={setCodigo} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={8} />
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <Texto style={{ flex: 1 }}>Confiar neste aparelho por 14 dias</Texto>
                      <Switch value={confiar} onValueChange={setConfiar} trackColor={{ true: cores.marca }} />
                    </View>
                    <Botao onPress={confirmar} carregando={ocupado} desativado={codigo.replace(/\D/g, "").length < 6}>
                      Confirmar
                    </Botao>
                    {metodo === "email" && (
                      <Botao variante="secundario" onPress={enviarEmail} desativado={ocupado}>
                        Enviar outro código
                      </Botao>
                    )}
                  </>
                )}
              </>
            )}
            <Botao variante="fantasma" onPress={sair}>
              Sair
            </Botao>
          </Cartao>
        </ScrollView>
      </KeyboardAvoidingView>
    </Fundo>
  );
}
