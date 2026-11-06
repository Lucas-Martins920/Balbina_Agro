import Link from "next/link";
import { AcaoConfirmada } from "@/components/acao-confirmada";
import { FormAcao } from "@/components/form-acao";
import { Aviso, Campo, Cartao, LinkBotao, Segmentos, Selecao, Titulo, Vazio } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { openFinanceConfigurado } from "@/lib/open-finance";
import { createClient } from "@/lib/supabase/server";
import { condicaoDoLancamento } from "@/lib/regras";
import { GRUPOS_CATEGORIA } from "@/lib/titulos";
import { Rateio } from "@/components/rateio";
import { Abas, type Aba } from "./abas";
import { AcoesMovimento } from "./acoes-movimento";
import { CamposNovoLancamento, type ContatoConciliacao } from "./campos-novo";
import { nomeDaContraparte } from "@/lib/contraparte";
import { aplicarRegras, conciliarCerteiras, lancarPeloHistorico, conciliarComExistente, conciliarComTitulo, conciliarMultiplos, conciliarCriandoTitulo, conciliarTransferencia, ignorarMovimento, importarOfx } from "./actions";
import { ConectarBanco } from "./conectar-banco";
import { ImportarOfx } from "./importar-ofx";
import { SugestoesMultipla } from "./multipla";
import { Importacoes, type Importacao } from "./importacoes";
import { desconectarBanco, desligarConta, sincronizarAgora } from "./open-finance-actions";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { ordenado } from "@/lib/ordem";

type Sugestao = { agendamento_id: string; descricao: string; contato_nome: string | null; vencimento: string; saldo_cents: number; pontos: number };
type Palpite = { categoria_id: string | null; centro_custo_id: string | null; contato_id: string | null; origem: "historico" | "contato" };
type Conciliado = {
  id: string; data: string; descricao: string; valor_cents: number; status: string;
  conciliacoes: { modo: string; baixa_id: string | null; transferencia_id: string | null;
    baixas: { agendamentos: { descricao: string; origem: string } | null } | null;
    transferencias: { descricao: string | null } | null }[] | null;
};
// pagamento ou transferência desta conta lançado à mão antes do extrato (mesmo valor, até 5 dias)
type JaLancado = { tipo: "baixa" | "transferencia"; id: string; descricao: string; contato_nome: string | null; data: string; valor_cents: number };
type Pendente = {
  movimento_id: string; data: string; descricao: string; valor_cents: number; nome_contraparte: string | null;
  sugestoes: Sugestao[]; palpite: Palpite | null; transferencia: { conta_id: string; conta_nome: string } | null; certeira: string | null;
  ja_lancados: JaLancado[] | null;
};

const POR_PAGINA = 30;
const MODOS: Record<string, string> = { sugestao: "pela sugestão", lote: "em lote", regra: "por regra", manual: "manual", multipla: "múltipla" };

