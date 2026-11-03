import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./index.css";
import { ProductionActions } from "./components/ProductionActions";
import { apiFetch, clearToken, hasToken, login } from "./api/client";
import {
  daysLabel,
  formatDate,
  formatMoney,
  formatNumber,
  todayISO,
} from "./lib/format";

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
};

type Balance = {
  saldo: number;
  entradas: number;
  saidas: number;
};

type MovimentoCaixa = {
  id: string;
  tipo: "entrada" | "saida";
  valor: number;
  descricao: string | null;
  dataMovimento: string;
};

type Lote = {
  id: string;
  especie: string;
  tanque_id: string;
  data_inicio: string;
  estoque_inicial: number;
  unidade?: string;
  status?: string;
  kg_colhidos?: number | null;
  custo_total?: number | null;
  custo_por_kg?: number | null;
  kg_vendidos?: number | null;
};

type SyncSummary = {
  pending: number;
  synced: number;
  error: number;
};

type Estoque = {
  item: string;
  categoria: string;
  unidade: string;
  saldo: number;
};

type ContaAlerta = {
  id: string;
  descricao: string;
  fornecedor?: string;
  valor: number;
  vencimento: string;
  dias_restantes: number;
};

type Conta = {
  id: string;
  descricao: string;
  fornecedor?: string | null;
  valor: number;
  vencimento: string;
  status: "aberta" | "paga";
  pago_em?: string | null;
};

type FormMode = "fechar" | "venda" | "estoque" | "conta" | "caixa" | null;

type Section = "producao" | "caixa" | "contas";

type Toast = { id: number; kind: "success" | "error"; text: string };

const FORM_TITLES: Record<Exclude<FormMode, null>, string> = {
  fechar: "Fechar lote",
  venda: "Registrar venda",
  estoque: "Movimentar estoque",
  conta: "Nova conta a pagar",
  caixa: "Novo lançamento no caixa",
};

