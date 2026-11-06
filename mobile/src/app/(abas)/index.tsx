import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { AppState, Pressable, RefreshControl, ScrollView, View } from "react-native";
import {
  AlertTriangle, Box, CheckCircle2, ChevronRight, ClipboardList, Fish, Truck, Warehouse,
} from "lucide-react-native";
import { router } from "expo-router";
import { Aviso, CabecalhoSecao, Carregando, Cartao, Etiqueta, Fundo, Texto, Titulo } from "@/componentes/ui";
import { nomeEmpresa, useSessao } from "@/lib/sessao";
import { usePainel } from "@/lib/painel/use-painel";
import type { AlertaLote, EntregaDia, ViveiroDia } from "@/lib/painel/tipos";
import { ESP, FONTE, useTema } from "@/tema";

export default function Inicio() {
  const { estado, pode } = useSessao();
  const { cores } = useTema();
  const empresaId = estado.fase === "pronto" ? estado.empresa.id : undefined;
  const { dados, carregando, erro, recarregar } = usePainel(empresaId);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") recarregar();
    });
    return () => sub.remove();
  }, [recarregar]);

  const irApontar = useCallback(() => router.push("/(abas)/apontar"), []);
  const irEstoque = useCallback(() => router.push("/(abas)/estoque"), []);

  const faltam = useMemo(() => dados?.viveiros.filter((g) => !g.apontado) ?? [], [dados]);
  const feitos = useMemo(() => dados?.viveiros.filter((g) => g.apontado) ?? [], [dados]);

  if (estado.fase !== "pronto") return null;
  const entregas = dados?.entregas ?? [];
  const alertas = dados?.alertas ?? [];
  const totalViveiros = dados?.viveiros.length ?? 0;

  return (
    <Fundo>
      <ScrollView
        contentContainerStyle={{ padding: ESP.lg, paddingBottom: 120 }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={false} onRefresh={recarregar} tintColor={cores.marca} />}
      >
        {/* Header compacto */}
        <Titulo subtitulo={estado.acesso.cargo ?? estado.acesso.perfil}>{nomeEmpresa(estado.empresa)}</Titulo>

        {carregando && !dados ? (
          <Carregando />
        ) : erro ? (
          <Aviso tipo="alerta">{erro}</Aviso>
        ) : (
          <>
            {/* KPIs em linha — números grandes, rótulos pequenos */}
            <View style={{ flexDirection: "row", gap: ESP.sm, marginBottom: ESP.lg }}>
              <KpiCompacto atraso={0} valor={totalViveiros} rotulo="Viveiros" cor={cores.marca} icone={<Fish size={16} color={cores.marca} strokeWidth={2} />} />
              <KpiCompacto
                atraso={50}
                valor={faltam.length}
                rotulo={faltam.length === 1 ? "Falta" : "Faltam"}
                cor={faltam.length > 0 ? cores.laranja : cores.verde}
                icone={<ClipboardList size={16} color={faltam.length > 0 ? cores.laranja : cores.verde} strokeWidth={2} />}
              />
              {pode("vendas.ver") && (
                <KpiCompacto atraso={100} valor={entregas.length} rotulo="Entregas" cor={cores.azul} icone={<Truck size={16} color={cores.azul} strokeWidth={2} />} />
              )}
            </View>

            {/* Falta apontar — ação principal, toque leva direto */}
            {faltam.length > 0 && (
              <>
                <CabecalhoSecao>Falta apontar</CabecalhoSecao>
                <Cartao atraso={150}>
                  {faltam.map((g, i) => (
                    <ViveiroLinha
                      key={g.viveiro_id}
                      g={g}
                      onPress={pode("apontamentos.criar") ? irApontar : undefined}
                      ultimo={i === faltam.length - 1}
                    />
                  ))}
                </Cartao>
              </>
            )}

            {/* Já apontados */}
            {feitos.length > 0 && (
              <>
                <CabecalhoSecao>Apontados</CabecalhoSecao>
                <Cartao atraso={200}>
                  {feitos.map((g, i) => (
                    <ViveiroLinha key={g.viveiro_id} g={g} feito ultimo={i === feitos.length - 1} />
                  ))}
                </Cartao>
              </>
            )}

            {/* Entregas de hoje */}
            {pode("vendas.ver") && entregas.length > 0 && (
              <>
                <CabecalhoSecao>Entregas de hoje</CabecalhoSecao>
                <Cartao atraso={250}>
                  {entregas.map((p, i) => (
                    <EntregaLinha key={p.id} p={p} ultimo={i === entregas.length - 1} />
                  ))}
                </Cartao>
              </>
            )}

            {pode("vendas.ver") && entregas.length === 0 && dados && (
              <Cartao compacto atraso={250}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: ESP.sm }}>
                  <Truck size={16} color={cores.textoSuave} strokeWidth={1.75} />
                  <Texto suave style={{ fontSize: FONTE.pequeno }}>Nenhuma entrega prevista para hoje.</Texto>
                </View>
              </Cartao>
            )}

            {/* Atalho para estoque */}
            {pode("estoque.ver") && (
              <Pressable onPress={irEstoque} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <Cartao compacto atraso={300}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: ESP.sm }}>
                    <Box size={16} color={cores.violeta} strokeWidth={1.75} />
                    <Texto style={{ flex: 1, fontWeight: "600", fontSize: FONTE.pequeno }}>Ver estoque</Texto>
                    <ChevronRight size={16} color={cores.textoSuave} strokeWidth={1.75} />
                  </View>
                </Cartao>
              </Pressable>
            )}

            {/* Alertas dos lotes */}
            {alertas.length > 0 && (
              <>
                <CabecalhoSecao>Alertas</CabecalhoSecao>
                <Cartao atraso={350}>
                  {alertas.map((a, i) => (
                    <AlertaLinha key={`${a.tipo}-${i}`} a={a} ultimo={i === alertas.length - 1} />
                  ))}
                </Cartao>
              </>
            )}

            {/* Tudo em dia */}
            {faltam.length === 0 && alertas.length === 0 && dados && (
              <Cartao atraso={150}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: ESP.sm }}>
                  <CheckCircle2 size={20} color={cores.verde} strokeWidth={1.75} />
                  <View>
                    <Texto style={{ fontWeight: "600" }}>Tudo em dia!</Texto>
                    <Texto suave style={{ fontSize: FONTE.pequeno }}>Viveiros apontados e sem alertas.</Texto>
                  </View>
                </View>
              </Cartao>
            )}
          </>
        )}
      </ScrollView>
    </Fundo>
  );
}

