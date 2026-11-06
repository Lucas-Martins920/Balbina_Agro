import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarAjuste, clientesSemComprar, curvaAbc, fecharPagamento, linkWhatsapp, notasSugeridas, precoVigente, resumoVendas } from "./vendas.ts";

test("resumo de vendas por cliente com preço médio do kg", () => {
  const r = resumoVendas([
    { mes: "2026-09-01", cliente_id: "a", cliente: "Peixaria", produto: "Caixa 20 kg · peixe grande", classe: "Grande", kg: 20, total_cents: 36000 },
    { mes: "2026-10-01", cliente_id: "a", cliente: "Peixaria", produto: "Peixe médio (kg)", classe: "Médio", kg: 12.5, total_cents: 20000 },
    { mes: "2026-10-01", cliente_id: "b", cliente: "Restaurante", produto: "Caixa 20 kg · peixe grande", classe: "Grande", kg: 40, total_cents: 68000 },
  ]);
  assert.equal(r.total, 124000);
  assert.equal(r.kg, 72.5);
  assert.deepEqual(r.clientes.map((c) => c.nome), ["Restaurante", "Peixaria"]);
  assert.equal(r.clientes[1].precoKg, 56000 / 32.5);
  assert.equal(Math.round(r.clientes[0].participacao), 55);
  assert.deepEqual(r.meses.map((m) => m.chave), ["2026-09", "2026-10"]);
  assert.equal(r.produtos[0].nome, "Caixa 20 kg · peixe grande");
  assert.deepEqual(r.classes.map((c) => [c.nome, c.kg]), [["Grande", 60], ["Médio", 12.5]]);
});

test("preço do cliente vence o geral e respeita a vigência", () => {
  const listas = [{ id: "pd", nome: "Tabela padrão", padrao: true, ajuste_pct: 0, ativa: true }];
  const preco = precoVigente([
    { produto_id: "cx", cliente_id: null, lista_id: "pd", preco_cents: 18000, vigencia: "[2026-09-01,2026-10-01)" },
    { produto_id: "cx", cliente_id: null, lista_id: "pd", preco_cents: 19000, vigencia: "[2026-10-01,)" },
    { produto_id: "cx", cliente_id: "m", lista_id: "pd", preco_cents: "17500", vigencia: "[2026-09-01,)" },
  ], "2026-10-26", listas);
  assert.equal(preco("cx"), 19000);
  assert.equal(preco("cx", "m"), 17500);
  assert.equal(preco("cx", "outro"), 19000);
  assert.equal(preco("dz"), null);
});

test("tabela de preço: preço próprio, senão a padrão com o ajuste", () => {
  const listas = [
    { id: "pd", nome: "Tabela padrão", padrao: true, ajuste_pct: 0, ativa: true },
    { id: "at", nome: "Atacado", padrao: false, ajuste_pct: "-10", ativa: true },
    { id: "vr", nome: "Varejo", padrao: false, ajuste_pct: 15, ativa: false },
  ];
  const preco = precoVigente([
    { produto_id: "dz", cliente_id: null, lista_id: "pd", preco_cents: 1000, vigencia: "[2026-10-01,)" },
    { produto_id: "cx", cliente_id: null, lista_id: "pd", preco_cents: 30000, vigencia: "[2026-10-01,)" },
    { produto_id: "cx", cliente_id: null, lista_id: "at", preco_cents: 25000, vigencia: "[2026-10-01,)" },
    { produto_id: "cx", cliente_id: "m", lista_id: "pd", preco_cents: 24000, vigencia: "[2026-10-01,)" },
  ], "2026-10-26", listas);
  assert.equal(preco("cx", null, "at"), 25000);
  assert.equal(preco("dz", null, "at"), 900);
  assert.equal(preco("cx", "m", "at"), 24000);
  assert.equal(preco("dz", null, "vr"), 1000, "tabela inativa não vale");
  assert.equal(preco("dz", null, "pd"), 1000);
});

test("pagamento do PDV: troco só em dinheiro", () => {
  assert.deepEqual(fecharPagamento(3000, [{ forma: "dinheiro", valor_cents: 2000 }, { forma: "pix", valor_cents: 1500 }]),
    { pago: 3500, falta: 0, troco: 500, erro: null, pronto: true });
  assert.equal(fecharPagamento(3000, [{ forma: "pix", valor_cents: 1000 }]).falta, 2000);
  const pix = fecharPagamento(3000, [{ forma: "pix", valor_cents: 5000 }]);
  assert.equal(pix.pronto, false);
  assert.ok(pix.erro);
});

