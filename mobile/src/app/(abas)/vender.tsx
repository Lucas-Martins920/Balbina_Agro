import * as Crypto from "expo-crypto";
import { useMemo, useState, type ReactNode } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Switch, View } from "react-native";
import { formatarData, formatarMoeda, hojeISO, somarDias } from "@regras/formato.ts";
import { resumoWhatsapp } from "@regras/pedido-campo.ts";
import { textoKg, textoQuantidade, vendidoPorKg } from "@regras/pescado.ts";
import { FORMAS_PAGAMENTO } from "@regras/titulos.ts";
import { CONDICOES, STATUS_PEDIDO, TOM_STATUS_PEDIDO, linkWhatsapp } from "@regras/vendas.ts";
import { Balcao } from "@/componentes/balcao";
import { Aviso, Botao, Campo, Cartao, Contador, Escolha, Etiqueta, Fundo, Rotulo, Texto, Titulo } from "@/componentes/ui";
import { nomeEmpresa, useSessao, type Empresa } from "@/lib/sessao";
import { clientesSugeridos, linhasDoCarrinho, montarPedido } from "@/lib/vendas/carrinho";
import type { ClienteVenda, DadosVendas, PedidoEnviado } from "@/lib/vendas/tipos";
import { useVendas } from "@/lib/vendas/use-vendas";
import { ESP, FONTE, useTema } from "@/tema";

const FORMAS_RAPIDAS = ["pix", "boleto", "dinheiro", "cartao", "ted"] as const;
const TOM: Record<string, "positivo" | "perigo" | "alerta" | "neutro"> = { positivo: "positivo", perigo: "perigo", alerta: "alerta", info: "neutro", neutro: "neutro" };

// Pedido de venda no celular, como o /vendedor do site: cliente, produtos com o preço da tabela dele,
// condição, forma, entrega e "já faturar". Sem sinal o pedido fica na fila e vai quando voltar.
export default function Vender() {
  const { estado, pode } = useSessao();
  if (estado.fase !== "pronto") return null;
  const pedido = pode("vendas.lancar");
  const balcao = pode("pdv.operar");
  if (!pedido && !balcao) {
    return (
      <Fundo>
        <View style={{ padding: ESP.lg }}>
          <Titulo>Vendas</Titulo>
          <Aviso tipo="alerta">Seu usuário não tem permissão para lançar pedidos nem vender no caixa. O master libera em Usuários, no site.</Aviso>
        </View>
      </Fundo>
    );
  }
  return <TelaVendas key={estado.empresa.id} empresa={estado.empresa} pedido={pedido} balcao={balcao} />;
}

