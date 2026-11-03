// Carrega o .env antes de qualquer outro módulo: db.ts lê DB_PATH na importação.
import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { createToken, requireAuth } from "./auth";
import db from "./db";

import { ChatService } from "./chatService";
import { loadConhecimento } from "./knowledgeLoader";
import { ManejoService } from "./services/manejoService";
import { fecharLote } from "./services/producaoService";
import { PostgresSyncWorker } from "./services/postgresSyncWorker";

import { insertLote, listLotes } from "./repositories/lotesRepository";
import {
  findActiveLoteIdByTanque,
  insertInsumo,
} from "./repositories/insumosRepository";
import {
  insertCaixaMovimento,
  getSaldo,
  listarMovimentosCaixa,
} from "./repositories/caixaRepository";
import {
  enqueueOperation,
  getQueueSummary,
} from "./repositories/syncRepository";
import {
  inserirVenda,
  listarVendas,
  loteExiste,
  obterLote,
  totalVendidoDoLote,
} from "./repositories/vendasRepository";
import {
  contaExiste,
  inserirConta,
  listarAlertasContas,
  listarContas,
  pagarConta,
} from "./repositories/contasRepository";
import {
  inserirMovimentoEstoque,
  listarEstoque,
  listarMovimentosEstoque,
} from "./repositories/estoqueRepository";

import {
  handleAbrirLotePayload,
  handleLancarInsumoPayload,
} from "./structuredOutputHandler";

const app = express();

app.use(cors());
app.use(express.json());

function safeEqual(received: unknown, expected: string): boolean {
  if (typeof received !== "string") return false;
  const a = crypto.createHash("sha256").update(received).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

app.post("/api/login", (req, res) => {
  const username = process.env.AUTH_USER || "admin";
  const password = process.env.AUTH_PASSWORD;

  if (!process.env.JWT_SECRET || !password) {
    return res.status(503).json({
      error: "Autenticação não configurada no servidor.",
    });
  }

  if (
    !safeEqual(req.body?.username, username) ||
    !safeEqual(req.body?.password, password)
  ) {
    return res.status(401).json({ error: "Credenciais inválidas." });
  }

  return res.json({
    token: createToken(username),
    expiresIn: "7d",
  });
});

app.use("/api", (req, res, next) => {
  if (req.path === "/login" || req.path === "/health") {
    next();
    return;
  }
  requireAuth(req, res, next);
});

const apiKey = process.env.IA_API_KEY;
const apiUrl =
  process.env.IA_API_URL ||
  "http://localhost:11434/v1/chat/completions";
const model = process.env.IA_MODEL || "qwen2.5:0.5b";

if (!apiKey) {
  console.warn(
    "IA_API_KEY não definido — endpoints de chat falharão sem chave."
  );
}

const chat = new ChatService(apiKey || "", apiUrl, model);
const manejoService = new ManejoService(
  process.env.IA_MANEJO_URL || apiUrl,
  process.env.IA_MANEJO_MODEL || "qwen2.5:1.5b",
  apiKey
);
const conhecimentoPromise = loadConhecimento(process.cwd());

function isValidDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isPositiveNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0
  );
}

function getErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (
    error instanceof Error &&
    "code" in error &&
    String(error.code).startsWith("SQLITE_CONSTRAINT")
  ) {
    return "Registro duplicado ou referência inválida.";
  }
  return error instanceof Error ? error.message : fallback;
}

app.get("/api/health", (_req, res) => {
  return res.json({ ok: true });
});

app.get("/api/lotes", (_req, res) => {
  try {
    return res.json(listLotes());
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(error, "Erro ao listar lotes."),
    });
  }
});

app.get("/api/sync/summary", (_req, res) => {
  try {
    return res.json(getQueueSummary());
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(
        error,
        "Erro ao consultar sincronização."
      ),
    });
  }
});

// US-009: suporte de manejo
app.post("/api/chat/manejo", async (req, res) => {
  try {
    const { pergunta } = req.body;

    if (
      typeof pergunta !== "string" ||
      !pergunta.trim()
    ) {
      return res.status(400).json({
        error: "pergunta é obrigatória.",
      });
    }

    const resultado = await manejoService.responder(pergunta);

    return res.json({
      ok: true,
      ...resultado,
    });
  } catch (error) {
    return res.status(503).json({
      error: getErrorMessage(
        error,
        "Serviço de manejo indisponível."
      ),
    });
  }
});