const SECTION_TITLES: Record<Section, string> = {
  producao: "Visão geral",
  caixa: "Caixa",
  contas: "Contas a pagar",
};

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(hasToken);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [activeSection, setActiveSection] = useState<Section>("producao");

  const [balance, setBalance] = useState<Balance | null>(null);
  const [movimentosCaixa, setMovimentosCaixa] = useState<MovimentoCaixa[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [estoque, setEstoque] = useState<Estoque[]>([]);
  const [alertas, setAlertas] = useState<ContaAlerta[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [payingAccountId, setPayingAccountId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [backendOnline, setBackendOnline] = useState(true);
  const [sync, setSync] = useState<SyncSummary>({ pending: 0, synced: 0, error: 0 });
  const [toasts, setToasts] = useState<Toast[]>([]);

  const nextId = useRef(2);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      text: "Olá! Posso abrir lotes, registrar insumos ou consultar o caixa.",
    },
  ]);

  const notify = useCallback((kind: Toast["kind"], text: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, kind, text }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      4500
    );
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => setAuthenticated(false);
    window.addEventListener("balbina-auth-expired", handleAuthExpired);
    return () => window.removeEventListener("balbina-auth-expired", handleAuthExpired);
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const [b, m, l, e, a, c, s] = await Promise.all([
        apiFetch("/api/caixa/saldo"),
        apiFetch("/api/caixa/movimentos"),
        apiFetch("/api/lotes"),
        apiFetch("/api/estoque"),
        apiFetch("/api/contas-pagar/alertas"),
        apiFetch("/api/contas-pagar"),
        apiFetch("/api/sync/summary"),
      ]);

      if (b.ok) setBalance(await b.json());
      if (m.ok) setMovimentosCaixa(await m.json());
      if (l.ok) setLotes(await l.json());
      if (e.ok) setEstoque(await e.json());
      if (a.ok) setAlertas(await a.json());
      if (c.ok) setContas(await c.json());
      if (s.ok) {
        const summary = await s.json();
        setSync({
          pending: Number(summary.pending ?? 0),
          synced: Number(summary.synced ?? 0),
          error: Number(summary.error ?? 0),
        });
      }
      setBackendOnline(true);
    } catch {
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    const first = window.setTimeout(loadDashboard, 0);
    const interval = window.setInterval(loadDashboard, 5000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [authenticated, loadDashboard]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    try {
      await login(username.trim(), password);
      setAuthenticated(true);
      setPassword("");
    } catch (error) {
      setLoginError(
        error instanceof Error && error.message !== "Failed to fetch"
          ? error.message
          : "Não foi possível conectar ao servidor."
      );
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    clearToken();
    setAuthenticated(false);
  }

  function addAssistantMessage(text: string) {
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "assistant", text },
    ]);
  }

  async function payAccount(conta: Conta) {
    if (!window.confirm(`Marcar "${conta.descricao}" (${formatMoney(conta.valor)}) como paga?`)) {
      return;
    }

    setPayingAccountId(conta.id);
    try {
      const response = await apiFetch(`/api/contas-pagar/${conta.id}/pagar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await readJson(response);

      if (response.ok) {
        notify("success", "Conta marcada como paga.");
        await loadDashboard();
      } else {
        notify("error", String(result.error || "Não foi possível marcar a conta como paga."));
      }
    } catch {
      notify("error", "Não foi possível conectar ao servidor.");
    } finally {
      setPayingAccountId(null);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || loading) return;

    setMessages((current) => [...current, { id: nextId.current++, role: "user", text }]);
    setMessage("");
    setLoading(true);

    const normalized = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

    try {
      const isLote = /\b(abr[ei]r?|novo|criar|crie|cadastrar)\b.*\blote\b/.test(normalized);
      const isInsumo =
        !isLote && /\b(racao|alevinos?|medicamento|insumo|compra|comprei)\b/.test(normalized);
      const isSaldo = !isLote && !isInsumo && /\b(saldo|caixa)\b/.test(normalized);

      if (isSaldo) {
        const response = await apiFetch("/api/caixa/saldo");
        const result = await readJson(response);
        addAssistantMessage(
          response.ok
            ? `O saldo atual do caixa é ${formatMoney(Number(result.saldo))}.`
            : "Não foi possível consultar o caixa."
        );
        return;
      }

      if (!isInsumo && !isLote) {
        addAssistantMessage(
          'Posso ajudar com: "abrir lote L-01 com 500 alevinos de tambaqui no tanque TQ-1", "comprei 50 kg de ração a R$ 4,50 para o tanque TQ-1" ou "qual o saldo do caixa?".'
        );
        return;
      }

      const response = await apiFetch(isLote ? "/api/abrir-lote" : "/api/lancar-insumo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const result = await readJson(response);

      addAssistantMessage(
        response.ok
          ? isInsumo
            ? `Insumo registrado: ${result.insumoId ?? "OK"}.`
            : `Lote ${result.loteId ?? ""} aberto com sucesso.`
          : String(result.error || "Não foi possível processar a operação.")
      );

      if (response.ok) await loadDashboard();
    } catch {
      addAssistantMessage("Servidor indisponível no momento. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function openForm(mode: FormMode) {
    setFormError("");
    setFormMode(mode);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formMode || submitting) return;

    const form = new FormData(event.currentTarget);
    const get = (key: string) => String(form.get(key) ?? "").trim();
    const num = (key: string) => Number(get(key).replace(",", "."));

    let endpoint = "";
    let body: Record<string, unknown> = {};

    switch (formMode) {
      case "fechar":
        endpoint = `/api/lotes/${encodeURIComponent(get("loteId"))}/fechar`;
        body = { kgColhidos: num("kgColhidos"), dataFechamento: get("dataFechamento") };
        break;
      case "venda":
        endpoint = "/api/vendas";
        body = {
          loteId: get("loteId"),
          dataVenda: get("dataVenda"),
          kgVendidos: num("kgVendidos"),
          valorTotal: num("valorTotal"),
          comprador: get("comprador") || null,
        };
        break;
      case "estoque":
        endpoint = "/api/estoque/movimentos";
        body = {
          item: get("item"),
          categoria: get("categoria"),
          quantidade: num("quantidade"),
          unidade: get("unidade"),
          tipoMovimento: get("tipoMovimento"),
          dataMovimento: get("dataMovimento"),
        };
        break;
      case "conta":
        endpoint = "/api/contas-pagar";
        body = {
          descricao: get("descricao"),
          fornecedor: get("fornecedor") || null,
          valor: num("valor"),
          vencimento: get("vencimento"),
        };
        break;
      case "caixa":
        endpoint = "/api/caixa/movimento";
        body = {
          tipo: get("tipo"),
          valor: num("valor"),
          descricao: get("descricao"),
          dataMovimento: get("dataMovimento"),
          loteId: get("loteId") || null,
        };
        break;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await readJson(response);

      if (!response.ok) {
        setFormError(String(result.error || "Não foi possível concluir."));
        return;
      }

      if (formMode === "fechar" && typeof result.custoPorKg === "number") {
        notify(
          "success",
          `Lote fechado. Custo: ${formatMoney(Number(result.custoTotal))} (${formatMoney(result.custoPorKg)}/kg).`
        );
      } else {
        notify("success", `${FORM_TITLES[formMode]}: registrado com sucesso.`);
      }
      setFormMode(null);
      await loadDashboard();
    } catch {
      setFormError("Não foi possível conectar ao servidor.");
    } finally {
      setSubmitting(false);
    }
  }

  const lotesAtivos = lotes.filter((lote) => (lote.status ?? "ativo") === "ativo");
  const lotesFechados = lotes.filter((lote) => lote.status === "fechado");
  const lotesComPeixe = lotesFechados.filter(
    (lote) => Number(lote.kg_colhidos ?? 0) - Number(lote.kg_vendidos ?? 0) > 0
  );
  const contasAbertas = contas.filter((conta) => conta.status === "aberta");
  const totalAberto = contasAbertas.reduce((sum, conta) => sum + Number(conta.valor), 0);

  const statusLabel = !backendOnline
    ? "Servidor offline"
    : sync.error > 0
      ? `${sync.error} erro(s) de sync`
      : sync.pending > 0
        ? `${sync.pending} aguardando envio`
        : "Sincronizado";
  const statusClass = !backendOnline || sync.error > 0 ? "offline" : sync.pending > 0 ? "pending" : "online";

  if (!authenticated) {
    return (
      <main className="login-screen">
        <section className="panel login-panel">
          <div className="brand brand-light">
            <span className="brand-mark">BA</span>
            <span>Balbina Agro</span>
          </div>
          <h1>Acesso ao sistema</h1>
          <p>Entre para acompanhar a operação da sua propriedade.</p>
          <form className="operation-fields" onSubmit={handleLogin}>
            <label>
              Usuário
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                required
              />
            </label>
            <label>
              Senha
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {loginError && <p className="form-error" role="alert">{loginError}</p>}
            <button type="submit" disabled={loginLoading}>
              {loginLoading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const today = todayISO();
  const kgParaVender = lotesComPeixe.reduce(
    (sum, lote) => sum + Number(lote.kg_colhidos ?? 0) - Number(lote.kg_vendidos ?? 0),
    0
  );
  // A frase do topo mostra o que mais precisa de atenção agora.
  const finding = alertas[0]
    ? `${alertas[0].descricao} ${daysLabel(alertas[0].dias_restantes)} · ${formatMoney(alertas[0].valor)}`
    : kgParaVender > 0
      ? `${formatNumber(kgParaVender)} kg de peixe prontos para vender`
      : lotesAtivos.length > 0
        ? `${lotesAtivos.length} lote(s) em engorda`
        : "";

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">BA</span>
          <span>Balbina Agro</span>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          {([
            ["producao", "Visão geral", "Lotes e estoque"],
            ["caixa", "Caixa", "Entradas e saídas"],
            ["contas", "Contas", "Vencimentos"],
          ] as const).map(([section, label, description]) => (
            <button
              className={activeSection === section ? "active" : ""}
              key={section}
              type="button"
              onClick={() => setActiveSection(section)}
              aria-current={activeSection === section ? "page" : undefined}
            >
              <strong>
                {label}
                {section === "contas" && alertas.length > 0 && (
                  <span className="nav-badge" aria-label={`${alertas.length} alertas`}>
                    {alertas.length}
                  </span>
                )}
              </strong>
              <small>{description}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          Funciona sem internet: os dados ficam no aparelho e são enviados ao
          servidor quando a conexão volta.
        </div>
      </aside>

      <div className="workspace">
        <header className="header">
          <div>
            <h1>{SECTION_TITLES[activeSection]}</h1>
            {activeSection === "producao" && finding && (
              <p className={`finding ${alertas.length > 0 ? "warn" : ""}`}>{finding}</p>
            )}
          </div>

          <div className="header-actions">
            <span className={`status ${statusClass}`} role="status">
              <span className="status-dot" aria-hidden="true" /> {statusLabel}
            </span>
            <button className="ghost-button" type="button" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </header>

        {activeSection === "producao" && (
          <>
            <section className="kpi-grid">
              <article className="balance-card">
                <span className="label">SALDO DO CAIXA</span>
                <strong className={balance && balance.saldo < 0 ? "negative" : ""}>
                  {formatMoney(balance?.saldo)}
                </strong>
                <div className="balance-details">
                  <span>Entradas {formatMoney(balance?.entradas)}</span>
                  <span>Saídas {formatMoney(balance?.saidas)}</span>
                </div>
              </article>
              <article className="kpi">
                <span className="label">LOTES ATIVOS</span>
                <strong>{lotesAtivos.length}</strong>
                <small>
                  {formatNumber(lotesAtivos.reduce((sum, lote) => sum + lote.estoque_inicial, 0))} peixes na água
                </small>
              </article>
              <article
                className={`kpi kpi-clickable ${alertas.length > 0 ? "kpi-warning" : ""}`}
                onClick={() => setActiveSection("contas")}
              >
                <span className="label">CONTAS EM ABERTO</span>
                <strong>{formatMoney(totalAberto)}</strong>
                <small>
                  {alertas.length > 0
                    ? `${alertas.length} vencendo em até 7 dias`
                    : `${contasAbertas.length} conta(s) em aberto`}
                </small>
              </article>
            </section>

            <ProductionActions
              onCloseLot={() => openForm("fechar")}
              onRegisterSale={() => openForm("venda")}
              onMoveStock={() => openForm("estoque")}
              onNewPayable={() => openForm("conta")}
              canClose={lotesAtivos.length > 0}
              canSell={lotesComPeixe.length > 0}
            />

            <section className="two-columns">
              <article className="panel">
                <h2>Lotes</h2>
                {lotes.length === 0 ? (
                  <div className="empty-state">
                    <h3>Nenhum lote cadastrado</h3>
                    <p>Abra o chat e escreva, por exemplo: "abrir lote L-01 com 500 alevinos de tambaqui no tanque TQ-1".</p>
                    <button type="button" onClick={() => setChatOpen(true)}>Abrir chat</button>
                  </div>
                ) : (
                  <div className="lot-list">
                    {[...lotesAtivos, ...lotesFechados].map((lote) => {
                      const fechado = lote.status === "fechado";
                      const restante = Number(lote.kg_colhidos ?? 0) - Number(lote.kg_vendidos ?? 0);
                      return (
                        <div className={`lot-item ${fechado ? "closed" : ""}`} key={lote.id}>
                          <div className="lot-title">
                            <strong>{lote.id}</strong>
                            <span className={`pill ${fechado ? "pill-muted" : "pill-ok"}`}>
                              {fechado ? "Fechado" : "Ativo"}
                            </span>
                          </div>
                          <span>
                            {lote.especie} · Tanque {lote.tanque_id}
                          </span>
                          <small>
                            {fechado
                              ? `${formatNumber(lote.kg_colhidos)} kg colhidos · ${formatMoney(lote.custo_por_kg)}/kg · ${formatNumber(restante)} kg para vender`
                              : `${formatNumber(lote.estoque_inicial)} ${lote.unidade || "peixes"} desde ${formatDate(lote.data_inicio)}`}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>

              <article className="panel">
                <h2>Estoque</h2>
                {estoque.length === 0 ? (
                  <div className="empty-state">
                    <h3>Estoque vazio</h3>
                    <p>O peixe entra no estoque ao fechar um lote. Ração pode ser lançada em "Movimentar estoque".</p>
                  </div>
                ) : (
                  <div className="stock-list">
                    {estoque.map((item) => (
                      <div className="stock-item" key={`${item.categoria}-${item.item}-${item.unidade}`}>
                        <span className={`pill ${item.categoria === "peixe" ? "pill-blue" : "pill-ok"}`}>
                          {item.categoria === "peixe" ? "Peixe" : "Ração"}
                        </span>
                        <strong>{item.item}</strong>
                        <span className="stock-qty">
                          {formatNumber(item.saldo)} {item.unidade}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>
          </>
        )}

        {activeSection === "caixa" && (
          <>
            <section className="two-columns">
              <article className="balance-card">
                <span className="label">SALDO DO CAIXA</span>
                <strong className={balance && balance.saldo < 0 ? "negative" : ""}>
                  {formatMoney(balance?.saldo)}
                </strong>
                <div className="balance-details">
                  <span>Entradas: {formatMoney(balance?.entradas)}</span>
                  <span>Saídas: {formatMoney(balance?.saidas)}</span>
                </div>
              </article>
              <section className="panel">
                <h2>Sincronização</h2>
                <p>
                  <strong>{statusLabel}</strong>
                  <br />
                  {sync.synced} enviada(s) · {sync.pending} aguardando · {sync.error} com erro
                </p>
              </section>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Entradas e saídas</h2>
                </div>
                <button type="button" onClick={() => openForm("caixa")}>
                  Novo lançamento
                </button>
              </div>
              {movimentosCaixa.length === 0 ? (
                <p>Nenhum lançamento registrado.</p>
              ) : (
                <div className="cash-list">
                  {movimentosCaixa.map((movimento) => (
                    <div className="cash-item" key={movimento.id}>
                      <span className={`cash-type ${movimento.tipo}`}>
                        {movimento.tipo === "entrada" ? "Entrada" : "Saída"}
                      </span>
                      <div>
                        <strong>{movimento.descricao || "Movimentação"}</strong>
                        <small>{formatDate(movimento.dataMovimento)}</small>
                      </div>
                      <strong className={`cash-value ${movimento.tipo}`}>
                        {movimento.tipo === "entrada" ? "+" : "−"} {formatMoney(movimento.valor)}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeSection === "contas" && (
          <>
            {alertas.length > 0 && (
              <section className="panel alert-panel" role="alert">
                <h2>Vencendo em até 7 dias</h2>
                {alertas.map((conta) => (
                  <p key={conta.id}>
                    <strong>{conta.descricao}</strong> · {formatMoney(conta.valor)} ·{" "}
                    {daysLabel(conta.dias_restantes)}
                  </p>
                ))}
              </section>
            )}

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{contas.length === 0 ? "Nenhuma conta registrada" : `${formatMoney(totalAberto)} em aberto`}</h2>
                </div>
                <button type="button" onClick={() => openForm("conta")}>
                  Nova conta
                </button>
              </div>

              {contas.length === 0 ? (
                <p>Registre uma conta para acompanhar vencimentos e pagamentos.</p>
              ) : (
                <div className="accounts-list">
                  {contas.map((conta) => (
                    <div className={`account-item ${conta.status}`} key={conta.id}>
                      <div>
                        <strong>{conta.descricao}</strong>
                        <small>
                          {conta.fornecedor || "Sem fornecedor"} · vence em {formatDate(conta.vencimento)}
                        </small>
                      </div>
                      <strong>{formatMoney(conta.valor)}</strong>
                      {conta.status === "aberta" ? (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => payAccount(conta)}
                          disabled={payingAccountId === conta.id}
                        >
                          {payingAccountId === conta.id ? "Salvando..." : "Marcar como paga"}
                        </button>
                      ) : (
                        <span className="pill pill-ok">Paga {conta.pago_em ? formatDate(conta.pago_em) : ""}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {chatOpen && (
        <section className="chat panel chat-floating" aria-label="Chat operacional">
          <div className="panel-heading">
            <div>
              <h2>Chat operacional</h2>
            </div>
            <button type="button" className="ghost-button" onClick={() => setChatOpen(false)} aria-label="Fechar chat">
              <CloseIcon />
            </button>
          </div>

          <div className="messages" aria-live="polite">
            {messages.map((item) => (
              <div key={item.id} className={`message ${item.role}`}>
                {item.text}
              </div>
            ))}
            {loading && <div className="message assistant typing">Processando…</div>}
          </div>

          <form onSubmit={sendMessage} className="composer">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Ex.: qual o saldo do caixa?"
              rows={2}
            />
            <button type="submit" disabled={loading || !message.trim()}>
              Enviar
            </button>
          </form>
        </section>
      )}

      <button
        className="chat-toggle"
        type="button"
        onClick={() => setChatOpen((open) => !open)}
        aria-expanded={chatOpen}
      >
        {chatOpen ? "Fechar chat" : "Chat"}
      </button>

      {formMode && (
        <div className="modal-backdrop" onClick={() => !submitting && setFormMode(null)}>
          <section
            className="panel modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.key === "Escape" && !submitting && setFormMode(null)}
          >
            <div className="panel-heading">
              <h2 id="form-title">{FORM_TITLES[formMode]}</h2>
              <button type="button" className="ghost-button" onClick={() => setFormMode(null)} aria-label="Fechar">
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={submitForm} className="operation-fields" key={formMode}>
              {formMode === "fechar" && (
                <>
                  <label>
                    Lote
                    <select name="loteId" required defaultValue={lotesAtivos[0]?.id}>
                      {lotesAtivos.map((lote) => (
                        <option key={lote.id} value={lote.id}>
                          {lote.id} · {lote.especie} · Tanque {lote.tanque_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="field-row">
                    <label>
                      Kg colhidos
                      <input name="kgColhidos" type="number" inputMode="decimal" step="0.01" min="0.01" required autoFocus />
                    </label>
                    <label>
                      Data do fechamento
                      <input name="dataFechamento" type="date" defaultValue={today} required />
                    </label>
                  </div>
                  <p className="hint">O custo do lote é a soma das saídas de caixa ligadas a ele.</p>
                </>
              )}

              {formMode === "venda" && (
                <>
                  <label>
                    Lote
                    <select name="loteId" required defaultValue={lotesComPeixe[0]?.id}>
                      {lotesComPeixe.map((lote) => (
                        <option key={lote.id} value={lote.id}>
                          {lote.id} · {formatNumber(Number(lote.kg_colhidos ?? 0) - Number(lote.kg_vendidos ?? 0))} kg disponíveis
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="field-row">
                    <label>
                      Kg vendidos
                      <input name="kgVendidos" type="number" inputMode="decimal" step="0.01" min="0.01" required autoFocus />
                    </label>
                    <label>
                      Valor total (R$)
                      <input name="valorTotal" type="number" inputMode="decimal" step="0.01" min="0.01" required />
                    </label>
                  </div>
                  <div className="field-row">
                    <label>
                      Data da venda
                      <input name="dataVenda" type="date" defaultValue={today} required />
                    </label>
                    <label>
                      Comprador (opcional)
                      <input name="comprador" />
                    </label>
                  </div>
                </>
              )}

              {formMode === "estoque" && (
                <>
                  <div className="field-row">
                    <label>
                      Tipo
                      <select name="tipoMovimento" defaultValue="entrada">
                        <option value="entrada">Entrada</option>
                        <option value="saida">Saída</option>
                      </select>
                    </label>
                    <label>
                      Categoria
                      <select name="categoria" defaultValue="racao">
                        <option value="racao">Ração</option>
                        <option value="peixe">Peixe</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Item
                    <input name="item" placeholder="Ex.: ração 32% proteína" list="itens-estoque" required autoFocus />
                    <datalist id="itens-estoque">
                      {estoque.map((item) => (
                        <option key={`${item.categoria}-${item.item}`} value={item.item} />
                      ))}
                    </datalist>
                  </label>
                  <div className="field-row">
                    <label>
                      Quantidade
                      <input name="quantidade" type="number" inputMode="decimal" step="0.01" min="0.01" required />
                    </label>
                    <label>
                      Unidade
                      <input name="unidade" defaultValue="kg" required />
                    </label>
                  </div>
                  <label>
                    Data
                    <input name="dataMovimento" type="date" defaultValue={today} required />
                  </label>
                </>
              )}

              {formMode === "conta" && (
                <>
                  <label>
                    Descrição
                    <input name="descricao" placeholder="Ex.: energia do aerador" required autoFocus />
                  </label>
                  <label>
                    Fornecedor (opcional)
                    <input name="fornecedor" />
                  </label>
                  <div className="field-row">
                    <label>
                      Valor (R$)
                      <input name="valor" type="number" inputMode="decimal" step="0.01" min="0.01" required />
                    </label>
                    <label>
                      Vencimento
                      <input name="vencimento" type="date" defaultValue={today} required />
                    </label>
                  </div>
                </>
              )}

              {formMode === "caixa" && (
                <>
                  <div className="field-row">
                    <label>
                      Tipo
                      <select name="tipo" defaultValue="saida">
                        <option value="entrada">Entrada</option>
                        <option value="saida">Saída</option>
                      </select>
                    </label>
                    <label>
                      Valor (R$)
                      <input name="valor" type="number" inputMode="decimal" step="0.01" min="0.01" required autoFocus />
                    </label>
                  </div>
                  <label>
                    Descrição
                    <input name="descricao" placeholder="Ex.: compra de ração, venda avulsa..." required />
                  </label>
                  <div className="field-row">
                    <label>
                      Data
                      <input name="dataMovimento" type="date" defaultValue={today} required />
                    </label>
                    <label>
                      Lote (entra no custo)
                      <select name="loteId" defaultValue="">
                        <option value="">Nenhum</option>
                        {lotesAtivos.map((lote) => (
                          <option key={lote.id} value={lote.id}>
                            {lote.id}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              )}

              {formError && <p className="form-error" role="alert">{formError}</p>}

              <div className="form-actions">
                <button type="button" className="ghost-button" onClick={() => setFormMode(null)}>
                  Cancelar
                </button>
                <button type="submit" disabled={submitting}>
                  {submitting ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            {toast.text}
          </div>
        ))}
      </div>
    </main>
  );
}
