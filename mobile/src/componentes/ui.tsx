import { BlurView } from "expo-blur";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps, type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CONFIG } from "@/config";
import { ESP, FONTE, RAIO, TOQUE, useTema } from "@/tema";

const MOLA = { tension: 180, friction: 22, useNativeDriver: true };
const FADE = { duration: 250, useNativeDriver: true };

function BlurOuVidro({ style, escuro }: { style: any; escuro?: boolean }) {
  if (Platform.OS === "android") {
    return <View style={[style, { backgroundColor: escuro ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.75)" }]} />;
  }
  return <BlurView intensity={90} tint="default" style={style} />;
}

// Papel de parede: quatro campos de luz parados atrás de tudo, com blur uniforme.
export function Fundo({ children }: { children: ReactNode }) {
  const { cores, escuro } = useTema();
  const luz = (cor: string, pos: ViewStyle) => (
    <View pointerEvents="none" style={[estilos.luz, { backgroundColor: cor }, pos]} />
  );
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: cores.fundo }]}>
      {luz(cores.papel1, { top: -100, left: -100 })}
      {luz(cores.papel2, { top: 140, right: -120 })}
      {luz(cores.papel3, { bottom: -80, left: -40 })}
      {luz(cores.papel4, { bottom: 100, right: -100 })}
      <BlurOuVidro style={StyleSheet.absoluteFill} escuro={escuro} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        {CONFIG.ambiente === "teste" && <FaixaTeste />}
        {children}
      </SafeAreaView>
    </View>
  );
}

function FaixaTeste() {
  const { cores } = useTema();
  return (
    <View style={{ backgroundColor: cores.amarelo, paddingVertical: 2 }}>
      <Text style={{ textAlign: "center", fontSize: FONTE.micro, fontWeight: "600", color: cores.marcaTexto }}>
        Versão de teste · dados de teste
      </Text>
    </View>
  );
}

// Lâmina de vidro translúcida com aresta sutil, sombra e entrada animada
export function Cartao({ children, style, compacto, atraso = 0 }: { children: ReactNode; style?: ViewStyle; compacto?: boolean; atraso?: number }) {
  const { cores, escuro } = useTema();
  const opacidade = useState(() => new Animated.Value(0))[0];
  const translacao = useState(() => new Animated.Value(16))[0];
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacidade, { ...FADE, toValue: 1 }),
        Animated.spring(translacao, { ...MOLA, toValue: 0 }),
      ]).start();
    }, atraso);
    return () => clearTimeout(t);
  }, [atraso, opacidade, translacao]);
  return (
    <Animated.View
      style={[
        estilos.cartao,
        {
          backgroundColor: cores.superficie,
          borderColor: cores.aresta,
          padding: compacto ? ESP.md : ESP.lg,
          shadowColor: escuro ? "#000" : "#8898aa",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: escuro ? 0.3 : 0.08,
          shadowRadius: 8,
          elevation: 2,
          opacity: opacidade,
          transform: [{ translateY: translacao }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Cabeçalho de seção dentro da rolagem
export function CabecalhoSecao({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  const { cores } = useTema();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ESP.md, marginTop: ESP.sm }}>
      <Text style={{ fontSize: FONTE.tituloSecao, fontWeight: "700", letterSpacing: -0.4, color: cores.texto }}>{children}</Text>
      {acao}
    </View>
  );
}

export function Titulo({ children, subtitulo }: { children: ReactNode; subtitulo?: ReactNode }) {
  const { cores } = useTema();
  const opacidade = useState(() => new Animated.Value(0))[0];
  const translacao = useState(() => new Animated.Value(8))[0];
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacidade, { ...FADE, toValue: 1 }),
      Animated.spring(translacao, { ...MOLA, toValue: 0 }),
    ]).start();
  }, [opacidade, translacao]);
  return (
    <Animated.View style={{ marginBottom: ESP.lg, opacity: opacidade, transform: [{ translateY: translacao }] }}>
      <Text style={{ fontSize: FONTE.tituloGrande, fontWeight: "700", letterSpacing: -0.6, color: cores.texto }}>{children}</Text>
      {subtitulo ? (
        <Text style={{ fontSize: FONTE.pequeno, color: cores.textoSuave, marginTop: 2, letterSpacing: 0.1 }}>{subtitulo}</Text>
      ) : null}
    </Animated.View>
  );
}

export function Texto({ children, suave, style }: { children: ReactNode; suave?: boolean; style?: object }) {
  const { cores } = useTema();
  return <Text style={[{ fontSize: FONTE.corpo, color: suave ? cores.textoSuave : cores.texto, lineHeight: 22 }, style]}>{children}</Text>;
}

