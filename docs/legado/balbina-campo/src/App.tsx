import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./index.css";
import { ProductionActions } from "./components/ProductionActions";
import { apiFetch, clearToken, hasToken, login } from "./api/client";
import {
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

type FormMode = "fechar" | "estoque" | null;

type Toast = { id: number; kind: "success" | "error"; text: string };

const FORM_TITLES: Record<Exclude<FormMode, null>, string> = {
  fechar: "Fechar lote",
  estoque: "Movimentar estoque",
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

  const [lotes, setLotes] = useState<Lote[]>([]);
  const [estoque, setEstoque] = useState<Estoque[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [backendOnline, setBackendOnline] = useState(true);
  const [sync, setSync] = useState<SyncSummary>({ pending: 0, synced: 0, error: 0 });
  const [toasts, setToasts] = useState<Toast[]>([]);

  const nextId = useRef(2);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      text: "Olá! Posso abrir lotes, registrar insumos e orientar a operação do viveiro.",
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
      const [l, e, s] = await Promise.all([
        apiFetch("/api/lotes"),
        apiFetch("/api/estoque"),
        apiFetch("/api/sync/summary"),
      ]);

      if (l.ok) setLotes(await l.json());
      if (e.ok) setEstoque(await e.json());
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

      if (!isInsumo && !isLote) {
        addAssistantMessage(
          'Posso ajudar com: "abrir lote L-01 com 500 alevinos de tambaqui no tanque TQ-1" ou "comprei 50 kg de ração para o tanque TQ-1".'
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
  const finding = lotesAtivos.length > 0
    ? `${lotesAtivos.length} lote(s) em engorda`
    : "Operação em standby";

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <span>Balbina Agro</span>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          <button type="button" className="active" aria-current="page">
            <strong>Visão geral</strong>
          </button>
        </nav>

      </aside>

      <div className="workspace">
        <header className="header">
          <div>
            <h1>Visão geral</h1>
            {finding && <p className="finding">{finding}</p>}
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

        <>
          <section className="panel summary">
            <div className="summary-cell">
              <span className="label">Lotes em engorda</span>
              <strong>{lotesAtivos.length}</strong>
              <small>
                {formatNumber(lotesAtivos.reduce((sum, lote) => sum + lote.estoque_inicial, 0))} peixes na água
              </small>
            </div>
            <div className="summary-cell">
              <span className="label">Lotes fechados</span>
              <strong>{lotesFechados.length}</strong>
              <small>{formatNumber(lotesFechados.reduce((sum, lote) => sum + Number(lote.kg_colhidos ?? 0), 0))} kg colhidos</small>
            </div>
            <div className="summary-cell">
              <span className="label">Estoque monitorado</span>
              <strong>{estoque.length}</strong>
              <small>{estoque.length > 0 ? "itens ativos em estoque" : "nenhum item cadastrado"}</small>
            </div>
          </section>

          <ProductionActions
            onCloseLot={() => openForm("fechar")}
            onMoveStock={() => openForm("estoque")}
            onOpenBiometry={() => {
              setChatOpen(true);
              setMessage("Registrar biometria do lote atual e acompanhar peso dos peixes.");
            }}
            onOpenChat={() => setChatOpen(true)}
            canClose={lotesAtivos.length > 0}
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
                            ? `${formatNumber(lote.kg_colhidos)} kg colhidos · ${formatMoney(lote.custo_por_kg)}/kg`
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
              placeholder="Ex.: abrir lote L-01 com 500 alevinos no tanque TQ-1"
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
                  <p className="hint">O fechamento do lote considera o histórico do viveiro e o estoque associado ao lote.</p>
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