// ---------------------------------------------------------------------------
// Componentes internos
// ---------------------------------------------------------------------------

function KpiCompacto({ valor, rotulo, cor, icone, atraso }: { valor: number; rotulo: string; cor: string; icone: ReactNode; atraso?: number }) {
  return (
    <Cartao compacto atraso={atraso} style={{ flex: 1, alignItems: "center", paddingVertical: ESP.md }}>
      {icone}
      <Texto style={{ fontSize: 22, fontWeight: "700", color: cor, marginTop: 2, fontVariant: ["tabular-nums"] }}>{valor}</Texto>
      <Texto suave style={{ fontSize: FONTE.micro, textAlign: "center" }}>{rotulo}</Texto>
    </Cartao>
  );
}

function ViveiroLinha({ g, feito, onPress, ultimo }: { g: ViveiroDia; feito?: boolean; onPress?: () => void; ultimo?: boolean }) {
  const { cores } = useTema();
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={({ pressed }: { pressed?: boolean }) => ({ opacity: pressed ? 0.7 : 1 }) as any}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: ESP.md, paddingVertical: ESP.sm }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: feito ? cores.etiquetaPositivo : cores.etiquetaAlerta, alignItems: "center", justifyContent: "center" }}>
          <Warehouse size={16} color={feito ? cores.etiquetaPositivoTexto : cores.etiquetaAlertaTexto} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Texto style={{ fontWeight: "600", fontSize: FONTE.corpo }}>{g.viveiro}</Texto>
          <Texto suave style={{ fontSize: FONTE.pequeno }}>
            {g.lote} · {g.peixes.toLocaleString("pt-BR")} peixes · sem {g.semana}
          </Texto>
        </View>
        {feito ? (
          <Etiqueta tom="positivo">Feito</Etiqueta>
        ) : onPress ? (
          <ChevronRight size={16} color={cores.textoSuave} strokeWidth={1.75} />
        ) : null}
      </View>
      {!ultimo && <View style={{ height: 1, backgroundColor: cores.linha, marginLeft: 44 }} />}
    </Wrapper>
  );
}

function EntregaLinha({ p, ultimo }: { p: EntregaDia; ultimo?: boolean }) {
  const { cores } = useTema();
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: ESP.md, paddingVertical: ESP.sm }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: cores.etiquetaInfo, alignItems: "center", justifyContent: "center" }}>
          <Truck size={16} color={cores.etiquetaInfoTexto} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Texto style={{ fontWeight: "600", fontSize: FONTE.corpo }}>#{p.numero} — {p.cliente}</Texto>
          <Texto suave style={{ fontSize: FONTE.pequeno }}>{p.itens}</Texto>
        </View>
        <Texto style={{ fontWeight: "600", fontSize: FONTE.pequeno, fontVariant: ["tabular-nums"] }}>
          R$ {(p.total_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </Texto>
      </View>
      {!ultimo && <View style={{ height: 1, backgroundColor: cores.linha, marginLeft: 44 }} />}
    </>
  );
}

function AlertaLinha({ a, ultimo }: { a: AlertaLote; ultimo?: boolean }) {
  const { cores } = useTema();
  const cor = a.nivel === "critico" ? cores.perigo : a.nivel === "atencao" ? cores.laranja : cores.azul;
  const fundo = a.nivel === "critico" ? cores.etiquetaPerigo : a.nivel === "atencao" ? cores.etiquetaAlerta : cores.etiquetaInfo;
  const tom = a.nivel === "critico" ? "perigo" as const : a.nivel === "atencao" ? "alerta" as const : "neutro" as const;
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: ESP.md, paddingVertical: ESP.sm }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: fundo, alignItems: "center", justifyContent: "center" }}>
          <AlertTriangle size={16} color={cor} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: ESP.sm }}>
            <Texto style={{ fontWeight: "600", flex: 1 }}>{a.titulo}</Texto>
            <Etiqueta tom={tom}>{a.nivel === "critico" ? "Crítico" : a.nivel === "atencao" ? "Atenção" : "Aviso"}</Etiqueta>
          </View>
          <Texto suave style={{ fontSize: FONTE.pequeno, marginTop: 2 }}>{a.detalhe}</Texto>
        </View>
      </View>
      {!ultimo && <View style={{ height: 1, backgroundColor: cores.linha, marginLeft: 44 }} />}
    </>
  );
}