// US-001: abrir lote
app.post("/api/abrir-lote", async (req, res) => {
  try {
    const { message } = req.body;

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "message required",
      });
    }

    const conhecimento = await conhecimentoPromise;
    const parsed = await chat.sendAbrirLoteRequest(message);

    const validation = handleAbrirLotePayload(
      parsed.payload,
      conhecimento
    );

    if (!validation.valido) {
      return res.status(400).json({
        error: "validação falhou",
        avisos: validation.avisos,
      });
    }

    if (loteExiste(parsed.payload.loteId)) {
      return res.status(409).json({
        error: `Já existe um lote com o código ${parsed.payload.loteId}.`,
      });
    }

    db.transaction(() => {
      insertLote(parsed.payload);
      enqueueOperation("lote", "create", {
        id: parsed.payload.loteId,
        ...parsed.payload,
      });
    })();

    return res.status(201).json({
      ok: true,
      loteId: parsed.payload.loteId,
      avisos: validation.avisos,
    });
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(error, "Erro ao abrir lote."),
    });
  }
});

// US-002: lançar insumo
app.post("/api/lancar-insumo", async (req, res) => {
  try {
    const { message } = req.body;

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "message required",
      });
    }

    const conhecimento = await conhecimentoPromise;
    const parsed = await chat.sendLancarInsumoRequest(message);

    const validation = handleLancarInsumoPayload(
      parsed.payload,
      conhecimento
    );

    if (!validation.valido) {
      return res.status(400).json({
        error: "validação falhou",
        avisos: validation.avisos,
      });
    }

    const loteId = findActiveLoteIdByTanque(parsed.payload.tanqueId);

    db.transaction(() => {
      insertInsumo(parsed.payload, loteId);

      enqueueOperation("insumo", "create", {
        id: parsed.payload.insumoId,
        ...parsed.payload,
        loteId,
      });

      if (parsed.payload.precoUnitario !== undefined) {
        const total =
          parsed.payload.precoUnitario *
          parsed.payload.quantidade;

        const descricao = `Compra ${parsed.payload.tipo}`;

        const caixaId = insertCaixaMovimento(
          "saida",
          total,
          descricao,
          parsed.payload.insumoId,
          parsed.payload.dataCompra,
          loteId
        );

        enqueueOperation("caixa", "create", {
          id: caixaId,
          tipo: "saida",
          valor: total,
          descricao,
          referenciaId: parsed.payload.insumoId,
          loteId,
          dataMovimento: parsed.payload.dataCompra,
        });
      }
    })();

    return res.status(201).json({
      ok: true,
      insumoId: parsed.payload.insumoId,
      avisos: validation.avisos,
    });
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(error, "Erro ao lançar insumo."),
    });
  }
});

// US-003: saldo do caixa
app.get("/api/caixa/saldo", (_req, res) => {
  try {
    return res.json(getSaldo());
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(error, "Erro ao consultar saldo."),
    });
  }
});

app.get("/api/caixa/movimentos", (_req, res) => {
  try {
    return res.json(listarMovimentosCaixa());
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(error, "Erro ao listar movimentos."),
    });
  }
});

// Movimentação manual do caixa
app.post("/api/caixa/movimento", (req, res) => {
  try {
    const {
      tipo,
      valor,
      descricao,
      referenciaId,
      dataMovimento,
      loteId,
    } = req.body;

    if (tipo !== "entrada" && tipo !== "saida") {
      return res.status(400).json({
        error: "tipo deve ser entrada ou saida.",
      });
    }

    if (!isPositiveNumber(valor)) {
      return res.status(400).json({
        error: "valor deve ser positivo.",
      });
    }

    if (!isValidDate(dataMovimento)) {
      return res.status(400).json({
        error: "dataMovimento inválida.",
      });
    }

    const descricaoFinal =
      typeof descricao === "string" &&
      descricao.trim()
        ? descricao
        : "Movimentação manual";

    const movementId = db.transaction(() => {
      const id = insertCaixaMovimento(
        tipo,
        valor,
        descricaoFinal,
        referenciaId ?? null,
        dataMovimento,
        loteId ?? null
      );

      enqueueOperation("caixa", "create", {
        id,
        tipo,
        valor,
        descricao: descricaoFinal,
        referenciaId: referenciaId ?? null,
        loteId: loteId ?? null,
        dataMovimento,
      });
      return id;
    })();

    return res.status(201).json({
      ok: true,
      id: movementId,
    });
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(
        error,
        "Erro ao registrar movimentação."
      ),
    });
  }
});

