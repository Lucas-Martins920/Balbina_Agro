import * as Crypto from "expo-crypto";
import { useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { formatarMoeda, hojeISO, lerCentavos } from "@regras/formato.ts";
import { textoQuantidade, vendidoPorKg } from "@regras/pescado.ts";
import { fecharPagamento, FORMAS_PDV, notasSugeridas, type FormaPdv, type PagamentoPdv } from "@regras/vendas.ts";
import { Aviso, Botao, Campo, Carregando, Cartao, Contador, Escolha, Etiqueta, Rotulo, Texto } from "@/componentes/ui";
import { montarCaixa, montarVenda, mudarQuantidade, podeReceber, tabelas, textoCupom } from "@/lib/pdv/caixa";
import type { DadosPdv } from "@/lib/pdv/tipos";
import { usePdv } from "@/lib/pdv/use-pdv";
import type { Empresa } from "@/lib/sessao";
import type { ClienteVenda } from "@/lib/vendas/tipos";
import { FONTE, RAIO, TOQUE, useTema } from "@/tema";

type Concluida = { numero: number; total_cents: number; troco_cents: number; cliente: string; ponto: string | null; itens: { nome: string; quantidade: number; preco: number }[]; pagamentos: PagamentoPdv[] };

// PDV de balcão no celular, como /vendas/pdv do site: toca nos produtos (seções Por kg e Caixas; o kg pode ser
// digitado até o grama), o carrinho já tira do estoque da classe do peixe, recebe em dinheiro/Pix/cartão (pode
// misturar) e mostra o troco.
export function Balcao({ empresa }: { empresa: Empresa }) {
  const p = usePdv(empresa.id);
  if (!p.dados) {
    return p.carregando ? <Carregando /> : (
      <>
        <Aviso tipo="alerta">{p.erro ?? "Não foi possível abrir o caixa."}</Aviso>
        <Botao variante="secundario" onPress={() => void p.reabrir()}>Tentar de novo</Botao>
      </>
    );
  }
  return <Caixa key={p.dados.ponto?.id ?? "piscicultura"} pdv={p} dados={p.dados} empresa={empresa} />;
}

function Caixa({ pdv, dados, empresa }: { pdv: ReturnType<typeof usePdv>; dados: DadosPdv; empresa: Empresa }) {
  const { cores } = useTema();
  const hoje = hojeISO(empresa.fuso);
  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [cliente, setCliente] = useState<ClienteVenda | null>(null);
  const [tabelaEscolhida, setTabelaEscolhida] = useState<string | null>(null);
  const [buscaCliente, setBuscaCliente] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);
  const [pagamentos, setPagamentos] = useState<PagamentoPdv[]>([]);
  const [forma, setForma] = useState<FormaPdv>("dinheiro");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [clientId, setClientId] = useState(() => Crypto.randomUUID());
  const [concluida, setConcluida] = useState<Concluida | null>(null);

  const t = tabelas(dados, cliente, tabelaEscolhida);
  const caixa = montarCaixa(dados, cliente, t.tabela, carrinho, hoje, busca);
  const fechamento = fecharPagamento(caixa.total, pagamentos);
  const bancos = dados.contas.filter((c) => c.tipo !== "caixinha");
  const multiponto = dados.pontos.length > 1;

  function mudar(id: string, q: number) {
    const r = mudarQuantidade(dados, carrinho, id, q);
    setCarrinho(r.carrinho);
    setErro(r.erro);
  }
  function escolherCliente(c: ClienteVenda | null) {
    setCliente(c);
    setTabelaEscolhida(null);
    setBuscaCliente(null);
  }
  function receber() {
    const bloqueio = podeReceber(caixa);
    if (bloqueio) return setErro(bloqueio);
    setErro(null);
    setPagando(true);
  }
  function somar(f: FormaPdv, centavos: number | null) {
    if (!centavos || centavos <= 0) return setErro("Valor inválido.");
    setErro(null);
    setPagamentos((ps) => [...ps, { forma: f, valor_cents: centavos }]);
    setValor("");
  }
  async function finalizar() {
    if (enviando) return;
    const v = montarVenda(caixa, { clientId, cliente, tabela: t.tabela, tabelaCliente: t.doCliente, pagamentos, conta: pdv.conta, ponto: dados.ponto?.id ?? null });
    if ("erro" in v) return setErro(v.erro);
    setEnviando(true);
    const r = await pdv.vender(v.ok);
    setEnviando(false);
    if ("erro" in r) return setErro(r.erro);
    setConcluida({
      numero: r.ok.numero, total_cents: r.ok.total_cents, troco_cents: Math.max(r.ok.troco_cents, fechamento.troco),
      cliente: cliente?.nome ?? "Consumidor final", ponto: dados.ponto && !dados.ponto.sede ? dados.ponto.nome : null,
      itens: caixa.itens.map((i) => ({ nome: i.nome, quantidade: i.quantidade, preco: i.preco })), pagamentos,
    });
  }
  function novaVenda() {
    setCarrinho({});
    setPagamentos([]);
    escolherCliente(null);
    setPagando(false);
    setErro(null);
    setValor("");
    setForma("dinheiro");
    setBusca("");
    setClientId(Crypto.randomUUID());
    setConcluida(null);
    void pdv.carregar(dados.ponto?.id ?? null); // estoque e total do dia atualizados
  }

  if (concluida) {
    return (
      <Cartao>
        <Texto suave style={{ textAlign: "center" }}>Venda nº {concluida.numero} concluída</Texto>
        <Text style={{ color: cores.texto, fontSize: 36, fontWeight: "700", textAlign: "center", marginVertical: 8, fontVariant: ["tabular-nums"] }}>{formatarMoeda(concluida.total_cents)}</Text>
        {concluida.troco_cents > 0 && (
          <View style={{ backgroundColor: cores.etiquetaPositivo, borderRadius: RAIO.campo, padding: 14, marginBottom: 12 }}>
            <Text style={{ color: cores.etiquetaPositivoTexto, fontSize: 26, fontWeight: "700", textAlign: "center", fontVariant: ["tabular-nums"] }}>Troco: {formatarMoeda(concluida.troco_cents)}</Text>
          </View>
        )}
        <Botao onPress={novaVenda}>Nova venda</Botao>
        <Botao variante="secundario" onPress={() => void Share.share({ message: textoCupom(concluida, formatarMoeda) })}>Compartilhar cupom</Botao>
      </Cartao>
    );
  }

  const cabecalho = (
    <Cartao>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: multiponto ? 8 : 0 }}>
        <Texto suave>Hoje{multiponto && dados.ponto ? ` em ${dados.ponto.nome}` : ""}: {formatarMoeda(dados.vendido_hoje)}</Texto>
        {!pdv.online && <Etiqueta tom="perigo">sem sinal</Etiqueta>}
      </View>
      {multiponto && (
        <Escolha rolar opcoes={dados.pontos.map((pt) => ({ valor: pt.id, rotulo: pt.nome }))} valor={dados.ponto?.id ?? null} aoEscolher={(id) => void pdv.carregar(id)} />
      )}
    </Cartao>
  );

  const clienteETabela = (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: TOQUE }}>
        <Texto suave>Cliente</Texto>
        <Pressable accessibilityRole="button" onPress={() => setBuscaCliente(buscaCliente === null ? "" : null)} style={{ minHeight: TOQUE, justifyContent: "center" }}>
          <Texto style={{ color: cores.marca, fontWeight: "600" }}>{cliente?.nome ?? "Consumidor final"}</Texto>
        </Pressable>
      </View>
      {buscaCliente !== null && (
        <>
          <Campo rotulo="Buscar cliente" value={buscaCliente} onChangeText={setBuscaCliente} autoCorrect={false} autoFocus />
          <Escolha
            rolar
            opcoes={[{ valor: "", rotulo: "Consumidor final" }, ...dados.clientes
              .filter((c) => c.nome !== "Consumidor final" && (!buscaCliente.trim() || c.nome.toLowerCase().includes(buscaCliente.trim().toLowerCase())))
              .slice(0, 8)
              .map((c) => ({ valor: c.id, rotulo: c.nome }))]}
            valor={cliente?.id ?? ""}
            aoEscolher={(id) => escolherCliente(dados.clientes.find((c) => c.id === id) ?? null)}
          />
        </>
      )}
      {t.ativas.length > 1 && (
        <>
          <Rotulo>Tabela</Rotulo>
          <Escolha rolar opcoes={t.ativas.map((l) => ({ valor: l.id, rotulo: `${l.nome}${l.id === t.doCliente && cliente ? " (do cliente)" : ""}` }))} valor={t.tabela} aoEscolher={(id) => setTabelaEscolhida(id === t.doCliente ? null : id)} />
        </>
      )}
    </>
  );

  if (pagando) {
    const falta = fechamento.falta;
    return (
      <>
        <Cartao>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <Quadro titulo="Total" valor={caixa.total} fundo={cores.elevado} />
            <Quadro titulo={falta > 0 ? "Falta" : "Troco"} valor={falta > 0 ? falta : fechamento.troco} fundo={falta > 0 ? cores.etiquetaAlerta : cores.etiquetaPositivo} />
          </View>
          {pagamentos.map((pg, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: cores.linha, minHeight: TOQUE }}>
              <Texto>{FORMAS_PDV[pg.forma]}</Texto>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Texto>{formatarMoeda(pg.valor_cents)}</Texto>
                <Pressable accessibilityRole="button" accessibilityLabel="Remover pagamento" onPress={() => setPagamentos(pagamentos.filter((_, j) => j !== i))} style={{ minWidth: TOQUE, minHeight: TOQUE, alignItems: "center", justifyContent: "center" }}>
                  <Texto suave>✕</Texto>
                </Pressable>
              </View>
            </View>
          ))}
          {falta > 0 && (
            <>
              <Rotulo>Forma de pagamento</Rotulo>
              <Escolha opcoes={(Object.keys(FORMAS_PDV) as FormaPdv[]).map((f) => ({ valor: f, rotulo: FORMAS_PDV[f] }))} valor={forma} aoEscolher={setForma} />
              {forma === "dinheiro" ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {notasSugeridas(falta).map((n) => (
                    <Pressable key={n} accessibilityRole="button" onPress={() => somar("dinheiro", n)}
                      style={({ pressed }) => ({ flexGrow: 1, minWidth: "45%", minHeight: TOQUE + 4, borderRadius: RAIO.campo, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.elevado, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                      <Text style={{ color: cores.texto, fontSize: FONTE.corpo, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{n === falta ? "Exato" : formatarMoeda(n)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Botao onPress={() => somar(forma, falta)}>{`${FORMAS_PDV[forma]} de ${formatarMoeda(falta)}`}</Botao>
              )}
              <Campo rotulo="Outro valor (R$)" value={valor} onChangeText={setValor} keyboardType="decimal-pad" onSubmitEditing={() => somar(forma, lerCentavos(valor))} />
              <Botao variante="secundario" onPress={() => somar(forma, lerCentavos(valor))}>Somar</Botao>
            </>
          )}
          {pagamentos.some((pg) => pg.forma !== "dinheiro") && (
            <>
              <Rotulo>Pix e cartão caem na conta</Rotulo>
              {bancos.length ? <Escolha rolar opcoes={bancos.map((c) => ({ valor: c.id, rotulo: c.nome }))} valor={pdv.conta || null} aoEscolher={pdv.setConta} /> : <Aviso tipo="alerta">Cadastre uma conta bancária no site para receber Pix e cartão.</Aviso>}
            </>
          )}
          {fechamento.erro && <Aviso tipo="perigo">{fechamento.erro}</Aviso>}
          {erro && <Aviso tipo="perigo">{erro}</Aviso>}
          <Botao onPress={() => void finalizar()} carregando={enviando} desativado={!fechamento.pronto || !pdv.online}>Finalizar venda</Botao>
          <Botao variante="fantasma" onPress={() => { setPagando(false); setPagamentos([]); setErro(null); }}>Voltar ao carrinho</Botao>
        </Cartao>
      </>
    );
  }

  return (
    <>
      {cabecalho}
      <Campo rotulo="Buscar produto" value={busca} onChangeText={setBusca} autoCorrect={false} />
      {!dados.produtos.length && <Aviso tipo="info">Nenhum produto de pescado ativo. Cadastre em Estoque, no site.</Aviso>}
      {caixa.grupos.map((g) => (
        <View key={g.embalagem} style={{ marginBottom: 12 }}>
          <Text style={{ color: cores.texto, fontSize: FONTE.corpo, fontWeight: "600", marginBottom: 8 }}>
            {g.titulo} <Text style={{ color: cores.textoSuave, fontWeight: "400", fontSize: FONTE.pequeno }}>{g.itens.length}</Text>
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {g.itens.map((i) => {
              const esgotado = i.resta !== null && i.resta <= 0;
              return (
                <Pressable key={i.id} accessibilityRole="button" accessibilityLabel={`Adicionar ${i.nome}`} onPress={() => mudar(i.id, i.quantidade + 1)}
                  style={({ pressed }) => ({
                    width: "48.5%", minHeight: 96, padding: 12, borderRadius: RAIO.campo, borderWidth: 1, justifyContent: "space-between",
                    borderColor: i.quantidade > 0 ? cores.marca : cores.borda, backgroundColor: i.quantidade > 0 ? cores.marcaSuave : cores.superficie,
                    opacity: esgotado && i.quantidade === 0 ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }],
                  })}>
                  <Text style={{ color: cores.texto, fontSize: FONTE.corpo, fontWeight: "500" }} numberOfLines={3}>{i.nome}</Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 }}>
                    <Text style={{ color: i.preco ? cores.texto : cores.perigo, fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                      {i.preco ? formatarMoeda(i.preco) : "sem preço"}
                      {i.preco && vendidoPorKg(i.fator_kg) ? <Text style={{ color: cores.textoSuave, fontSize: 12, fontWeight: "400" }}>/kg</Text> : null}
                    </Text>
                    {i.resta !== null && <Text style={{ color: esgotado ? cores.alerta : cores.textoSuave, fontSize: 12 }}>{esgotado ? "esgotado" : textoQuantidade(i.resta, i.fator_kg, i.unidade)}</Text>}
                  </View>
                  {i.quantidade > 0 && (
                    <View style={{ position: "absolute", top: -6, right: -6, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: cores.marca, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: cores.marcaTexto, fontSize: 12, fontWeight: "700" }}>{vendidoPorKg(i.fator_kg) ? textoQuantidade(i.quantidade, i.fator_kg, i.unidade) : i.quantidade}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <Cartao>
        {clienteETabela}
        {caixa.itens.length === 0 ? (
          <Texto suave>Toque nos produtos para adicionar.</Texto>
        ) : (
          caixa.itens.map((i) => (
            <View key={i.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: cores.linha }}>
              <View style={{ flex: 1 }}>
                <Texto style={{ fontWeight: "500" }}>{i.nome}</Texto>
                <Texto suave style={{ fontSize: 13 }}>{formatarMoeda(i.preco)}{vendidoPorKg(i.fator_kg) ? "/kg" : ""} · {formatarMoeda(Math.round(i.quantidade * i.preco))}</Texto>
              </View>
              <Contador valor={i.quantidade} max={i.max} rotulo={i.nome} casas={vendidoPorKg(i.fator_kg) ? 3 : 0} aoMudar={(n) => mudar(i.id, n)} />
            </View>
          ))
        )}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: 1, borderTopColor: cores.linha, paddingTop: 12, marginVertical: 8 }}>
          <Texto suave>Total</Texto>
          <Text style={{ color: cores.texto, fontSize: 30, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{formatarMoeda(caixa.total)}</Text>
        </View>
        {erro && <Aviso tipo="perigo">{erro}</Aviso>}
        <Botao onPress={receber} desativado={!caixa.itens.length}>Receber</Botao>
        {caixa.itens.length > 0 && <Botao variante="fantasma" onPress={novaVenda}>Cancelar venda</Botao>}
      </Cartao>
    </>
  );
}

function Quadro({ titulo, valor, fundo }: { titulo: string; valor: number; fundo: string }) {
  const { cores } = useTema();
  return (
    <View style={{ flex: 1, backgroundColor: fundo, borderRadius: RAIO.campo, padding: 10, alignItems: "center" }}>
      <Text style={{ color: cores.textoSuave, fontSize: 12 }}>{titulo}</Text>
      <Text style={{ color: cores.texto, fontSize: 22, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{formatarMoeda(valor)}</Text>
    </View>
  );
}
