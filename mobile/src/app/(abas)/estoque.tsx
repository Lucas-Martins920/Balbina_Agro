import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { AlertTriangle, ArrowDown, ArrowUp, Package, RotateCcw } from "lucide-react-native";
import { Aviso, Botao, CabecalhoSecao, Campo, Carregando, Cartao, Escolha, Fundo, Rotulo, Texto, Titulo } from "@/componentes/ui";
import { nomeEmpresa, useSessao, type Empresa } from "@/lib/sessao";
import { useEstoque } from "@/lib/estoque/use-estoque";
import type { ProdutoEstoque } from "@/lib/estoque/tipos";
import { ESP, FONTE, useTema } from "@/tema";
import { formatarData, hojeISO } from "@regras/formato.ts";

const TIPOS_LABEL: Record<string, string> = {
  entrada: "Entrada", saida: "Saída", ajuste: "Ajuste", producao_racao: "Produção de ração",
  consumo_lote: "Consumo no viveiro", consumo_producao: "Consumo na fábrica",
  entrada_compra: "Entrada de compra", perda: "Perda", transferencia: "Transferência",
};

export default function Estoque() {
  const { estado } = useSessao();
  if (estado.fase !== "pronto") return null;
  return <TelaEstoque key={estado.empresa.id} empresa={estado.empresa} />;
}

function TelaEstoque({ empresa }: { empresa: Empresa }) {
  const { cores } = useTema();
  const { dados, carregando, erro, recarregar, movimentar } = useEstoque(empresa.id);
  const [aba, setAba] = useState<"saldos" | "movimentar" | "historico">("saldos");
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => dados?.itens.filter((p) =>
    !busca || p.nome.toLowerCase().includes(busca.toLowerCase())
  ) ?? [], [dados, busca]);

  const abaixo = useMemo(() => dados?.itens.filter((p) => p.abaixo_minimo) ?? [], [dados]);

  return (
    <Fundo>
      <ScrollView
        contentContainerStyle={{ padding: ESP.lg, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={recarregar} tintColor={cores.marca} />}
      >
        <Titulo subtitulo={nomeEmpresa(empresa)}>Estoque</Titulo>

        <Escolha
          opcoes={[
            { valor: "saldos", rotulo: "Saldos" },
            ...(dados?.pode_editar ? [{ valor: "movimentar" as const, rotulo: "Lançar" }] : []),
            { valor: "historico", rotulo: "Histórico" },
          ]}
          valor={aba}
          aoEscolher={setAba}
        />

        {carregando && !dados ? (
          <Carregando />
        ) : erro ? (
          <Aviso tipo="alerta">{erro}</Aviso>
        ) : aba === "saldos" ? (
          <>
            {abaixo.length > 0 && (
              <>
                <CabecalhoSecao>Abaixo do mínimo</CabecalhoSecao>
                <Cartao atraso={0}>
                  {abaixo.map((p, i) => (
                    <LinhaProduto key={p.id} p={p} ultimo={i === abaixo.length - 1} alerta />
                  ))}
                </Cartao>
              </>
            )}
            <CabecalhoSecao>Todos os produtos</CabecalhoSecao>
            <Campo rotulo="Buscar produto" value={busca} onChangeText={setBusca} placeholder="Nome do produto" />
            {filtrados.length === 0 ? (
              <Texto suave>Nenhum produto encontrado.</Texto>
            ) : (
              <Cartao atraso={80}>
                {filtrados.map((p, i) => (
                  <LinhaProduto key={p.id} p={p} ultimo={i === filtrados.length - 1} />
                ))}
              </Cartao>
            )}
          </>
        ) : aba === "movimentar" ? (
          <FormMovimentar
            itens={dados?.itens ?? []}
            depositos={dados?.depositos ?? []}
            hoje={dados?.hoje ?? hojeISO(empresa.fuso)}
            empresaId={empresa.id}
            movimentar={movimentar}
          />
        ) : (
          <>
            <CabecalhoSecao>Últimos movimentos</CabecalhoSecao>
            {(dados?.movimentos ?? []).length === 0 ? (
              <Texto suave>Nenhum movimento recente.</Texto>
            ) : (
              <Cartao atraso={0}>
                {(dados?.movimentos ?? []).map((m, i) => (
                  <View key={m.id}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: ESP.sm, paddingVertical: ESP.sm }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: cores.elevado, alignItems: "center", justifyContent: "center" }}>
                        {m.tipo.includes("entrada") || m.tipo === "producao_racao" ? (
                          <ArrowDown size={14} color={cores.verde} strokeWidth={2} />
                        ) : m.tipo.includes("saida") || m.tipo.includes("consumo") || m.tipo === "perda" ? (
                          <ArrowUp size={14} color={cores.perigo} strokeWidth={2} />
                        ) : (
                          <RotateCcw size={14} color={cores.azul} strokeWidth={2} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Texto style={{ fontWeight: "500", fontSize: FONTE.pequeno }}>{m.produto}</Texto>
                        <Texto suave style={{ fontSize: FONTE.micro }}>
                          {TIPOS_LABEL[m.tipo] ?? m.tipo} · {formatarData(m.data)}{m.quantidade ? ` · ${m.quantidade}` : ""}{m.lote ? ` · ${m.lote}` : ""}
                        </Texto>
                      </View>
                    </View>
                    {i < (dados?.movimentos ?? []).length - 1 && <View style={{ height: 1, backgroundColor: cores.linha, marginLeft: 36 }} />}
                  </View>
                ))}
              </Cartao>
            )}
          </>
        )}
      </ScrollView>
    </Fundo>
  );
}