// US-004: fechar lote
app.post("/api/lotes/:id/fechar", (req, res) => {
  try {
    const { id } = req.params;
    const { kgColhidos, dataFechamento } = req.body;

    if (!isPositiveNumber(kgColhidos)) {
      return res.status(400).json({
        error: "kgColhidos deve ser positivo.",
      });
    }

    if (!isValidDate(dataFechamento)) {
      return res.status(400).json({
        error: "dataFechamento inválida.",
      });
    }

    const resultado = db.transaction(() => {
      const fechamento = fecharLote({
        loteId: id,
        kgColhidos,
        dataFechamento,
      });

      enqueueOperation("lote", "update", {
        id,
        status: "fechado",
        dataFechamento,
        kgColhidos,
        custoTotal: fechamento.custoTotal,
        custoPorKg: fechamento.custoPorKg,
      });

      enqueueOperation("estoque", "create", fechamento.movimentoEstoque);

      return fechamento;
    })();

    return res.json({
      ok: true,
      ...resultado,
    });
  } catch (error) {
    return res.status(400).json({
      error: getErrorMessage(error, "Erro ao fechar lote."),
    });
  }
});

// US-006: registrar venda e baixar estoque
app.post("/api/vendas", (req, res) => {
  try {
    const {
      loteId,
      dataVenda,
      kgVendidos,
      valorTotal,
      comprador,
    } = req.body;

    if (
      typeof loteId !== "string" ||
      !loteId.trim()
    ) {
      return res.status(400).json({
        error: "loteId é obrigatório.",
      });
    }

    if (!isValidDate(dataVenda)) {
      return res.status(400).json({
        error: "dataVenda inválida.",
      });
    }

    if (!isPositiveNumber(kgVendidos)) {
      return res.status(400).json({
        error: "kgVendidos deve ser positivo.",
      });
    }

    if (!isPositiveNumber(valorTotal)) {
      return res.status(400).json({
        error: "valorTotal deve ser positivo.",
      });
    }

    const lote = obterLote(loteId);

    if (!lote) {
      return res.status(404).json({
        error: "Lote não encontrado.",
      });
    }

    if (lote.status !== "fechado") {
      return res.status(400).json({
        error: "O lote precisa estar fechado antes da venda.",
      });
    }

    const disponivel =
      Number(lote.kg_colhidos ?? 0) - totalVendidoDoLote(loteId);

    if (kgVendidos > disponivel + 1e-9) {
      return res.status(400).json({
        error: `Quantidade acima do disponível no lote: ${disponivel.toFixed(2)} kg.`,
      });
    }

    // Tudo ou nada: se a baixa de estoque falhar, a venda e o caixa não ficam gravados.
    const { venda, estoque } = db.transaction(() => {
      const novaVenda = inserirVenda({
        loteId,
        dataVenda,
        kgVendidos,
        valorTotal,
        comprador: comprador ?? null,
      });

      const movimento = inserirMovimentoEstoque({
        item: lote.especie,
        categoria: "peixe",
        quantidade: kgVendidos,
        unidade: "kg",
        tipoMovimento: "saida",
        referenciaId: novaVenda.id,
        dataMovimento: dataVenda,
      });

      const descricao = `Venda do lote ${loteId}`;

      const caixaId = insertCaixaMovimento(
        "entrada",
        valorTotal,
        descricao,
        novaVenda.id,
        dataVenda,
        loteId
      );

      enqueueOperation("venda", "create", novaVenda);
      enqueueOperation("estoque", "create", movimento);
      enqueueOperation("caixa", "create", {
        id: caixaId,
        tipo: "entrada",
        valor: valorTotal,
        descricao,
        referenciaId: novaVenda.id,
        loteId,
        dataMovimento: dataVenda,
      });

      return { venda: novaVenda, estoque: movimento };
    })();

    return res.status(201).json({
      ok: true,
      venda,
      estoque,
    });
  } catch (error) {
    return res.status(400).json({
      error: getErrorMessage(
        error,
        "Erro ao registrar venda."
      ),
    });
  }
});

app.get("/api/vendas", (_req, res) => {
  try {
    return res.json(listarVendas());
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(error, "Erro ao listar vendas."),
    });
  }
});

