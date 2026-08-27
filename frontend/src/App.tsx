import {
  useEffect,
  useState,
} from "react";
import type { FormEvent } from "react";
import "./index.css";
import { ProductionActions } from "./components/ProductionActions";
import { apiFetch, clearToken, hasToken, login } from "./api/client";

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
  kg_colhidos?: number;
  custo_por_kg?: number;
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

type FormMode =
  | "fechar"
  | "venda"
  | "estoque"
  | "conta"
  | "caixa"
  | "registro"
  | null;

type Section = "producao" | "caixa" | "manejo" | "contas";

export default function App() {
  const [authenticated, setAuthenticated] = useState(hasToken);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [activeSection, setActiveSection] = useState<Section>("producao");

  const [balance, setBalance] = useState<Balance | null>(null);
  const [movimentosCaixa, setMovimentosCaixa] = useState<MovimentoCaixa[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [estoque, setEstoque] = useState<Estoque[]>([]);
  const [alertas, setAlertas] = useState<ContaAlerta[]>([]);
  const [sync, setSync] = useState<SyncSummary>({
    pending: 0,
    synced: 0,
    error: 0,
  });

  const [selectedLoteId, setSelectedLoteId] = useState("");

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      text:
        "Olá. Posso abrir lotes, registrar insumos ou consultar o caixa.",
    },
  ]);

  useEffect(() => {
    const handleAuthExpired = () => setAuthenticated(false);
    window.addEventListener("balbina-auth-expired", handleAuthExpired);
    return () => window.removeEventListener("balbina-auth-expired", handleAuthExpired);
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    try {
      await login(username.trim(), password);
      setAuthenticated(true);
      setPassword("");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    clearToken();
    setAuthenticated(false);
  }

  async function loadDashboard() {
    try {
      const responses = await Promise.all([
        apiFetch("/api/caixa/saldo"),
        apiFetch("/api/caixa/movimentos"),
        apiFetch("/api/lotes"),
        apiFetch("/api/estoque"),
        apiFetch("/api/contas-pagar/alertas"),
        apiFetch("/api/sync/summary"),
      ]);

      const [
        balanceResponse,
        movimentosCaixaResponse,
        lotesResponse,
        estoqueResponse,
        alertasResponse,
        syncResponse,
      ] = responses;

      if (balanceResponse.ok) {
        setBalance(await balanceResponse.json());
      }

      if (movimentosCaixaResponse.ok) {
        setMovimentosCaixa(await movimentosCaixaResponse.json());
      }

      if (lotesResponse.ok) {
        setLotes(await lotesResponse.json());
      }

      if (estoqueResponse.ok) {
        setEstoque(await estoqueResponse.json());
      }

      if (alertasResponse.ok) {
        setAlertas(await alertasResponse.json());
      }

      if (syncResponse.ok) {
        setSync(await syncResponse.json());
      }
    } catch {
      setSync((current) => ({
        ...current,
        pending: Math.max(current.pending, 1),
      }));
    }
  }

  useEffect(() => {
    if (!authenticated) return;
    loadDashboard();

    const interval = window.setInterval(
      loadDashboard,
      5000
    );

    return () => window.clearInterval(interval);
  }, [authenticated]);

  async function sendMessage(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const text = message.trim();

    if (!text || loading) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        role: "user",
        text,
      },
    ]);

    setMessage("");
    setLoading(true);

    const normalized = text.toLowerCase();

    try {
      if (
        normalized.includes("saldo") ||
        normalized.includes("caixa")
      ) {
        const response = await apiFetch("/api/caixa/saldo");
        const result = await response.json();

        addAssistantMessage(
          response.ok
            ? `O saldo atual do caixa é R$ ${Number(
                result.saldo
              ).toFixed(2)}.`
            : "Não foi possível consultar o caixa."
        );

        return;
      }

      const isInsumo =
        normalized.includes("ração") ||
        normalized.includes("racao") ||
        normalized.includes("alevino") ||
        normalized.includes("medicamento") ||
        normalized.includes("insumo") ||
        normalized.includes("compra");

      const isLote =
        normalized.includes("abrir lote") ||
        normalized.includes("abre lote") ||
        normalized.includes("abre um lote") ||
        normalized.includes("abrir um lote") ||
        normalized.includes("novo lote") ||
        normalized.includes("criar lote") ||
        normalized.includes("crie um lote");

      if (!isInsumo && !isLote) {
        addAssistantMessage(
          "Posso ajudar com abrir lote, registrar insumo ou consultar o saldo do caixa."
        );
        return;
      }

      const endpoint = isLote
        ? "/api/abrir-lote"
        : "/api/lancar-insumo";

      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: text }),
      });

      const result = await response.json();

      addAssistantMessage(
        response.ok
          ? isInsumo
            ? `Insumo registrado: ${result.insumoId ?? "OK"}`
            : `Lote registrado: ${result.loteId ?? "OK"}`
          : result.error ||
              "Não foi possível processar a operação."
      );

      await loadDashboard();
    } catch {
      addAssistantMessage(
        "Backend indisponível no momento."
      );
    } finally {
      setLoading(false);
    }
  }

  function addAssistantMessage(text: string) {
    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        role: "assistant",
        text,
      },
    ]);
  }

  async function submitForm(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    try {
      let endpoint = "";
      let body: Record<string, unknown> = {};

      if (formMode === "fechar") {
        endpoint = `/api/lotes/${form.get("loteId")}/fechar`;
        body = {
          kgColhidos: Number(form.get("kgColhidos")),
          dataFechamento: form.get("dataFechamento"),
        };
      }

      if (formMode === "venda") {
        endpoint = "/api/vendas";
        body = {
          loteId: form.get("loteId"),
          dataVenda: form.get("dataVenda"),
          kgVendidos: Number(form.get("kgVendidos")),
          valorTotal: Number(form.get("valorTotal")),
          comprador: form.get("comprador"),
        };
      }

      if (formMode === "estoque") {
        endpoint = "/api/estoque/movimentos";
        body = {
          item: form.get("item"),
          categoria: form.get("categoria"),
          quantidade: Number(form.get("quantidade")),
          unidade: form.get("unidade"),
          tipoMovimento: form.get("tipoMovimento"),
          dataMovimento: form.get("dataMovimento"),
        };
      }

      if (formMode === "conta") {
        endpoint = "/api/contas-pagar";
        body = {
          descricao: form.get("descricao"),
          fornecedor: form.get("fornecedor"),
          valor: Number(form.get("valor")),
          vencimento: form.get("vencimento"),
        };
      }

      if (formMode === "caixa") {
        endpoint = "/api/caixa/movimento";
        body = {
          tipo: form.get("tipo"),
          valor: Number(form.get("valor")),
          descricao: form.get("descricao"),
          dataMovimento: form.get("dataMovimento"),
        };
      }

      if (formMode === "registro") {
        const registroTipo = form.get("registroTipo");

        if (registroTipo === "conta") {
          endpoint = "/api/contas-pagar";
          body = {
            descricao: form.get("descricao"),
            fornecedor: form.get("fornecedor"),
            valor: Number(form.get("valor")),
            vencimento: form.get("data"),
          };
        } else {
          endpoint = "/api/caixa/movimento";
          body = {
            tipo: form.get("tipo"),
            valor: Number(form.get("valor")),
            descricao: form.get("descricao"),
            dataMovimento: form.get("data"),
          };
        }
      }

      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      addAssistantMessage(
        response.ok
          ? "Operação registrada com sucesso."
          : result.error || "Não foi possível concluir."
      );

      if (response.ok) {
        setFormMode(null);
        await loadDashboard();
      }
    } catch {
      addAssistantMessage(
        "Não foi possível conectar ao backend."
      );
    }
  }

  const isOffline =
    sync.pending > 0 || sync.error > 0;

  if (!authenticated) {
    return (
      <main className="app login-screen">
        <section className="panel login-panel">
          <span className="label">BALBINA AGRO</span>
          <h1>Acesso ao sistema</h1>
          <p>Entre para acompanhar a operação da sua propriedade.</p>
          <form className="operation-fields" onSubmit={handleLogin}>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Usuário"
              autoComplete="username"
              required
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Senha"
              type="password"
              autoComplete="current-password"
              required
            />
            {loginError && <p className="form-error">{loginError}</p>}
            <button type="submit" disabled={loginLoading}>
              {loginLoading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <aside className="sidebar flex flex-col">
        <div className="brand">
          <span className="brand-mark">BA</span>
          <span>Balbina Agro</span>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          {([
            ["producao", "Visão geral", "Acompanhe seus lotes"],
            ["caixa", "Caixa", "Entradas e saídas"],
            ["manejo", "Manejo", "Fale com a assistente"],
            ["contas", "Contas", "Vencimentos"],
          ] as const).map(([section, label, description]) => (
            <button
              className={activeSection === section ? "active" : ""}
              key={section}
              type="button"
              onClick={() => setActiveSection(section)}
              aria-current={activeSection === section ? "page" : undefined}
            >
              <strong>{label}</strong>
              <small>{description}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          Operação offline-first<br />
          Os dados locais são enviados quando a conexão retorna.
        </div>
      </aside>

      <div className="workspace min-w-0">
        <header className="header" id="visao-geral">
          <div>
            <span className="label">PAINEL DE OPERAÇÃO</span>
            <h1>
              {activeSection === "producao" && "Visão geral"}
              {activeSection === "caixa" && "Caixa"}
              {activeSection === "manejo" && "Manejo"}
              {activeSection === "contas" && "Contas a pagar"}
            </h1>
          </div>

          <div className="header-actions">
            <span className={`status ${isOffline ? "offline" : "online"}`}>
              ● {isOffline ? `${sync.pending} pendente(s)` : "Online"}
            </span>
            <button className="logout-button" type="button" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </header>

      {activeSection === "producao" && <section className="dashboard">
        <article className="balance-card">
          <span className="label">
            SALDO ATUAL DO CAIXA
          </span>

          <strong>
            R${" "}
            {(balance?.saldo ?? 0)
              .toFixed(2)
              .replace(".", ",")}
          </strong>

          <div className="balance-details">
            <span>
              Entradas: R${" "}
              {(balance?.entradas ?? 0).toFixed(2)}
            </span>

            <span>
              Saídas: R${" "}
              {(balance?.saidas ?? 0).toFixed(2)}
            </span>
          </div>
        </article>

        <article className="panel">
          <span className="label">LOTES ATIVOS</span>

          {lotes.length === 0 ? (
            <>
              <h2>Nenhum lote cadastrado</h2>
              <p>
                Use o chat para abrir um novo lote.
              </p>
            </>
          ) : (
            <div className="lot-list">
              {lotes.map((lote) => (
                <div className="lot-item" key={lote.id}>
                  <strong>{lote.id}</strong>
                  <span>{lote.especie}</span>
                  <small>
                    Tanque {lote.tanque_id} ·{" "}
                    {lote.estoque_inicial}{" "}
                    {lote.unidade || "peixes"} ·{" "}
                    {lote.status || "ativo"}
                  </small>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>}

      {activeSection === "producao" && <div id="producao">
        <ProductionActions
        onCloseLot={() => setFormMode("fechar")}
        onRegisterSale={() => setFormMode("venda")}
        onViewStock={() => setFormMode("estoque")}
        onViewPayables={() => setFormMode("conta")}
        />
      </div>}

      {activeSection === "caixa" && (
        <>
          <section className="section-grid">
            <article className="balance-card">
              <span className="label">SALDO ATUAL DO CAIXA</span>
              <strong>R$ {(balance?.saldo ?? 0).toFixed(2).replace(".", ",")}</strong>
              <div className="balance-details">
                <span>Entradas: R$ {(balance?.entradas ?? 0).toFixed(2).replace(".", ",")}</span>
                <span>Saídas: R$ {(balance?.saidas ?? 0).toFixed(2).replace(".", ",")}</span>
              </div>
            </article>
            <section className="panel">
              <span className="label">SINCRONIZAÇÃO</span>
              <h2>{isOffline ? "Operando offline" : "Tudo sincronizado"}</h2>
              <p>{sync.pending} operação(ões) aguardando envio para o servidor.</p>
            </section>
          </section>
          <section className="panel cash-history">
            <div className="chat-heading">
              <div>
                <span className="label">MOVIMENTAÇÕES</span>
                <h2>Entradas e saídas</h2>
              </div>
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
                      <small>{new Date(movimento.dataMovimento).toLocaleDateString("pt-BR")}</small>
                    </div>
                    <strong className={`cash-value ${movimento.tipo}`}>
                      {movimento.tipo === "entrada" ? "+" : "-"} R$ {movimento.valor.toFixed(2).replace(".", ",")}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {activeSection === "contas" && (alertas.length > 0 ? (
        <section className="panel alert-panel">
          <span className="label">ALERTAS DE VENCIMENTO</span>

          {alertas.map((conta) => (
            <p key={conta.id}>
              {conta.descricao} vence em{" "}
              {conta.dias_restantes} dia(s).
            </p>
          ))}
        </section>
      ) : (
        <section className="panel empty-state">
          <span className="label">CONTAS A PAGAR</span>
          <h2>Nenhuma conta próxima do vencimento</h2>
          <p>Use a ação abaixo para registrar uma nova conta.</p>
        </section>
      ))}

      {activeSection === "contas" && alertas.length > 0 && (
        <div className="account-actions">
          <button type="button" onClick={() => setFormMode("registro")}>Registrar</button>
        </div>
      )}

      {activeSection === "contas" && alertas.length === 0 && (
        <div className="account-actions">
          <button type="button" onClick={() => setFormMode("registro")}>Registrar</button>
        </div>
      )}

      {activeSection === "producao" && <section className="panel">
        <span className="label">ESTOQUE ATUAL</span>

        {estoque.length === 0 ? (
          <p>Nenhum item no estoque.</p>
        ) : (
          <div className="lot-list">
            {estoque.map((item) => (
              <div
                className="lot-item"
                key={`${item.categoria}-${item.item}`}
              >
                <strong>{item.item}</strong>
                <span>{item.categoria}</span>
                <small>
                  {item.saldo} {item.unidade}
                </small>
              </div>
            ))}
          </div>
        )}
      </section>}

      {activeSection === "manejo" && <section className="chat panel" id="assistente">
        <div className="chat-heading">
          <div>
            <span className="label">ASSISTENTE</span>
            <h2>Chat operacional</h2>
          </div>

          <span className="status online">
            ● Pronto
          </span>
        </div>

        <div className="messages">
          {messages.map((item) => (
            <div
              key={item.id}
              className={`message ${item.role}`}
            >
              {item.text}
            </div>
          ))}
        </div>

        <form
          onSubmit={sendMessage}
          className="composer"
        >
          <textarea
            value={message}
            onChange={(event) =>
              setMessage(event.target.value)
            }
            placeholder="Ex.: consultar saldo do caixa"
            rows={3}
          />

          <button
            type="submit"
            disabled={
              loading || !message.trim()
            }
          >
            {loading ? "Processando..." : "Enviar"}
          </button>
        </form>
      </section>}

      {formMode && (
        <section className="panel operation-form">
          <div className="chat-heading">
            <h2>
              {formMode === "fechar" &&
                "Fechar lote"}
              {formMode === "venda" &&
                "Registrar venda"}
              {formMode === "estoque" &&
                "Movimentar estoque"}
              {formMode === "conta" &&
                "Nova conta a pagar"}
              {formMode === "caixa" &&
                "Novo lançamento no caixa"}
              {formMode === "registro" &&
                "Registrar operação"}
            </h2>

            <button
              type="button"
              onClick={() => setFormMode(null)}
            >
              Fechar
            </button>
          </div>

          <form
            onSubmit={submitForm}
            className="operation-fields"
          >
            {(formMode === "fechar" ||
              formMode === "venda") && (
              <input
                name="loteId"
                placeholder="ID do lote"
                defaultValue={selectedLoteId}
                onChange={(event) =>
                  setSelectedLoteId(event.target.value)
                }
                required
              />
            )}

            {formMode === "fechar" && (
              <>
                <input
                  name="kgColhidos"
                  type="number"
                  step="0.01"
                  placeholder="Kg colhidos"
                  required
                />

                <input
                  name="dataFechamento"
                  type="date"
                  required
                />
              </>
            )}

            {formMode === "venda" && (
              <>
                <input
                  name="dataVenda"
                  type="date"
                  required
                />

                <input
                  name="kgVendidos"
                  type="number"
                  step="0.01"
                  placeholder="Kg vendidos"
                  required
                />

                <input
                  name="valorTotal"
                  type="number"
                  step="0.01"
                  placeholder="Valor total"
                  required
                />

                <input
                  name="comprador"
                  placeholder="Comprador"
                />
              </>
            )}

            {formMode === "estoque" && (
              <>
                <input
                  name="item"
                  placeholder="Item"
                  required
                />

                <select name="categoria" defaultValue="racao">
                  <option value="racao">Ração</option>
                  <option value="peixe">Peixe</option>
                </select>

                <input
                  name="quantidade"
                  type="number"
                  step="0.01"
                  placeholder="Quantidade"
                  required
                />

                <input
                  name="unidade"
                  placeholder="Unidade: kg, unidade..."
                  required
                />

                <select
                  name="tipoMovimento"
                  defaultValue="entrada"
                >
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </select>

                <input
                  name="dataMovimento"
                  type="date"
                  required
                />
              </>
            )}

            {formMode === "conta" && (
              <>
                <input
                  name="descricao"
                  placeholder="Descrição"
                  required
                />

                <input
                  name="fornecedor"
                  placeholder="Fornecedor"
                />

                <input
                  name="valor"
                  type="number"
                  step="0.01"
                  placeholder="Valor"
                  required
                />

                <input
                  name="vencimento"
                  type="date"
                  required
                />
              </>
            )}

            {formMode === "caixa" && (
              <>
                <select name="tipo" defaultValue="saida">
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </select>

                <input
                  name="descricao"
                  placeholder="Descrição: venda, compra, despesa..."
                  required
                />

                <input
                  name="valor"
                  type="number"
                  step="0.01"
                  placeholder="Valor"
                  required
                />

                <input
                  name="dataMovimento"
                  type="date"
                  required
                />
              </>
            )}

            {formMode === "registro" && (
              <>
                <select name="registroTipo" defaultValue="caixa">
                  <option value="caixa">Entrada ou saída no caixa</option>
                  <option value="conta">Conta a pagar</option>
                </select>

                <select name="tipo" defaultValue="saida">
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </select>

                <input
                  name="descricao"
                  placeholder="Descrição"
                  required
                />

                <input
                  name="fornecedor"
                  placeholder="Fornecedor (opcional)"
                />

                <input
                  name="valor"
                  type="number"
                  step="0.01"
                  placeholder="Valor"
                  required
                />

                <input
                  name="data"
                  type="date"
                  required
                />
              </>
            )}

            <button type="submit">
              Salvar operação
            </button>
          </form>
        </section>
      )}
      </div>
    </main>
  );
}