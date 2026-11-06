import * as Crypto from "expo-crypto";
import { useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { avisosAgua, CAMPOS_AGUA, lerMedida, type Agua } from "@regras/agua.ts";
import { CAUSAS_MORTE } from "@regras/causas-morte.ts";
import { formatarData, hojeISO, lerDecimal, somarDias } from "@regras/formato.ts";
import { TURNOS, UNIDADES_DOSE, VIAS_MEDICAMENTO, turnoAgora } from "@regras/rotulos.ts";
import { foraDoEsperado } from "@regras/sugestao-apontamento.ts";
import { Aviso, Botao, Campo, Cartao, Escolha, Etiqueta, Fundo, Recolhivel, Rotulo, Texto, Titulo } from "@/componentes/ui";
import { baseDaDose, formularioVazio, itensDoViveiro, montarApontamento, type Formulario } from "@/lib/campo/montar";
import { repetidoNaFila } from "@/lib/campo/fila";
import type { DadosCampo, Pendente } from "@/lib/campo/tipos";
import { useCampo } from "@/lib/campo/use-campo";
import { useSessao, type Empresa } from "@/lib/sessao";
import { ESP, FONTE, useTema } from "@/tema";

type Turno = "manha" | "tarde";
const kg = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const decimal = (n: number) => String(n).replace(".", ",");
const ORIGEM: Record<string, string> = { app: "celular", web: "computador" };

// Formulário novo do viveiro e turno, já com a ração normal do lote no turno (sugestão), como no /campo
function novoFormulario(dados: DadosCampo, viveiro: string, data: string, turno: Turno): Formulario {
  const f = formularioVazio(viveiro, data, turno);
  const s = dados.sugestoes?.[viveiro]?.[turno];
  if (!s) {
    if (dados.racoes.length === 1) f.racoes = [{ produto_id: dados.racoes[0].id, kg: "" }];
    return f;
  }
  const tipos = s.racoes.filter((r) => dados.racoes.some((x) => x.id === r.produto_id));
  if (tipos.length) f.racoes = tipos.map((r) => ({ produto_id: r.produto_id, kg: decimal(r.kg) }));
  else if (dados.racoes.length === 1) f.racoes = [{ produto_id: dados.racoes[0].id, kg: "" }];
  if (s.racaoKg) f.racaoKg = decimal(s.racaoKg);
  return f;
}

export default function Apontar() {
  const { estado } = useSessao();
  if (estado.fase !== "pronto") return null;
  return <TelaApontamento key={estado.empresa.id} empresa={estado.empresa} />;
}

function TelaApontamento({ empresa }: { empresa: Empresa }) {
  const { cores } = useTema();
  const campo = useCampo(empresa.id);
  const { dados } = campo;
  return (
    <Fundo>
      <ScrollView
        contentContainerStyle={{ padding: ESP.lg, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void campo.atualizarDados().then(campo.sincronizar)} tintColor={cores.marca} />}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <Titulo subtitulo={empresa.nome_fantasia || empresa.razao_social}>Apontamento</Titulo>
          <Etiqueta tom={campo.online ? "positivo" : "perigo"}>{campo.online ? "online" : "sem sinal"}</Etiqueta>
        </View>
        {campo.aviso && <Aviso>{campo.aviso}</Aviso>}
        {campo.sessaoExpirada && <Aviso tipo="perigo">Sua sessão expirou e a fila não foi enviada (continua guardada no celular). Saia e entre de novo na aba Mais.</Aviso>}
        {campo.erroDados && <Aviso tipo="alerta">{campo.erroDados}</Aviso>}
        <Fila campo={campo} />
        {!dados ? (
          <Aviso tipo="info">{campo.carregandoDados ? "Carregando os viveiros…" : "Abra esta aba uma vez com internet para baixar os viveiros. Depois ela funciona sem sinal."}</Aviso>
        ) : dados.viveiros.length === 0 ? (
          <Aviso tipo="info">Nenhum viveiro com lote povoado. Abra o lote no site ou no app de campo.</Aviso>
        ) : (
          <FormApontamento dados={dados} empresa={empresa} fila={campo.fila} aoSalvar={campo.guardar} />
        )}
      </ScrollView>
    </Fundo>
  );
}

function Fila({ campo }: { campo: ReturnType<typeof useCampo> }) {
  const { cores } = useTema();
  if (!campo.fila.length) return null;
  const confirmarDescarte = (p: Pendente) =>
    Alert.alert("Descartar?", `O lançamento de ${p.viveiro_nome} não será enviado.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Descartar", style: "destructive", onPress: () => void campo.descartar(p.client_id) },
    ]);
  return (
    <Cartao>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: ESP.sm }}>
        <Texto style={{ fontWeight: "600" }}>{campo.fila.length} aguardando envio</Texto>
        <Pressable accessibilityRole="button" disabled={campo.enviando || !campo.online} onPress={() => void campo.sincronizar()} style={{ minHeight: 44, justifyContent: "center" }}>
          <Texto style={{ color: cores.marca, fontWeight: "600" }}>{campo.enviando ? "enviando…" : "enviar agora"}</Texto>
        </Pressable>
      </View>
      {campo.fila.map((p) => (
        <View key={p.client_id} style={{ borderTopWidth: 1, borderTopColor: cores.linha, paddingVertical: ESP.sm }}>
          <Texto style={{ fontSize: FONTE.pequeno }}>
            {p.viveiro_nome} · {formatarData(p.data)} · {TURNOS[p.turno]}
            {p.racao_kg > 0 ? ` · ${kg(p.racao_kg)} kg de ração` : ""}
            {p.mortes ? ` · ${p.mortes} ${p.mortes === 1 ? "morte" : "mortes"}` : ""}
            {p.agua ? " · água" : ""}
            {p.checklist.length ? " · checklist" : ""}
            {p.medicacao ? " · com medicação" : ""}
          </Texto>
          {p.conflito ? (
            <>
              <Texto style={{ color: cores.perigo, fontSize: FONTE.pequeno, marginTop: ESP.xs }}>
                Este viveiro já tem lançamento nesta data e turno:{" "}
                {p.conflito.map((e) => `${kg(Number(e.racao_kg))} kg de ração, ${e.mortes + e.descartes} mortes (${ORIGEM[e.origem] ?? e.origem}, ${hora(e.criado_em)})`).join("; ")}. Se for o
                mesmo trato, descarte este; se for outro, some.
              </Texto>
              <View style={{ flexDirection: "row", gap: ESP.sm, marginTop: ESP.sm }}>
                <View style={{ flex: 1 }}>
                  <Botao variante="secundario" onPress={() => void campo.reenviar(p.client_id, (x) => ({ ...x, forcar: true }))}>Somar mesmo assim</Botao>
                </View>
                <View style={{ flex: 1 }}>
                  <Botao variante="secundario" onPress={() => confirmarDescarte(p)}>Descartar</Botao>
                </View>
              </View>
            </>
          ) : p.erro ? (
            <>
              <Texto style={{ color: cores.perigo, fontSize: FONTE.pequeno, marginTop: ESP.xs }}>{p.erro}</Texto>
              <Botao variante="secundario" onPress={() => void campo.reenviar(p.client_id)}>Tentar de novo</Botao>
              {p.erro.includes("Saldo insuficiente") && p.racoes.length > 0 && (
                <Botao variante="secundario" onPress={() => void campo.reenviar(p.client_id, (x) => ({ ...x, racoes: [] }))}>Enviar sem baixar a ração do estoque</Botao>
              )}
              <Botao variante="fantasma" onPress={() => confirmarDescarte(p)}>Descartar</Botao>
            </>
          ) : null}
        </View>
      ))}
    </Cartao>
  );
}

function FormApontamento({ dados, empresa, fila, aoSalvar }: { dados: DadosCampo; empresa: Empresa; fila: Pendente[]; aoSalvar: (p: Pendente) => Promise<void> }) {
  // a data padrão é a do aparelho no fuso da piscicultura, não a de quando os dados foram baixados
  const hoje = hojeISO(empresa.fuso);
  const [f, setF] = useState<Formulario>(() => novoFormulario(dados, dados.viveiros[0].id, hoje, turnoAgora(new Date(), empresa.fuso) as Turno));
  const [erro, setErro] = useState<string | null>(null);
  const mudar = (parte: Partial<Formulario>) => setF((x) => ({ ...x, ...parte }));
  const trocar = (viveiro: string, data: string, turno: Turno) => {
    setErro(null);
    setF(novoFormulario(dados, viveiro, data, turno));
  };

  const viveiro = dados.viveiros.find((g) => g.id === f.viveiro_id);
  const sugestao = dados.sugestoes?.[f.viveiro_id]?.[f.turno];
  const itens = itensDoViveiro(dados.checklist, viveiro);
  const medicamento = dados.medicamentos.find((m) => m.id === f.medicamento_id);
  const base = baseDaDose(medicamento?.via);
  // ração digitada (soma dos tipos ou o total), para comparar com o normal do lote no turno
  const racaoDigitada = useMemo(() => {
    if (!dados.racoes.length) return lerDecimal(f.racaoKg);
    const kgs = f.racoes.map((r) => lerDecimal(r.kg)).filter((n): n is number => n !== null);
    return kgs.length ? kgs.reduce((a, b) => a + b, 0) : null;
  }, [dados.racoes.length, f.racaoKg, f.racoes]);
  // o que a medida da água pede na hora (oxigênio baixo, amônia tóxica...), com as faixas dos alertas
  const avisos = useMemo(() => {
    const a: Agua = {};
    for (const c of CAMPOS_AGUA) {
      const n = lerMedida(f.agua[c.chave]);
      if (typeof n === "number") a[c.chave] = n;
    }
    return avisosAgua(a);
  }, [f.agua]);
  const mortes = Number(f.mortes.trim() || 0);

  function salvar() {
    const r = montarApontamento(f, { viveiros: dados.viveiros, checklist: dados.checklist, temTiposRacao: dados.racoes.length > 0, agua: dados.agua, hoje, clientId: Crypto.randomUUID() });
    if ("erro" in r) return setErro(r.erro);
    const confirmar = async (forcar: boolean) => {
      await aoSalvar({ ...r.ok, forcar: forcar || undefined });
      // como no /campo: passa para o próximo viveiro
      const i = dados.viveiros.findIndex((g) => g.id === f.viveiro_id);
      trocar(dados.viveiros[i + 1]?.id ?? f.viveiro_id, f.data, f.turno);
    };
    if (repetidoNaFila(fila, r.ok)) {
      return Alert.alert("Lançamento repetido", `Já tem um lançamento de ${r.ok.viveiro_nome} nesta data e turno esperando envio. Salvar outro e somar os dois?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Somar", onPress: () => void confirmar(true) },
      ]);
    }
    void confirmar(false);
  }

  return (
    <Cartao style={{ padding: ESP.lg }}>
      <Rotulo>Viveiro</Rotulo>
      <Escolha rolar opcoes={dados.viveiros.map((g) => ({ valor: g.id, rotulo: `${g.nome} · ${g.lote}` }))} valor={f.viveiro_id} aoEscolher={(g) => trocar(g, f.data, f.turno)} />
      <Rotulo>Data</Rotulo>
      <Escolha
        opcoes={[0, 1, 2].map((d) => ({ valor: somarDias(hoje, -d), rotulo: d === 0 ? "Hoje" : d === 1 ? "Ontem" : formatarData(somarDias(hoje, -d)).slice(0, 5) }))}
        valor={f.data}
        aoEscolher={(d) => mudar({ data: d })}
      />
      <Rotulo>Turno</Rotulo>
      <Escolha opcoes={Object.entries(TURNOS).map(([valor, rotulo]) => ({ valor: valor as Turno, rotulo }))} valor={f.turno} aoEscolher={(t) => trocar(f.viveiro_id, f.data, t)} />

      {dados.racoes.length > 0 ? (
        <View style={{ marginBottom: ESP.md }}>
          <Rotulo>Ração dada (sai do estoque)</Rotulo>
          {f.racoes.map((r, i) => (
            <View key={i} style={{ marginBottom: ESP.xs }}>
              <Escolha rolar opcoes={dados.racoes.map((x) => ({ valor: x.id, rotulo: x.nome }))} valor={r.produto_id || null} aoEscolher={(id) => mudar({ racoes: f.racoes.map((y, j) => (j === i ? { ...y, produto_id: id } : y)) })} />
              <Campo rotulo={f.racoes.length > 1 ? `kg de ração ${i + 1}` : "kg de ração"} value={r.kg} onChangeText={(t) => mudar({ racoes: f.racoes.map((y, j) => (j === i ? { ...y, kg: t } : y)) })} keyboardType="decimal-pad" placeholder="0" />
            </View>
          ))}
          {f.racoes.length < 4 && (
            <Botao variante="secundario" onPress={() => mudar({ racoes: [...f.racoes, { produto_id: "", kg: "" }] })}>
              + outro tipo de ração
            </Botao>
          )}
        </View>
      ) : (
        <Campo rotulo="Ração dada (kg)" value={f.racaoKg} onChangeText={(t) => mudar({ racaoKg: t })} keyboardType="decimal-pad" placeholder="0" />
      )}
      {sugestao && sugestao.racaoKg > 0 && (
        <Texto suave style={{ fontSize: FONTE.micro, marginTop: -6, marginBottom: ESP.sm }}>
          Já vem com o normal do lote neste turno ({kg(sugestao.racaoKg)} kg). Confira e corrija.
        </Texto>
      )}
      {sugestao && sugestao.racaoKg > 0 && foraDoEsperado(racaoDigitada, sugestao.racaoKg) && (
        <Aviso tipo="alerta">Fora do normal do lote ({kg(sugestao.racaoKg)} kg neste turno). Confira antes de salvar.</Aviso>
      )}

      <Campo rotulo="Peixes mortos" value={f.mortes} onChangeText={(t) => mudar({ mortes: t })} keyboardType="number-pad" placeholder="0" />
      {mortes > 0 && (
        <>
          <Rotulo>Causa provável</Rotulo>
          <Escolha rolar opcoes={[{ valor: "", rotulo: "Não sei" }, ...CAUSAS_MORTE.map((c) => ({ valor: c.chave as string, rotulo: c.nome }))]} valor={f.causa} aoEscolher={(c) => mudar({ causa: c })} />
        </>
      )}

      {dados.agua && (
        <Recolhivel titulo="Qualidade da água">
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: ESP.md }}>
            {CAMPOS_AGUA.map((c) => (
              <View key={c.chave} style={{ width: "47%" }}>
                <Campo rotulo={`${c.curto}${c.unidade ? ` (${c.unidade})` : ""}`} value={f.agua[c.chave] ?? ""} onChangeText={(t) => mudar({ agua: { ...f.agua, [c.chave]: t } })} keyboardType="decimal-pad" placeholder="—" />
              </View>
            ))}
          </View>
          <Texto suave style={{ fontSize: FONTE.micro, marginBottom: ESP.sm }}>Oxigênio de preferência ao amanhecer. Deixe em branco o que não mediu.</Texto>
        </Recolhivel>
      )}
      {avisos.map((a) => (
        <Aviso key={a.chave} tipo={a.nivel === "critico" ? "perigo" : "alerta"}>{a.texto}</Aviso>
      ))}

      {itens.length > 0 && (
        <Recolhivel titulo="Checklist do viveiro" aberto>
          {itens.map((c) => {
            const r = f.checklist[c.id] ?? {};
            const responder = (nova: typeof r) => mudar({ checklist: { ...f.checklist, [c.id]: nova } });
            return c.tipo === "numero" ? (
              <View key={c.id} style={{ marginBottom: ESP.sm }}>
                <Campo
                  rotulo={`${c.nome}${c.unidade ? ` (${c.unidade})` : ""}`}
                  value={r.naoMedir || r.valor === undefined ? "" : decimal(r.valor)}
                  editable={!r.naoMedir}
                  onChangeText={(t) => {
                    const n = Number(t.replace(",", "."));
                    responder(t.trim() && Number.isFinite(n) ? { valor: n } : {});
                  }}
                  keyboardType="decimal-pad"
                  placeholder={r.naoMedir ? "não medido" : "valor medido"}
                />
                <Escolha opcoes={[{ valor: "medir", rotulo: "Medir" }, { valor: "nao", rotulo: "Não medir" }]} valor={r.naoMedir ? "nao" : "medir"} aoEscolher={(v) => responder(v === "nao" ? { naoMedir: true } : {})} />
              </View>
            ) : (
              <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: ESP.sm, marginBottom: ESP.xs }}>
                <Texto style={{ flex: 1 }}>{c.nome}</Texto>
                <View style={{ width: 150 }}>
                  <Escolha opcoes={[{ valor: "ok", rotulo: "ok" }, { valor: "nao", rotulo: "não" }]} valor={r.ok === undefined ? null : r.ok ? "ok" : "nao"} aoEscolher={(v) => responder({ ok: v === "ok" })} />
                </View>
              </View>
            );
          })}
        </Recolhivel>
      )}

      {dados.medicamentos.length > 0 && (
        <Recolhivel titulo="Aplicou medicamento ou vitamina?">
          <Escolha
            rolar
            opcoes={[{ valor: "", rotulo: "Nenhum" }, ...dados.medicamentos.map((m) => ({ valor: m.id, rotulo: `${m.nome}${m.dose ? ` · ${decimal(m.dose)} ${UNIDADES_DOSE[m.unidade] ?? m.unidade}/${m.via === "racao" ? "kg" : "m³"}` : ""}` }))]}
            valor={f.medicamento_id}
            aoEscolher={(id) => mudar({ medicamento_id: id })}
          />
          {medicamento ? (
            <>
              {medicamento.via && <Texto suave style={{ fontSize: FONTE.pequeno, marginBottom: ESP.sm }}>{VIAS_MEDICAMENTO[medicamento.via] ?? medicamento.via}</Texto>}
              <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: ESP.md }}>
                {(
                  [
                    ["medDias", "Dias de tratamento", "1"],
                    ["medBase", base.rotulo, "opcional"],
                    ["medDose", `Dose por ${medicamento.via === "racao" ? "kg" : "m³"}`, "a do cadastro"],
                    ["medQuantidade", "Quantidade usada", "opcional"],
                  ] as const
                ).map(([chave, rotulo, dica]) => (
                  <View key={chave} style={{ width: "47%" }}>
                    <Campo rotulo={rotulo} value={f[chave]} onChangeText={(t) => mudar({ [chave]: t })} keyboardType="decimal-pad" placeholder={dica} />
                  </View>
                ))}
              </View>
              {medicamento.carencia > 0 && (
                <Aviso tipo="alerta">
                  Carência de {medicamento.carencia} dias: o lote não pode ser despescado para venda antes de{" "}
                  {formatarData(somarDias(f.data, Math.max(1, Math.round(lerDecimal(f.medDias) ?? 1)) - 1 + medicamento.carencia))}.
                </Aviso>
              )}
            </>
          ) : null}
        </Recolhivel>
      )}

      <Campo rotulo="Observações" value={f.observacoes} onChangeText={(t) => mudar({ observacoes: t })} maxLength={500} />
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <Botao onPress={salvar}>Salvar</Botao>
      <Texto suave style={{ fontSize: FONTE.micro }}>
        Funciona sem sinal: o lançamento fica guardado no celular e vai sozinho quando a internet voltar.
      </Texto>
    </Cartao>
  );
}