// US-007: contas a pagar
app.post("/api/contas-pagar", (req, res) => {
  try {
    const {
      descricao,
      fornecedor,
      valor,
      vencimento,
    } = req.body;

    if (
      typeof descricao !== "string" ||
      !descricao.trim()
    ) {
      return res.status(400).json({
        error: "descricao é obrigatória.",
      });
    }

    if (!isPositiveNumber(valor)) {
      return res.status(400).json({
        error: "valor deve ser positivo.",
      });
    }

    if (!isValidDate(vencimento)) {
      return res.status(400).json({
        error: "vencimento inválido.",
      });
    }

    const conta = db.transaction(() => {
      const novaConta = inserirConta({
        descricao: descricao.trim(),
        fornecedor: fornecedor || null,
        valor,
        vencimento,
      });
      enqueueOperation("conta_pagar", "create", novaConta);
      return novaConta;
    })();

    return res.status(201).json({
      ok: true,
      conta,
    });
  } catch (error) {
    return res.status(400).json({
      error: getErrorMessage(error, "Erro ao criar conta."),
    });
  }
});

app.get("/api/contas-pagar", (_req, res) => {
  try {
    return res.json(listarContas());
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(error, "Erro ao listar contas."),
    });
  }
});

app.get("/api/contas-pagar/alertas", (_req, res) => {
  try {
    return res.json(listarAlertasContas(7));
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(error, "Erro ao listar alertas."),
    });
  }
});

app.patch("/api/contas-pagar/:id/pagar", (req, res) => {
  try {
    const { id } = req.params;
    const pagoEm = req.body?.pagoEm || new Date().toISOString();

    if (!isValidDate(pagoEm)) {
      return res.status(400).json({
        error: "pagoEm inválido.",
      });
    }

    if (!contaExiste(id)) {
      return res.status(404).json({
        error: "Conta não encontrada.",
      });
    }

    const paga = db.transaction(() => {
      if (!pagarConta(id, pagoEm)) return false;
      enqueueOperation("conta_pagar", "update", {
        id,
        status: "paga",
        pagoEm,
      });
      return true;
    })();

    if (!paga) {
      return res.status(400).json({
        error: "A conta já foi paga.",
      });
    }

    return res.json({
      ok: true,
      id,
      status: "paga",
      pagoEm,
    });
  } catch (error) {
    return res.status(400).json({
      error: getErrorMessage(error, "Erro ao pagar conta."),
    });
  }
});

// US-008: estoque
app.post("/api/estoque/movimentos", (req, res) => {
  try {
    const {
      item,
      categoria,
      quantidade,
      unidade,
      tipoMovimento,
      referenciaId,
      dataMovimento,
    } = req.body;

    if (typeof item !== "string" || !item.trim()) {
      return res.status(400).json({
        error: "item é obrigatório.",
      });
    }

    if (categoria !== "racao" && categoria !== "peixe") {
      return res.status(400).json({
        error: "categoria deve ser racao ou peixe.",
      });
    }

    if (
      tipoMovimento !== "entrada" &&
      tipoMovimento !== "saida"
    ) {
      return res.status(400).json({
        error: "tipoMovimento deve ser entrada ou saida.",
      });
    }

    if (!isPositiveNumber(quantidade)) {
      return res.status(400).json({
        error: "quantidade deve ser positiva.",
      });
    }

    if (
      typeof unidade !== "string" ||
      !unidade.trim()
    ) {
      return res.status(400).json({
        error: "unidade é obrigatória.",
      });
    }

    if (!isValidDate(dataMovimento)) {
      return res.status(400).json({
        error: "dataMovimento inválida.",
      });
    }

    const movimento = db.transaction(() => {
      const novoMovimento = inserirMovimentoEstoque({
        item,
        categoria,
        quantidade,
        unidade,
        tipoMovimento,
        referenciaId: referenciaId ?? null,
        dataMovimento,
      });
      enqueueOperation("estoque", "create", novoMovimento);
      return novoMovimento;
    })();

    return res.status(201).json({
      ok: true,
      movimento,
    });
  } catch (error) {
    return res.status(400).json({
      error: getErrorMessage(
        error,
        "Erro ao registrar estoque."
      ),
    });
  }
});

app.get("/api/estoque", (_req, res) => {
  try {
    return res.json(listarEstoque());
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(error, "Erro ao listar estoque."),
    });
  }
});

app.get("/api/estoque/movimentos", (_req, res) => {
  try {
    return res.json(listarMovimentosEstoque());
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(
        error,
        "Erro ao listar movimentos."
      ),
    });
  }
});

const databaseUrl = process.env.DATABASE_URL?.trim();

if (databaseUrl) {
  const syncWorker = new PostgresSyncWorker({
    databaseUrl,
    pollIntervalMs: 5000,
    batchSize: 10,
    maxAttempts: 5,
  });

  syncWorker.start();
} else {
  console.warn("DATABASE_URL não definido - sincronização remota desativada.");
}

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`Server rodando em http://${host}:${port}`);
});