// Pedido (vendedor, funciona sem sinal) ou Balcão (PDV, precisa de sinal); cada um aparece com a sua permissão
function TelaVendas({ empresa, pedido, balcao }: { empresa: Empresa; pedido: boolean; balcao: boolean }) {
  const [modo, setModo] = useState<"pedido" | "balcao">(pedido ? "pedido" : "balcao");
  const seletor = pedido && balcao ? <Escolha opcoes={[{ valor: "pedido", rotulo: "Pedido" }, { valor: "balcao", rotulo: "Balcão (PDV)" }]} valor={modo} aoEscolher={setModo} /> : null;
  if (modo === "balcao") {
    return (
      <Fundo>
        <ScrollView contentContainerStyle={{ padding: ESP.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Titulo subtitulo={nomeEmpresa(empresa)}>Balcão</Titulo>
          {seletor}
          <Balcao empresa={empresa} />
        </ScrollView>
      </Fundo>
    );
  }
  return <TelaPedidos empresa={empresa} seletor={seletor} />;
}

function TelaPedidos({ empresa, seletor }: { empresa: Empresa; seletor: ReactNode }) {
  const { cores } = useTema();
  const v = useVendas(empresa.id);
  const [aba, setAba] = useState<"novo" | "pedidos">("novo");
  return (
    <Fundo>
      <ScrollView
        contentContainerStyle={{ padding: ESP.lg, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void v.atualizarDados().then(v.sincronizar)} tintColor={cores.marca} />}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <Titulo subtitulo={nomeEmpresa(empresa)}>Vendas</Titulo>
          <Etiqueta tom={v.online ? "positivo" : "perigo"}>{v.online ? "online" : "sem sinal"}</Etiqueta>
        </View>
        {seletor}
        <Escolha opcoes={[{ valor: "novo", rotulo: "Novo pedido" }, { valor: "pedidos", rotulo: `Pedidos${v.fila.length ? ` (${v.fila.length})` : ""}` }]} valor={aba} aoEscolher={setAba} />
        {v.aviso && <Aviso>{v.aviso}</Aviso>}
        {v.erroDados && <Aviso tipo="alerta">{v.erroDados}</Aviso>}
        {!v.dados ? (
          <Aviso tipo="info">{v.carregando ? "Carregando o catálogo…" : "Abra esta aba uma vez com internet para baixar clientes e preços. Depois ela funciona sem sinal."}</Aviso>
        ) : aba === "novo" ? (
          <NovoPedido dados={v.dados} empresa={empresa} aoEnviar={async (p) => { await v.guardar(p); setAba("pedidos"); }} />
        ) : (
          <Pedidos v={v} empresa={empresa} />
        )}
      </ScrollView>
    </Fundo>
  );
}

function NovoPedido({ dados, empresa, aoEnviar }: { dados: DadosVendas; empresa: Empresa; aoEnviar: (p: Parameters<ReturnType<typeof useVendas>["guardar"]>[0]) => Promise<void> }) {
  const { cores } = useTema();
  const hoje = hojeISO(empresa.fuso);
  const [busca, setBusca] = useState("");
  const [cliente, setCliente] = useState<ClienteVenda | null>(null);
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [condicao, setCondicao] = useState("avista");
  const [forma, setForma] = useState("pix");
  const [entrega, setEntrega] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [faturar, setFaturar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const sugeridos = useMemo(() => clientesSugeridos(dados, busca), [dados, busca]);
  const carrinho = useMemo(() => linhasDoCarrinho(dados, cliente, qtd, hoje), [dados, cliente, qtd, hoje]);
  const ultimo = cliente ? dados.ultimos.find((u) => u.cliente_id === cliente.id) : undefined;

  function escolher(c: ClienteVenda) {
    setCliente(c);
    setBusca("");
    setErro(null);
    const u = dados.ultimos.find((x) => x.cliente_id === c.id);
    if (u?.condicao) setCondicao(u.condicao);
    if (u?.forma_pagamento) setForma(u.forma_pagamento);
  }

  async function enviar() {
    const r = montarPedido(dados, { cliente, qtd, condicao, forma, entrega, observacoes, faturar }, hoje, Crypto.randomUUID());
    if ("erro" in r) return setErro(r.erro);
    await aoEnviar(r.ok);
    setCliente(null);
    setQtd({});
    setObservacoes("");
    setEntrega("");
    setFaturar(false);
  }

  if (!cliente) {
    return (
      <Cartao>
        <Campo rotulo="Cliente" value={busca} onChangeText={setBusca} placeholder="Nome, cidade ou CPF/CNPJ" autoCorrect={false} />
        {sugeridos.map((c) => (
          <Pressable key={c.id} accessibilityRole="button" onPress={() => escolher(c)} style={{ minHeight: 48, justifyContent: "center", borderTopWidth: 1, borderTopColor: cores.linha }}>
            <Texto style={{ fontWeight: "600" }}>{c.nome}</Texto>
            {c.cidade ? <Texto suave style={{ fontSize: FONTE.pequeno }}>{c.cidade}</Texto> : null}
          </Pressable>
        ))}
        {!sugeridos.length && <Texto suave>Nenhum cliente encontrado. Cliente novo é cadastrado no site.</Texto>}
      </Cartao>
    );
  }

  return (
    <>
      <Cartao>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Texto style={{ fontWeight: "600" }}>{cliente.nome}</Texto>
            {ultimo && <Texto suave style={{ fontSize: FONTE.pequeno }}>Último pedido em {formatarData(ultimo.data)}</Texto>}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setCliente(null)} style={{ minHeight: 44, justifyContent: "center" }}>
            <Texto style={{ color: cores.marca, fontWeight: "600" }}>trocar</Texto>
          </Pressable>
        </View>
        {ultimo && ultimo.itens.length > 0 && (
          <Botao variante="secundario" onPress={() => setQtd(Object.fromEntries(ultimo.itens.filter((i) => dados.produtos.some((p) => p.id === i.produto_id)).map((i) => [i.produto_id, i.quantidade])))}>
            Repetir o último pedido
          </Botao>
        )}
      </Cartao>
      <Cartao>
        {carrinho.linhas.map((l) => (
          <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: ESP.sm, paddingVertical: ESP.sm, borderTopWidth: 1, borderTopColor: cores.linha }}>
            <View style={{ flex: 1 }}>
              <Texto style={{ fontWeight: "500" }}>{l.nome}</Texto>
              <Texto suave style={{ fontSize: FONTE.pequeno }}>
                {l.preco === null ? "sem preço" : `${formatarMoeda(l.preco)}${vendidoPorKg(l.fator_kg) ? " o kg" : ""}`}
                {l.max !== null ? ` · ${textoQuantidade(l.max, l.fator_kg, l.unidade)} em estoque` : ""}
              </Texto>
            </View>
            <Contador valor={l.quantidade} max={l.max} rotulo={l.nome} casas={vendidoPorKg(l.fator_kg) ? 3 : 0} aoMudar={(n) => setQtd((q) => ({ ...q, [l.id]: n }))} />
          </View>
        ))}
      </Cartao>
      <Cartao>
        <Rotulo>Condição</Rotulo>
        <Escolha rolar opcoes={Object.entries(CONDICOES).map(([valor, c]) => ({ valor, rotulo: c.nome }))} valor={condicao} aoEscolher={setCondicao} />
        <Rotulo>Forma de pagamento</Rotulo>
        <Escolha rolar opcoes={FORMAS_RAPIDAS.map((f) => ({ valor: f, rotulo: FORMAS_PAGAMENTO[f] }))} valor={forma} aoEscolher={setForma} />
        <Rotulo>Entrega</Rotulo>
        <Escolha opcoes={[{ valor: "", rotulo: "Sem data" }, { valor: hoje, rotulo: "Hoje" }, { valor: somarDias(hoje, 1), rotulo: "Amanhã" }]} valor={entrega} aoEscolher={setEntrega} />
        <Campo rotulo="Observações" value={observacoes} onChangeText={setObservacoes} placeholder="Endereço, horário, troco…" maxLength={500} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ESP.md }}>
          <View style={{ flex: 1 }}>
            <Texto style={{ fontWeight: "600" }}>Já faturar</Texto>
            <Texto suave style={{ fontSize: FONTE.pequeno }}>Baixa o estoque e gera o contas a receber na hora.</Texto>
          </View>
          <Switch value={faturar} onValueChange={setFaturar} trackColor={{ true: cores.marca }} />
        </View>
        <Texto style={{ fontSize: FONTE.tituloSecao, fontWeight: "700", marginBottom: ESP.xs }}>{formatarMoeda(carrinho.total)}</Texto>
        {carrinho.kg > 0 && <Texto suave style={{ fontSize: FONTE.pequeno, marginBottom: ESP.sm }}>{textoKg(carrinho.kg, 3)} de peixe · o escritório confirma o preço ao gravar</Texto>}
        {erro && <Aviso tipo="perigo">{erro}</Aviso>}
        <Botao onPress={enviar} desativado={!carrinho.escolhidas.length}>
          Enviar pedido
        </Botao>
      </Cartao>
    </>
  );
}