function LinhaProduto({ p, ultimo, alerta }: { p: ProdutoEstoque; ultimo?: boolean; alerta?: boolean }) {
  const { cores } = useTema();
  const unidade = p.unidade || (p.base_estoque === "kg" ? "kg" : "un");
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: ESP.md, paddingVertical: ESP.sm }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: alerta ? cores.etiquetaAlerta : cores.elevado, alignItems: "center", justifyContent: "center" }}>
          {alerta ? <AlertTriangle size={16} color={cores.etiquetaAlertaTexto} strokeWidth={2} /> : <Package size={16} color={cores.textoSuave} strokeWidth={1.75} />}
        </View>
        <View style={{ flex: 1 }}>
          <Texto style={{ fontWeight: "500" }}>{p.nome}</Texto>
          {p.estoque_minimo !== null && (
            <Texto suave style={{ fontSize: FONTE.micro }}>Mínimo: {p.estoque_minimo} {unidade}</Texto>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Texto style={{ fontWeight: "700", fontSize: FONTE.corpo, fontVariant: ["tabular-nums"], color: alerta ? cores.perigo : cores.texto }}>
            {p.saldo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
          </Texto>
          <Texto suave style={{ fontSize: FONTE.micro }}>{unidade}</Texto>
        </View>
      </View>
      {!ultimo && <View style={{ height: 1, backgroundColor: cores.linha, marginLeft: 44 }} />}
    </>
  );
}

function FormMovimentar({
  itens, depositos, hoje, empresaId, movimentar,
}: {
  itens: ProdutoEstoque[];
  depositos: { id: string; nome: string }[];
  hoje: string;
  empresaId: string;
  movimentar: (corpo: any) => Promise<{ ok: boolean; diferenca: number }>;
}) {
  const [produtoId, setProdutoId] = useState("");
  const [operacao, setOperacao] = useState<"entrada" | "saida" | "ajuste">("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const produto = itens.find((p) => p.id === produtoId);

  async function enviar() {
    setErro(null);
    setSucesso(null);
    const qtd = Number(quantidade.replace(",", "."));
    if (!produtoId) return setErro("Escolha o produto.");
    if (!Number.isFinite(qtd) || qtd < 0 || (qtd === 0 && operacao !== "ajuste")) return setErro("Quantidade inválida.");

    setEnviando(true);
    try {
      const r = await movimentar({
        empresa_id: empresaId,
        produto_id: produtoId,
        operacao,
        quantidade: qtd,
        data: hoje,
        observacao: observacao || null,
      });
      const dif = Math.abs(r.diferenca);
      setSucesso(operacao === "ajuste" && r.diferenca === 0 ? "Contagem bate; nada lançado." : `${operacao === "entrada" ? "Entrada" : operacao === "saida" ? "Saída" : "Ajuste"} de ${dif} lançada.`);
      setQuantidade("");
      setObservacao("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao movimentar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Cartao>
      <Rotulo>Produto</Rotulo>
      <Escolha
        rolar
        opcoes={itens.map((p) => ({ valor: p.id, rotulo: p.nome }))}
        valor={produtoId || null}
        aoEscolher={setProdutoId}
      />

      {produto && (
        <Texto suave style={{ fontSize: FONTE.pequeno, marginBottom: ESP.sm }}>
          Saldo atual: {produto.saldo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {produto.unidade || "un"}
        </Texto>
      )}

      <Rotulo>Operação</Rotulo>
      <Escolha
        opcoes={[
          { valor: "entrada", rotulo: "Entrada" },
          { valor: "saida", rotulo: "Saída" },
          { valor: "ajuste", rotulo: "Ajuste de contagem" },
        ]}
        valor={operacao}
        aoEscolher={setOperacao}
      />

      <Campo
        rotulo={operacao === "ajuste" ? "Contagem real" : "Quantidade"}
        value={quantidade}
        onChangeText={setQuantidade}
        keyboardType="decimal-pad"
        placeholder="0"
      />
      <Campo rotulo="Observação (opcional)" value={observacao} onChangeText={setObservacao} maxLength={200} />

      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {sucesso && <Aviso tipo="positivo">{sucesso}</Aviso>}

      <Botao onPress={enviar} carregando={enviando} desativado={!produtoId}>
        {operacao === "entrada" ? "Registrar entrada" : operacao === "saida" ? "Registrar saída" : "Ajustar contagem"}
      </Botao>
    </Cartao>
  );
}