type Variante = "principal" | "secundario" | "fantasma" | "perigo";

// Cápsula: principal = gema, secundário = vidro; spring 0.97 ao tocar (Emil Kowalski)
export function Botao({
  children, onPress, variante = "principal", carregando, desativado, compacto,
}: {
  children: ReactNode; onPress: () => void; variante?: Variante; carregando?: boolean; desativado?: boolean; compacto?: boolean;
}) {
  const { cores, escuro } = useTema();
  const escala = useState(() => new Animated.Value(1))[0];
  const pressionar = () => Animated.spring(escala, { ...MOLA, toValue: 0.97 }).start();
  const soltar = () => Animated.spring(escala, { ...MOLA, toValue: 1 }).start();
  const fundos: Record<Variante, string> = {
    principal: cores.marca,
    secundario: cores.elevado,
    fantasma: "transparent",
    perigo: cores.etiquetaPerigo,
  };
  const tintas: Record<Variante, string> = {
    principal: cores.marcaTexto,
    secundario: cores.texto,
    fantasma: cores.marca,
    perigo: cores.etiquetaPerigoTexto,
  };
  return (
    <Pressable
      accessibilityRole="button"
      disabled={desativado || carregando}
      onPress={onPress}
      onPressIn={pressionar}
      onPressOut={soltar}
    >
      <Animated.View
        style={[
          estilos.botao,
          {
            backgroundColor: fundos[variante],
            borderColor: variante === "fantasma" ? "transparent" : variante === "principal" ? cores.marca : cores.borda,
            opacity: desativado ? 0.45 : 1,
            transform: [{ scale: escala }],
            minHeight: compacto ? 36 : TOQUE + 4,
            paddingHorizontal: compacto ? ESP.md : 20,
            shadowColor: variante === "principal" && !escuro ? cores.marca : "transparent",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: variante === "principal" && !escuro ? 0.2 : 0,
            shadowRadius: 6,
          },
        ]}
      >
        {carregando ? (
          <ActivityIndicator color={tintas[variante]} />
        ) : (
          <Text style={{ color: tintas[variante], fontSize: compacto ? FONTE.pequeno : FONTE.corpo, fontWeight: "600" }}>{children}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

export function Campo({ rotulo, ...props }: TextInputProps & { rotulo: string }) {
  const { cores } = useTema();
  const [foco, setFoco] = useState(false);
  return (
    <View style={{ marginBottom: ESP.md }}>
      <Text style={{ fontSize: FONTE.pequeno, fontWeight: "500", color: cores.textoSuave, marginBottom: ESP.xs, letterSpacing: 0.2 }}>{rotulo}</Text>
      <TextInput
        placeholderTextColor={cores.textoSuave}
        {...props}
        onFocus={(e) => { setFoco(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFoco(false); props.onBlur?.(e); }}
        style={[
          estilos.campo,
          {
            backgroundColor: foco ? cores.solido : cores.elevado,
            borderColor: foco ? cores.marca : cores.borda,
            color: cores.texto,
          },
        ]}
      />
    </View>
  );
}

type TipoAviso = "perigo" | "positivo" | "alerta" | "info";

export function Aviso({ children, tipo = "info" }: { children: ReactNode; tipo?: TipoAviso }) {
  const { cores } = useTema();
  const par = {
    perigo: [cores.etiquetaPerigo, cores.etiquetaPerigoTexto],
    positivo: [cores.etiquetaPositivo, cores.etiquetaPositivoTexto],
    alerta: [cores.etiquetaAlerta, cores.etiquetaAlertaTexto],
    info: [cores.etiquetaInfo, cores.etiquetaInfoTexto],
  }[tipo];
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: par[0], borderRadius: RAIO.campo, padding: ESP.md, marginBottom: ESP.md }}>
      <Text style={{ color: par[1], fontSize: FONTE.pequeno, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

export function Carregando() {
  const { cores } = useTema();
  return (
    <Fundo>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={cores.marca} size="large" />
      </View>
    </Fundo>
  );
}

function OpcaoAnimada({ ativo, rolar, onPress, rotulo }: { ativo: boolean; rolar?: boolean; onPress: () => void; rotulo: string }) {
  const { cores } = useTema();
  const escala = useState(() => new Animated.Value(1))[0];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      onPressIn={() => Animated.spring(escala, { ...MOLA, toValue: 0.95 }).start()}
      onPressOut={() => Animated.spring(escala, { ...MOLA, toValue: 1 }).start()}
      style={{ flex: rolar ? undefined : 1 }}
    >
      <Animated.View
        style={[
          estilos.opcao,
          {
            backgroundColor: ativo ? cores.marcaSuave : cores.elevado,
            borderColor: ativo ? cores.marca : cores.borda,
            transform: [{ scale: escala }],
          },
        ]}
      >
        <Text numberOfLines={rolar ? 1 : 2} style={{ color: ativo ? cores.marca : cores.texto, fontSize: FONTE.pequeno, fontWeight: ativo ? "600" : "400", textAlign: "center" }}>
          {rotulo}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// Escolha entre poucas opções: pílulas; a escolhida fica sólida com aresta gema.
export function Escolha<T extends string>({
  opcoes, valor, aoEscolher, rolar,
}: {
  opcoes: { valor: T; rotulo: string }[]; valor: T | null; aoEscolher: (v: T) => void; rolar?: boolean;
}) {
  const itens = opcoes.map((o) => {
    const ativo = o.valor === valor;
    return (
      <OpcaoAnimada key={o.valor} ativo={ativo} rolar={rolar} onPress={() => aoEscolher(o.valor)} rotulo={o.rotulo} />
    );
  });
  if (rolar) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: ESP.sm, paddingBottom: ESP.xs }} style={{ marginBottom: ESP.md }}>
        {itens}
      </ScrollView>
    );
  }
  return <View style={{ flexDirection: "row", gap: ESP.sm, marginBottom: ESP.md }}>{itens}</View>;
}

// Bloco que abre e fecha
export function Recolhivel({ titulo, children, aberto: inicial = false }: { titulo: string; children: ReactNode; aberto?: boolean }) {
  const { cores } = useTema();
  const [aberto, setAberto] = useState(inicial);
  const rotacao = useState(() => new Animated.Value(inicial ? 1 : 0))[0];
  const opConteudo = useState(() => new Animated.Value(inicial ? 1 : 0))[0];
  const alternar = () => {
    const proximo = !aberto;
    setAberto(proximo);
    Animated.parallel([
      Animated.spring(rotacao, { ...MOLA, toValue: proximo ? 1 : 0 }),
      Animated.timing(opConteudo, { toValue: proximo ? 1 : 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };
  const spin = rotacao.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] });
  return (
    <View style={[estilos.recolhivel, { borderColor: cores.borda, backgroundColor: aberto ? cores.elevado : "transparent" }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
        onPress={alternar}
        style={{ minHeight: TOQUE, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <Text style={{ color: cores.texto, fontSize: FONTE.corpo, fontWeight: "600" }}>{titulo}</Text>
        <Animated.Text style={{ color: cores.textoSuave, fontSize: 16, transform: [{ rotate: spin }] }}>+</Animated.Text>
      </Pressable>
      {aberto && <Animated.View style={{ paddingTop: ESP.sm, opacity: opConteudo }}>{children}</Animated.View>}
    </View>
  );
}

export function Rotulo({ children }: { children: ReactNode }) {
  const { cores } = useTema();
  return (
    <Text style={{ fontSize: FONTE.pequeno, fontWeight: "500", color: cores.textoSuave, marginBottom: ESP.xs, letterSpacing: 0.2 }}>{children}</Text>
  );
}

type TomEtiqueta = "positivo" | "perigo" | "alerta" | "neutro" | "info";
export function Etiqueta({ children, tom = "neutro" }: { children: ReactNode; tom?: TomEtiqueta }) {
  const { cores } = useTema();
  const [fundo, tinta] = {
    positivo: [cores.etiquetaPositivo, cores.etiquetaPositivoTexto],
    perigo: [cores.etiquetaPerigo, cores.etiquetaPerigoTexto],
    alerta: [cores.etiquetaAlerta, cores.etiquetaAlertaTexto],
    info: [cores.etiquetaInfo, cores.etiquetaInfoTexto],
    neutro: [cores.etiquetaNeutro, cores.etiquetaNeutroTexto],
  }[tom];
  return (
    <View style={{ backgroundColor: fundo, borderRadius: RAIO.capsula, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ color: tinta, fontSize: FONTE.micro, fontWeight: "600", letterSpacing: 0.3 }}>{children}</Text>
    </View>
  );
}

function BotaoContador({ sinal, desativado, onPress, rotulo }: { sinal: string; desativado: boolean; onPress: () => void; rotulo: string }) {
  const { cores } = useTema();
  const escala = useState(() => new Animated.Value(1))[0];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${sinal === "+" ? "Mais" : "Menos"} ${rotulo}`}
      disabled={desativado}
      onPress={onPress}
      onPressIn={() => Animated.spring(escala, { ...MOLA, toValue: 0.9 }).start()}
      onPressOut={() => Animated.spring(escala, { ...MOLA, toValue: 1 }).start()}
    >
      <Animated.View style={[estilos.contador, { backgroundColor: cores.elevado, borderColor: cores.borda, opacity: desativado ? 0.35 : 1, transform: [{ scale: escala }] }]}>
        <Text style={{ fontSize: 20, color: cores.texto, fontWeight: "600" }}>{sinal}</Text>
      </Animated.View>
    </Pressable>
  );
}

// − quantidade + para PDV e vendedor, com teto opcional (estoque). Com casas (peixe vendido por kg), o número
// também pode ser digitado, até o grama; os botões somam e tiram 1 kg.
export function Contador({ valor, aoMudar, max, rotulo, casas = 0 }: { valor: number; aoMudar: (v: number) => void; max?: number | null; rotulo: string; casas?: number }) {
  const { cores } = useTema();
  const [texto, setTexto] = useState<string | null>(null); // o que está sendo digitado
  const teto = max ?? Infinity;
  const fator = 10 ** casas;
  const ajustar = (n: number) => Math.min(Math.max(Math.round(n * fator) / fator, 0), teto);
  const mostrar = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
  const botao = (sinal: "−" | "+", desativado: boolean, novo: number) => (
    <BotaoContador sinal={sinal} desativado={desativado} onPress={() => { setTexto(null); aoMudar(ajustar(novo)); }} rotulo={rotulo} />
  );
  function confirmar() {
    if (texto === null) return;
    const t = texto.trim();
    const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
    setTexto(null);
    if (t === "" || Number.isFinite(n)) aoMudar(ajustar(t === "" ? 0 : n));
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: ESP.sm }}>
      {botao("−", valor <= 0, valor - 1)}
      {casas > 0 ? (
        <TextInput
          accessibilityLabel={`Quantidade de ${rotulo}`}
          value={texto ?? mostrar(valor)}
          onFocus={() => setTexto(valor ? mostrar(valor) : "")}
          onChangeText={setTexto}
          onEndEditing={confirmar}
          onSubmitEditing={confirmar}
          keyboardType="decimal-pad"
          selectTextOnFocus
          style={[estilos.campo, { minWidth: 72, minHeight: TOQUE, paddingHorizontal: ESP.sm, textAlign: "center", fontSize: 17, fontWeight: "700", color: cores.texto, backgroundColor: cores.elevado, borderColor: cores.borda, fontVariant: ["tabular-nums"] }]}
        />
      ) : (
        <Text style={{ minWidth: 32, textAlign: "center", fontSize: 18, fontWeight: "700", color: cores.texto, fontVariant: ["tabular-nums"] }}>{valor}</Text>
      )}
      {botao("+", valor >= teto, valor + 1)}
    </View>
  );
}

// Divisor horizontal sutil
export function Divisor() {
  const { cores } = useTema();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: cores.linha, marginVertical: ESP.sm }} />;
}

// Linha de ação tocável dentro de um Cartao (ex.: item de lista, opção de menu)
export function LinhaAcao({
  children, onPress, icone, valor, seta,
}: {
  children: ReactNode; onPress?: () => void; icone?: ReactNode; valor?: ReactNode; seta?: boolean;
}) {
  const { cores } = useTema();
  const escala = useState(() => new Animated.Value(1))[0];
  const pressIn = () => onPress && Animated.spring(escala, { ...MOLA, toValue: 0.97 }).start();
  const pressOut = () => onPress && Animated.spring(escala, { ...MOLA, toValue: 1 }).start();
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      accessibilityRole={onPress ? "button" : undefined}
      style={{ minHeight: TOQUE } as ViewStyle}
    >
      <Animated.View style={{ flexDirection: "row", alignItems: "center", gap: ESP.md, transform: [{ scale: escala }] }}>
        {icone}
        <View style={{ flex: 1 }}>{children}</View>
        {valor}
        {seta && <Text style={{ color: cores.textoSuave, fontSize: 16 }}>›</Text>}
      </Animated.View>
    </Wrapper>
  );
}

const estilos = StyleSheet.create({
  luz: { position: "absolute", width: 340, height: 340, borderRadius: 170 },
  cartao: { borderRadius: RAIO.cartao, borderWidth: StyleSheet.hairlineWidth, marginBottom: ESP.md },
  botao: {
    borderRadius: RAIO.capsula,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: ESP.sm,
  },
  contador: { width: TOQUE, height: TOQUE, borderRadius: RAIO.capsula, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  opcao: { minHeight: 40, borderRadius: RAIO.campo, borderWidth: 1, paddingHorizontal: ESP.md, alignItems: "center", justifyContent: "center" },
  recolhivel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RAIO.campo, paddingHorizontal: ESP.md, paddingBottom: ESP.xs, marginBottom: ESP.md },
  campo: { minHeight: TOQUE + 4, borderRadius: RAIO.campo, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
});
