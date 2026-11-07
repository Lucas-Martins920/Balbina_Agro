import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ErroOllama, OLLAMA_MODELO_PADRAO, configOllamaServidor, responderManejoOllama, situacaoOllama } from "./offline-chat.ts";
import type { ContextoCartoes } from "../campo/propostas.ts";

// Ollama de mentira: responde como o /api/chat e o /api/tags de verdade
let servidor: Server;
let url = "";
let ultimoPedido: Record<string, unknown> = {};
let resposta: { status: number; corpo: unknown } = { status: 200, corpo: {} };

before(async () => {
  servidor = createServer((req, res) => {
    let bruto = "";
    req.on("data", (c) => (bruto += c));
    req.on("end", () => {
      if (req.url === "/api/tags") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ models: [{ name: "mistral:latest", model: "mistral:latest" }] }));
      }
      ultimoPedido = bruto ? JSON.parse(bruto) : {};
      res.writeHead(resposta.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resposta.corpo));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
after(() => servidor.close());

const ctx: ContextoCartoes = {
  tanques: [{ id: "v1", rotulo: "Viveiro 01", lote: { id: "l1" } }],
  insumos: [], medicamentos: [], racoes: [],
};

const proposta = {
  tipo: "apontamento", viveiro_id: "v1", turno: "manha", racao_kg: 50, sacos: 2, racao_produto_id: null, mortes: 3, causa: null,
  oxigenio_mg_l: 4.5, temperatura_c: null, ph: null, transparencia_cm: null, amonia_mg_l: null, peixes_amostrados: null,
  peso_total_g: null, peso_medio_g: null, insumo_tipo: null, produto_id: null, medicamento_id: null, quantidade: null, observacoes: null,
};

test("configuração vem do ambiente; modelo padrão mistral; URL inválida desliga", () => {
  assert.equal(configOllamaServidor({}), null);
  assert.equal(configOllamaServidor({ OLLAMA_URL: "ftp://x" }), null);
  assert.deepEqual(configOllamaServidor({ OLLAMA_URL: "http://127.0.0.1:11434/" }), { url: "http://127.0.0.1:11434", modelo: OLLAMA_MODELO_PADRAO });
  assert.equal(configOllamaServidor({ OLLAMA_URL: "http://x:11434", OLLAMA_MODELO: "neural-chat" })?.modelo, "neural-chat");
});

test("pergunta ao Ollama com o JSON Schema e transforma a resposta em cartões", async () => {
  resposta = { status: 200, corpo: { message: { role: "assistant", content: JSON.stringify({ resposta: " Anotei. Confira o cartão. ", propostas: [proposta] }) } } };
  const r = await responderManejoOllama({ url, modelo: "mistral" }, {
    mensagens: [{ papel: "pessoa", texto: "viveiro 1, 2 sacos, 3 mortes, oxigênio 4,5" }],
    dados: "DADOS DA PISCICULTURA\nViveiro 01 (id v1)", ctx,
  });
  assert.equal(r.resposta, "Anotei. Confira o cartão.");
  assert.equal(r.cartoes.length, 1);
  assert.equal(ultimoPedido.model, "mistral");
  assert.equal(ultimoPedido.stream, false);
  assert.equal((ultimoPedido.format as { type?: string }).type, "object", "manda o schema da resposta");
  const msgs = ultimoPedido.messages as { role: string; content: string }[];
  assert.equal(msgs[0].role, "system");
  assert.match(msgs[0].content, /assistente de manejo/);
  assert.match(msgs[0].content, /Viveiro 01 \(id v1\)/);
  assert.deepEqual(msgs[1], { role: "user", content: "viveiro 1, 2 sacos, 3 mortes, oxigênio 4,5" });
});

test("modelo não baixado vira mensagem com o comando para baixar", async () => {
  resposta = { status: 404, corpo: { error: "model \"mistral\" not found, try pulling it first" } };
  await assert.rejects(
    responderManejoOllama({ url, modelo: "mistral" }, { mensagens: [{ papel: "pessoa", texto: "oi" }], dados: "", ctx }),
    (e: unknown) => e instanceof ErroOllama && /ollama pull mistral/.test(e.message),
  );
});

test("resposta fora do formato é recusada", async () => {
  resposta = { status: 200, corpo: { message: { content: "{\"texto\": \"oi\"}" } } };
  await assert.rejects(
    responderManejoOllama({ url, modelo: "mistral" }, { mensagens: [{ papel: "pessoa", texto: "oi" }], dados: "", ctx }),
    ErroOllama,
  );
});

test("Ollama desligado vira ErroOllama (o celular cai para a base local)", async () => {
  await assert.rejects(
    responderManejoOllama({ url: "http://127.0.0.1:1", modelo: "mistral" }, { mensagens: [{ papel: "pessoa", texto: "oi" }], dados: "", ctx }),
    (e: unknown) => e instanceof ErroOllama && /não está ligada/.test(e.message),
  );
});

test("situação: ligado e com o modelo baixado", async () => {
  assert.deepEqual(await situacaoOllama({ url, modelo: "mistral" }), { online: true, modelo: true });
  assert.deepEqual(await situacaoOllama({ url, modelo: "neural-chat" }), { online: true, modelo: false });
  assert.deepEqual(await situacaoOllama({ url: "http://127.0.0.1:1", modelo: "mistral" }), { online: false, modelo: false });
});