test("notas sugeridas acima do total", () => {
  assert.deepEqual(notasSugeridas(3700), [3700, 4000, 5000, 10000]);
  assert.deepEqual(notasSugeridas(5000), [5000, 6000, 10000, 20000]);
});

test("link do WhatsApp com DDI do Brasil", () => {
  assert.equal(linkWhatsapp("(45) 99999-0000", "Olá"), "https://wa.me/5545999990000?text=Ol%C3%A1");
  assert.equal(linkWhatsapp(null, "a b"), "https://wa.me/?text=a%20b");
});

test("ajuste da tabela arredonda igual ao banco (numeric, sem erro de float)", () => {
  // round(650 * 1.15) = round(747.5) = 748 no Postgres; em float dá 747.4999…
  assert.equal(aplicarAjuste(650, 15), 748);
  assert.equal(aplicarAjuste(550, "-7"), 512);
  assert.equal(aplicarAjuste(650, 13), 735);
  assert.equal(aplicarAjuste(550, "13.00"), 622);
  assert.equal(aplicarAjuste(1000, "-10"), 900);
});

test("curva ABC: A até 80% do faturamento, B até 95%, C o resto", () => {
  const r = resumoVendas([
    { mes: "2026-10-01", cliente_id: "a", cliente: "Atacado", produto: "Cx", classe: null, kg: 1, total_cents: 7000 },
    { mes: "2026-10-01", cliente_id: "b", cliente: "Mercado", produto: "Cx", classe: null, kg: 1, total_cents: 1500 },
    { mes: "2026-10-01", cliente_id: "c", cliente: "Padaria", produto: "Cx", classe: null, kg: 1, total_cents: 1000 },
    { mes: "2026-10-01", cliente_id: "d", cliente: "Feira", produto: "Cx", classe: null, kg: 1, total_cents: 500 },
  ]);
  assert.deepEqual(curvaAbc(r.clientes).map((c) => [c.nome, c.abc]), [["Atacado", "A"], ["Mercado", "A"], ["Padaria", "B"], ["Feira", "C"]]);
  assert.equal(curvaAbc(r.clientes)[2].acumulado, 95);
  assert.deepEqual(curvaAbc([]), []);
});

test("vendas por cidade e por estado, sem cidade fica como não informado", () => {
  const r = resumoVendas([
    { mes: "2026-10-01", cliente_id: "a", cliente: "A", produto: "Cx", classe: null, kg: 10, total_cents: 300, cidade: "Manaus", uf: "AM" },
    { mes: "2026-10-01", cliente_id: "b", cliente: "B", produto: "Cx", classe: null, kg: 10, total_cents: 200, cidade: "manaus ", uf: "am" },
    { mes: "2026-10-01", cliente_id: "c", cliente: "C", produto: "Cx", classe: null, kg: 10, total_cents: 100, cidade: "Belém", uf: "PA" },
    { mes: "2026-10-01", cliente_id: "d", cliente: "D", produto: "Cx", classe: null, kg: 10, total_cents: 50 },
  ]);
  assert.deepEqual(r.cidades.map((c) => [c.nome, c.total]), [["Manaus/AM", 500], ["Belém/PA", 100], ["Não informada", 50]]);
  assert.deepEqual(r.estados.map((c) => [c.nome, c.total]), [["AM", 500], ["PA", 100], ["Não informado", 50]]);
});

test("clientes sem comprar há mais de N dias, do mais antigo para o mais recente", () => {
  const pedidos = [
    { cliente_id: "a", ultima_compra: "2026-10-20", pedidos: 2, total_cents: 1500 },
    { cliente_id: "b", ultima_compra: "2026-08-01", pedidos: 2, total_cents: "3000" },
    { cliente_id: "c", ultima_compra: "2026-08-29", pedidos: 1, total_cents: 700 },
  ];
  const clientes = [
    { id: "a", nome: "Ativo", cidade: null, uf: null, telefone: null },
    { id: "b", nome: "Sumido", cidade: "Manaus", uf: "AM", telefone: "92999998888" },
    { id: "c", nome: "No limite", cidade: null, uf: null, telefone: null },
    { id: "d", nome: "Nunca comprou", cidade: null, uf: null, telefone: null },
  ];
  const r = clientesSemComprar(pedidos, clientes, "2026-10-28", 60);
  assert.deepEqual(r.map((c) => [c.nome, c.dias, c.pedidos, c.total]), [["Sumido", 88, 2, 3000]]);
  assert.equal(r[0].ultimaCompra, "2026-08-01");
  assert.equal(clientesSemComprar(pedidos, clientes, "2026-10-28", 59).length, 2);
});