function quando(iso: string | null) {
  if (!iso) return "nunca";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

// as ações desta página (importar OFX, aplicar regras) aplicam as regras em partes por até ~40 s
export const maxDuration = 60;

export default async function PaginaConciliacao({ searchParams }: PageProps<"/conciliacao">) {
  await exigirAcesso("conciliacao");
  const filtros = await searchParams;
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();

  const [{ data: saldos }, { data: dadosContas }] = await Promise.all([
    supabase.from("saldos_contas").select("conta_id, nome, saldo_cents, tipo").eq("empresa_id", atual.id).eq("arquivada", false).neq("tipo", "cartao_credito").order("nome"),
    supabase.from("contas_financeiras").select("id, open_finance_item_id, saldo_banco_cents, saldo_banco_em, saldo_inicial_data").eq("empresa_id", atual.id),
  ]);
  const contas = (saldos ?? []).map((s) => ({ ...s, ...dadosContas?.find((d) => d.id === s.conta_id) }));
  const contaId = typeof filtros.conta === "string" && contas.some((c) => c.conta_id === filtros.conta) ? filtros.conta : contas[0]?.conta_id;
  const vendo = filtros.ver === "conciliados" ? "conciliados" : "pendentes";
  const configurado = openFinanceConfigurado();

  if (!contaId) {
    return (
      <div className="flex max-w-6xl flex-col gap-6">
        <Titulo>Conciliação</Titulo>
        <Cartao titulo="Comece conectando o banco">
          <div className="flex flex-col gap-3 text-sm">
            <p>Pelo Open Finance o extrato chega sozinho todo dia, e as contas do banco são criadas aqui automaticamente.</p>
            {configurado ? <ConectarBanco /> : <LinkBotao href="/conciliacao/bancos" tamanho="sm" className="self-start">Como ativar o Open Finance</LinkBotao>}
            <p className="flex flex-wrap items-center gap-2 text-texto-suave">Prefere cadastrar à mão? <LinkBotao href="/contas" tamanho="sm">Contas e saldos</LinkBotao> e importe o OFX.</p>
          </div>
        </Cartao>
      </div>
    );
  }

  const conta = contas.find((c) => c.conta_id === contaId)!;
  const [{ data: firmes }, contagens, { data: conexao }, painel, { data: dadosConciliados }, { data: categorias }, { data: centros }, { data: dadosContatos }, { master, pode }, { data: fatores }, { data: produtosEstoque }, { data: depositos }] = await Promise.all([
    vendo === "pendentes" ? supabase.rpc("palpites_firmes", { p_conta: contaId }) : Promise.resolve({ data: [] }),
    Promise.all(contas.map(async (c) => {
      const { count } = await supabase.from("movimentos_bancarios").select("id", { count: "exact", head: true }).eq("conta_id", c.conta_id).in("status", ["pendente", "parcial"])
        .gte("data", c.saldo_inicial_data ?? "0001-01-01"); // antes do saldo inicial não é para conciliar
      return [c.conta_id, count ?? 0] as const;
    })),
    conta.open_finance_item_id
      ? supabase.from("conexoes_bancarias").select("id, instituicao, status, erro, ultima_sincronizacao, item_id").eq("item_id", conta.open_finance_item_id).maybeSingle()
      : Promise.resolve({ data: null }),
    vendo === "pendentes" ? supabase.rpc("painel_conciliacao", { p_conta: contaId, p_limite: POR_PAGINA }) : Promise.resolve({ data: [] }),
    vendo === "conciliados"
      ? supabase.from("movimentos_bancarios")
        .select("id, data, descricao, valor_cents, status, conciliacoes(modo, baixa_id, transferencia_id, baixas(agendamentos(descricao, origem)), transferencias(descricao))")
        .eq("conta_id", contaId)
        .in("status", ["conciliado", "parcial", "ignorado"]).order("data", { ascending: false }).limit(POR_PAGINA)
      : Promise.resolve({ data: [] }),
    supabase.from("categorias").select("id, nome, grupo, sentido, parent_id, ordem").eq("empresa_id", atual.id).eq("ativa", true).order("ordem").order("nome").then(ordenado),
    supabase.from("centros_custo").select("id, nome, parent_id, ordem").eq("empresa_id", atual.id).eq("ativo", true).order("ordem").order("nome").then(ordenado),
    supabase.from("contatos").select("id, nome, produto_estoque_id").eq("empresa_id", atual.id).eq("arquivado", false).order("nome"),
    getPermissoes(),
    supabase.auth.mfa.listFactors(),
    vendo === "pendentes"
      ? supabase.from("produtos").select("id, nome, unidade").eq("empresa_id", atual.id).eq("ativo", true).order("nome")
      : Promise.resolve({ data: [] }),
    vendo === "pendentes"
      ? supabase.from("depositos").select("id, nome").eq("empresa_id", atual.id).order("nome")
      : Promise.resolve({ data: [] }),
  ]);
  const contatos = (dadosContatos ?? []) as ContatoConciliacao[];
  const { data: dadosImportacoes } = await supabase.from("importacoes_extrato")
    .select("id, origem, arquivo_path, periodo_inicio, periodo_fim, total_linhas, linhas_novas, linhas_repetidas, created_at, cancelada_em, motivo_cancelamento")
    .eq("conta_id", contaId).neq("origem", "open_finance").order("created_at", { ascending: false }).limit(8);
  const importacoes = (dadosImportacoes ?? []) as Importacao[];
  const temAutenticador = (fatores?.totp.length ?? 0) > 0;
  const conciliados = (dadosConciliados ?? []) as unknown as Conciliado[];
  // baixa ou transferência que veio de importação existia antes da conciliação e fica ao desconciliar
  const alvos = conciliados.flatMap((m) => (m.conciliacoes ?? []).map((c) => c.baixa_id ?? c.transferencia_id)).filter((x): x is string => Boolean(x));
  const { data: importados } = alvos.length
    ? await supabase.from("importacao_vinculos").select("registro_id").eq("empresa_id", atual.id).in("entidade", ["baixa", "transferencia"]).in("registro_id", alvos)
    : { data: [] };
  const veioDeImportacao = new Set((importados ?? []).map((v) => v.registro_id as string));
  const pendentesPorConta = new Map(contagens);
  const pendentes = pendentesPorConta.get(contaId) ?? 0;
  const lista = (painel.data ?? []) as Pendente[];
  const certeiras = lista.filter((m) => m.certeira).length;

  const pais = new Set((categorias ?? []).map((c) => c.parent_id).filter(Boolean));
  const folhas = (categorias ?? []).filter((c) => !pais.has(c.id));
  const opcoes = (sentido: string) => Object.entries(GRUPOS_CATEGORIA).flatMap(([g, nome]) =>
    folhas.filter((c) => c.grupo === g && c.sentido === sentido).map((c) => ({ id: c.id, nome: c.nome, grupo: nome })));
  const opcoesEntrada = opcoes("entrada");
  const opcoesSaida = opcoes("saida");
  const outrasContas = contas.filter((c) => c.conta_id !== contaId);
  const link = (p: Record<string, string>) => `/conciliacao?${new URLSearchParams({ conta: contaId, ...p })}`;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo descricao="Confira o que passou no banco e diga o que é cada lançamento. O que o sistema reconhece já vem pronto para confirmar."
        acoes={
          <div className="flex flex-wrap gap-2">
            <LinkBotao href="/conciliacao/bancos" tamanho="sm">Bancos conectados</LinkBotao>
            <LinkBotao href="/conciliacao/regras" tamanho="sm">Regras automáticas</LinkBotao>
          </div>
        }>
        Conciliação
      </Titulo>

      <nav aria-label="Conta" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {contas.map((c) => {
          const n = pendentesPorConta.get(c.conta_id) ?? 0;
          const diferenca = c.saldo_banco_cents != null ? Number(c.saldo_banco_cents) - Number(c.saldo_cents) : null;
          const atualC = c.conta_id === contaId;
          return (
            <Link key={c.conta_id} href={`/conciliacao?conta=${c.conta_id}`} aria-current={atualC ? "page" : undefined}
              className={`flex flex-col gap-1 rounded-lg border bg-superficie p-4 transition hover:border-texto-suave/40 ${atualC ? "border-marca ring-3 ring-marca/15" : "border-borda"}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{c.nome}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${n ? "bg-[var(--etiqueta-alerta)] text-[var(--etiqueta-alerta-texto)] font-medium" : "bg-elevado/70 text-texto-suave"}`}>
                  {n ? `${n} para conciliar` : "em dia"}
                </span>
              </span>
              <span className="text-sm tabular-nums">No sistema {formatarMoeda(c.saldo_cents)}</span>
              {diferenca != null && (
                <span className={`text-xs tabular-nums ${diferenca ? "text-perigo" : "text-texto-suave"}`}>
                  No banco {formatarMoeda(c.saldo_banco_cents)}{diferenca ? ` · diferença ${formatarMoeda(diferenca)}` : " · bate"}
                </span>
              )}
              <span className="text-xs text-texto-suave">{c.open_finance_item_id ? "Extrato automático (Open Finance)" : "Extrato por arquivo OFX"}</span>
            </Link>
          );
        })}
      </nav>

      {conexao ? (
        <div className="flex flex-wrap items-center justify-between gap-3 vidro rounded-2xl border border-borda px-4 py-3 text-sm">
          <span>
            <span className="font-medium">{conexao.instituicao}</span> pelo Open Finance · última leitura {quando(conexao.ultima_sincronizacao)}
            {conexao.status === "precisa_login" && <span className="block text-perigo">O banco pediu para renovar a autorização. Use “Renovar autorização” em Bancos conectados.</span>}
            {conexao.status === "erro" && conexao.erro && <span className="block text-perigo">Última leitura falhou: {conexao.erro}</span>}
          </span>
          <div className="flex flex-wrap items-start gap-2">
            <FormAcao acao={sincronizarAgora} botao="Buscar lançamentos agora" variante="secundario" className="items-end">
              <input type="hidden" name="conexao_id" value={conexao.id} />
            </FormAcao>
            <AcaoConfirmada acao={desligarConta} botao="Desconectar esta conta"
              pergunta={<>A conta <strong>{conta.nome}</strong> deixa de receber o extrato pelo Open Finance. O que já foi importado e conciliado continua. As outras contas de {conexao.instituicao} seguem conectadas.</>}>
              <input type="hidden" name="conta_id" value={contaId} />
            </AcaoConfirmada>
            <AcaoConfirmada acao={desconectarBanco} botao="Desconectar o banco" variante="perigo" confirmar="Desconectar e revogar"
              pergunta={<>Revoga a autorização de {conexao.instituicao} no Open Finance e para de importar em todas as contas deste banco. O extrato já importado e as conciliações continuam. Para voltar, conecte de novo.</>}>
              <input type="hidden" name="conexao_id" value={conexao.id} />
            </AcaoConfirmada>
          </div>
        </div>
      ) : (
        <Cartao>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium">Traga o extrato sem baixar arquivo</p>
              <p className="text-texto-suave">Conecte o banco pelo Open Finance: a autorização é feita no app do banco e os lançamentos chegam aqui todo dia.</p>
              {configurado ? <ConectarBanco /> : <LinkBotao href="/conciliacao/bancos" tamanho="sm" className="self-start">Como ativar o Open Finance</LinkBotao>}
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium">Ou importe um arquivo OFX</p>
              <ImportarOfx acao={importarOfx} contaId={contaId} contaNome={conta.nome} />
            </div>
          </div>
        </Cartao>
      )}

      {importacoes.length > 0 && (
        <Cartao titulo="Arquivos importados" descricao={pode("conciliacao.editar")
          ? "Leu o arquivo errado? Cancele a importação: o que ele trouxe e ainda está para conciliar sai do extrato. O que já foi conciliado fica."
          : "Leu o arquivo errado? Peça a quem concilia para cancelar a importação."}>
          <Importacoes lista={importacoes} podeCancelar={pode("conciliacao.editar")} />
        </Cartao>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentos
          rotulo="Situação"
          opcoes={[["pendentes", `Para conciliar (${pendentes})`], ["conciliados", "Conciliados e ignorados"]].map(([v, n]) => ({ href: link({ ver: v }), nome: n, ativo: vendo === v }))}
        />
        {vendo === "pendentes" && pendentes > 0 && (
          <div className="flex flex-wrap items-start gap-2">
            {certeiras > 0 && (
              <FormAcao acao={conciliarCerteiras} botao={`Conciliar ${certeiras} com sugestão certeira`}>
                <input type="hidden" name="conta_id" value={contaId} />
              </FormAcao>
            )}
            {(firmes?.length ?? 0) > 0 && (
              <FormAcao acao={lancarPeloHistorico} botao={`Lançar ${firmes!.length} como nas últimas vezes`} variante="secundario">
                <input type="hidden" name="conta_id" value={contaId} />
                <p className="max-w-xs text-xs text-texto-suave">Sem título em aberto e lançados sempre na mesma categoria nas últimas vezes.</p>
              </FormAcao>
            )}
            <FormAcao acao={aplicarRegras} botao="Aplicar regras" variante="secundario">
              <input type="hidden" name="conta_id" value={contaId} />
            </FormAcao>
          </div>
        )}
      </div>

      {vendo === "pendentes" && lista.length === 0 && (
        <Vazio>Tudo conciliado nesta conta.</Vazio>
      )}

      {vendo === "pendentes" && lista.length > 0 && (
        <ul className="flex flex-col gap-3">
          {lista.map((m) => {
            const entrada = Number(m.valor_cents) > 0;
            const palpite = m.palpite;
            const [melhor] = m.sugestoes;
            const transf = m.transferencia && outrasContas.some((c) => c.conta_id === m.transferencia!.conta_id) ? m.transferencia : null;

            const jaLancados = m.ja_lancados ?? [];
            const abas: Aba[] = [];
            if (jaLancados.length > 0) {
              abas.push({
                id: "ja_lancado", rotulo: "Já lançado",
                conteudo: (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-texto-suave">
                      {entrada ? "Este recebimento" : "Este pagamento"} parece já ter sido lançado nesta conta. Ligue o extrato a ele para não lançar em dobro.
                    </p>
                    {jaLancados.map((j, i) => (
                      <div key={`${j.tipo}_${j.id}`} className={`flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${i === 0 ? "border border-marca/40 bg-marca-suave/60" : "bg-elevado/60"}`}>
                        <span className="min-w-0">
                          <span className="font-medium">{j.descricao}</span>{j.contato_nome && <span className="text-texto-suave"> · {j.tipo === "transferencia" ? (entrada ? `de ${j.contato_nome}` : `para ${j.contato_nome}`) : j.contato_nome}</span>}
                          <span className="block text-xs text-texto-suave">
                            {j.tipo === "transferencia" ? "Transferência" : entrada ? "Recebido" : "Pago"} em {formatarData(j.data)} · {formatarMoeda(j.valor_cents)}
                          </span>
                        </span>
                        <FormAcao acao={conciliarComExistente} botao={i === 0 ? "É este: conciliar" : "Escolher este"} variante={i === 0 ? "primario" : "secundario"}>
                          <input type="hidden" name="movimento_id" value={m.movimento_id} />
                          <input type="hidden" name="tipo" value={j.tipo} />
                          <input type="hidden" name="id" value={j.id} />
                        </FormAcao>
                      </div>
                    ))}
                  </div>
                ),
              });
            }
            if (melhor) {
              abas.push({
                id: "sugestao", rotulo: m.sugestoes.length > 1 ? `Sugestões (${m.sugestoes.length})` : "Sugestão",
                conteudo: (
                  <SugestoesMultipla movimentoId={m.movimento_id} valorCents={Number(m.valor_cents)} entrada={entrada}
                    sugestoes={m.sugestoes} certeira={m.certeira} acaoConciliar={conciliarComTitulo} acaoMultipla={conciliarMultiplos} />
                ),
              });
            }
            abas.push({
              id: "novo", rotulo: entrada ? "Novo recebimento" : "Novo pagamento",
              conteudo: (
                <FormAcao acao={conciliarCriandoTitulo} botao={entrada ? "Lançar recebimento e conciliar" : "Lançar pagamento e conciliar"}>
                  <input type="hidden" name="movimento_id" value={m.movimento_id} />
                  {jaLancados.length > 0 && (
                    <Aviso tipo="alerta">
                      Já existe {jaLancados[0].tipo === "transferencia" ? "uma transferência" : entrada ? "um recebimento" : "um pagamento"} de {formatarMoeda(jaLancados[0].valor_cents)} em {formatarData(jaLancados[0].data)} nesta conta (“{jaLancados[0].descricao}”). Lançar de novo duplica: confira na aba “Já lançado”.
                    </Aviso>
                  )}
                  {palpite?.origem === "historico" && (
                    <p className="text-xs text-texto-suave">Preenchido como da última vez que este lançamento apareceu. Confira e confirme.</p>
                  )}
                  <CamposNovoLancamento movimentoId={m.movimento_id} entrada={entrada} descricao={m.descricao}
                    contatos={contatos} contatoInicial={palpite?.contato_id ?? ""}
                    nomeSugerido={nomeDaContraparte(m.descricao, m.nome_contraparte)} documentoSugerido={null}
                    produtos={produtosEstoque ?? []} depositos={depositos ?? []}>
                    <Rateio prefixo={`r_${m.movimento_id}`} total={Math.abs(Number(m.valor_cents))} rotuloCentro="Centro de custo (lote)"
                      categorias={entrada ? opcoesEntrada : opcoesSaida} centros={centros ?? []}
                      inicial={palpite ? [{ categoria_id: palpite.categoria_id, centro_custo_id: palpite.centro_custo_id }] : undefined} />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="lembrar" />
                      Fazer assim sozinho nas próximas vezes (cria uma regra; só com uma categoria)
                    </label>
                  </CamposNovoLancamento>
                </FormAcao>
              ),
            });
            if (outrasContas.length > 0) {
              abas.push({
                id: "transferencia", rotulo: "Transferência",
                conteudo: (
                  <FormAcao acao={conciliarTransferencia} botao="Conciliar transferência">
                    <input type="hidden" name="movimento_id" value={m.movimento_id} />
                    {transf && <p className="text-xs text-texto-suave">Achei {entrada ? "a saída" : "a entrada"} do mesmo valor em {transf.conta_nome}.</p>}
                    <Selecao rotulo={entrada ? "Veio da conta" : "Foi para a conta"} id={`o_${m.movimento_id}`} name="outra_conta_id" required defaultValue={transf?.conta_id ?? ""}>
                      <option value="" disabled>Escolha…</option>
                      {outrasContas.map((c) => <option key={c.conta_id} value={c.conta_id}>{c.nome}</option>)}
                    </Selecao>
                  </FormAcao>
                ),
              });
            }
            abas.push({
              id: "ignorar", rotulo: "Ignorar",
              conteudo: (
                <div className="flex flex-col gap-4">
                  <FormAcao acao={ignorarMovimento} botao="Ignorar este lançamento" variante="secundario">
                    <input type="hidden" name="movimento_id" value={m.movimento_id} />
                    <p className="text-sm text-texto-suave">Use para o que não deve entrar no financeiro, como aplicação e resgate automáticos (BB Rende Fácil), estorno que se anula ou lançamento duplicado do banco. Nada é apagado: ele fica em “Conciliados e ignorados” e pode voltar para conciliar.</p>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="lembrar" />
                      Ignorar sozinho nas próximas vezes nesta conta (cria uma regra)
                    </label>
                    <Campo rotulo="Quando a descrição contiver" id={`ig_${m.movimento_id}`} name="trecho" defaultValue={condicaoDoLancamento(m.descricao, null).valor}
                      ajuda="Deixe só a parte que se repete na aplicação e no resgate, ex.: RENDE FACIL." />
                  </FormAcao>
                  {master && (
                    <div className="flex flex-col items-start gap-2 border-t border-borda pt-3">
                      <p className="text-sm text-texto-suave">Lançamento que nem deveria estar no extrato? O master pode apagá-lo com o código do autenticador.</p>
                      <AcoesMovimento movimentoId={m.movimento_id} vinculo={null} master temAutenticador={temAutenticador} />
                    </div>
                  )}
                </div>
              ),
            });

            return (
              <li key={m.movimento_id} className="grid overflow-hidden vidro rounded-2xl border border-borda md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <div className="flex flex-col gap-1 border-b border-borda bg-elevado/40 p-4 md:border-b-0 md:border-r">
                  <span className="text-xs font-semibold uppercase tracking-wide text-texto-suave">No banco · {formatarData(m.data)}</span>
                  <span className="font-medium">{m.descricao}</span>
                  {m.nome_contraparte && <span className="text-sm text-texto-suave">{m.nome_contraparte}</span>}
                  <span className={`mt-1 text-xl font-semibold tabular-nums ${entrada ? "text-positivo" : "text-perigo"}`}>{formatarMoeda(m.valor_cents)}</span>
                </div>
                <div className="p-4">
                  <Abas abas={abas} inicial={jaLancados.length ? "ja_lancado" : melhor ? "sugestao" : transf ? "transferencia" : "novo"} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {vendo === "pendentes" && pendentes > lista.length && (
        <p className="text-xs text-texto-suave">Mostrando os {lista.length} mais antigos de {pendentes}. Concilie estes e os próximos aparecem.</p>
      )}

      {vendo === "conciliados" && (
        conciliados.length === 0 ? (
          <p className="text-sm text-texto-suave">Nada conciliado ainda.</p>
        ) : (
          <ul className="divide-y divide-borda vidro rounded-2xl border border-borda">
            {conciliados.map((m) => {
              const c = m.conciliacoes?.[0];
              const titulo = c?.baixas?.agendamentos;
              const vinculo = m.status === "ignorado"
                ? { tipo: "ignorado" as const, descricao: "", criadoAqui: false, importado: false }
                : c?.transferencia_id
                  ? { tipo: "transferencia" as const, descricao: c.transferencias?.descricao ?? "Transferência", criadoAqui: false, importado: veioDeImportacao.has(c.transferencia_id) }
                  : { tipo: "titulo" as const, descricao: titulo?.descricao ?? "título", criadoAqui: titulo?.origem === "conciliacao", importado: Boolean(c?.baixa_id && veioDeImportacao.has(c.baixa_id)) };
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="tabular-nums text-texto-suave">{formatarData(m.data)}</span> <span className="font-medium">{m.descricao}</span>
                    <span className="block text-xs text-texto-suave">
                      {m.status === "ignorado" ? "Ignorado" : `Conciliado ${MODOS[c?.modo ?? "manual"] ?? ""}`}
                      {vinculo.tipo === "titulo" && ` com “${vinculo.descricao}”${vinculo.criadoAqui ? " (criado na conciliação)" : ""}`}
                      {vinculo.tipo === "transferencia" && " como transferência entre contas"}
                      {vinculo.importado && " · veio da importação"}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-3">
                    <span className={`tabular-nums font-semibold ${Number(m.valor_cents) > 0 ? "text-positivo" : "text-perigo"}`}>{formatarMoeda(m.valor_cents)}</span>
                    <AcoesMovimento movimentoId={m.id} vinculo={vinculo} master={master} temAutenticador={temAutenticador} />
                  </span>
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