function Pedidos({ v, empresa }: { v: ReturnType<typeof useVendas>; empresa: Empresa }) {
  const { cores } = useTema();
  const whatsapp = (p: PedidoEnviado) =>
    Linking.openURL(
      linkWhatsapp(
        p.telefone,
        resumoWhatsapp({ empresa: nomeEmpresa(empresa), cliente: p.cliente_nome, numero: p.numero, itens: p.resumo, total_cents: p.total_cents, condicao: CONDICOES[p.condicao]?.nome ?? p.condicao, entrega: p.entrega }),
      ),
    );
  return (
    <>
      {v.fila.length > 0 && (
        <Cartao>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Texto style={{ fontWeight: "600" }}>{v.fila.length} aguardando envio</Texto>
            <Pressable accessibilityRole="button" disabled={v.enviando || !v.online} onPress={() => void v.sincronizar()} style={{ minHeight: 44, justifyContent: "center" }}>
              <Texto style={{ color: cores.marca, fontWeight: "600" }}>{v.enviando ? "enviando…" : "enviar agora"}</Texto>
            </Pressable>
          </View>
          {v.fila.map((p) => (
            <View key={p.client_id} style={{ borderTopWidth: 1, borderTopColor: cores.linha, paddingVertical: ESP.sm }}>
              <Texto>
                {p.cliente_nome} · {formatarMoeda(p.total_estimado)}
                {p.faturar ? " · faturar" : ""}
              </Texto>
              {p.erro && (
                <>
                  <Texto style={{ color: cores.perigo, fontSize: FONTE.pequeno, marginTop: ESP.xs }}>{p.erro}</Texto>
                  <Botao variante="secundario" onPress={() => void v.reenviar(p.client_id)}>Tentar de novo</Botao>
                  <Botao
                    variante="fantasma"
                    onPress={() =>
                      Alert.alert("Descartar?", `O pedido de ${p.cliente_nome} não será enviado.`, [
                        { text: "Cancelar", style: "cancel" },
                        { text: "Descartar", style: "destructive", onPress: () => void v.descartar(p.client_id) },
                      ])
                    }
                  >
                    Descartar
                  </Botao>
                </>
              )}
            </View>
          ))}
        </Cartao>
      )}
      {v.enviados.length > 0 && (
        <Cartao atraso={0}>
          <Texto style={{ fontWeight: "600", marginBottom: ESP.xs }}>Enviados deste celular</Texto>
          {v.enviados.map((p) => (
            <View key={p.client_id} style={{ borderTopWidth: 1, borderTopColor: cores.linha, paddingVertical: ESP.sm }}>
              <Texto>
                {p.numero ? `Pedido ${p.numero}` : "Pedido"} · {p.cliente_nome} · {formatarMoeda(p.total_cents)}
              </Texto>
              {p.aviso && <Texto style={{ color: cores.alerta, fontSize: FONTE.pequeno }}>{p.aviso}</Texto>}
              <Botao variante="secundario" onPress={() => void whatsapp(p)}>Mandar no WhatsApp</Botao>
            </View>
          ))}
        </Cartao>
      )}
      <Cartao atraso={80}>
        <Texto style={{ fontWeight: "600", marginBottom: ESP.xs }}>Meus últimos pedidos</Texto>
        {(v.dados?.pedidos ?? []).map((p) => (
          <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: ESP.sm, borderTopWidth: 1, borderTopColor: cores.linha, paddingVertical: ESP.sm }}>
            <View style={{ flex: 1 }}>
              <Texto>
                {p.numero} · {p.cliente}
              </Texto>
              <Texto suave style={{ fontSize: FONTE.pequeno }}>
                {formatarData(p.data)} · {formatarMoeda(p.total_cents)}
              </Texto>
            </View>
            <Etiqueta tom={TOM[TOM_STATUS_PEDIDO[p.status] ?? "neutro"]}>{STATUS_PEDIDO[p.status] ?? p.status}</Etiqueta>
          </View>
        ))}
        {!v.dados?.pedidos.length && <Texto suave>Nenhum pedido ainda.</Texto>}
      </Cartao>
    </>
  );
}
