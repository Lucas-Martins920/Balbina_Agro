import { test } from "node:test";
import assert from "node:assert/strict";
import { montarCaixa, montarVenda, mudarQuantidade, tabelas, textoCupom } from "./caixa.ts";
import type { DadosPdv } from "./tipos.ts";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CLASSE = U(90);
const dados: DadosPdv = {
  pontos: [{ id: U(80), nome: "Piscicultura", sede: true }],
  ponto: { id: U(80), nome: "Piscicultura", sede: true },
  clientes: [{ id: U(1), nome: "Mercadinho", telefone: null, cpf_cnpj: null, lista_preco_id: U(51) }],
  produtos: [
    { id: U(10), nome: "Tambaqui grande caixa 20 kg", unidade: "cx", fator_kg: 20, classe_peixe_id: CLASSE, disponivel: 2, kg_classe: 40 },
    { id: U(11), nome: "Tambaqui grande (kg)", unidade: "kg", fator_kg: 1, classe_peixe_id: CLASSE, disponivel: 40, kg_classe: 40 },
  ],
  precos: [
    { produto_id: U(10), lista_id: U(50), cliente_id: null, preco_cents: 20000, vigencia: "[2026-01-01,)" },
    { produto_id: U(11), lista_id: U(50), cliente_id: null, preco_cents: 2000, vigencia: "[2026-01-01,)" },
    { produto_id: U(11), lista_id: U(51), cliente_id: null, preco_cents: 1800, vigencia: "[2026-01-01,)" },
  ],
  listas: [{ id: U(50), nome: "Padrão", padrao: true, ativa: true }, { id: U(51), nome: "Atacado", padrao: false, ativa: true }],
  contas: [{ id: U(70), nome: "Banco", tipo: "corrente" }],
  vendido_hoje: 0,
} as unknown as DadosPdv;
const HOJE = "2026-11-03";

test("caixa e kg tiram do mesmo peixe: com 2 caixas no carrinho o kg esgota", () => {
  const um = mudarQuantidade(dados, {}, U(10), 2);
  assert.equal(um.erro, null);
  const dois = mudarQuantidade(dados, um.carrinho, U(11), 1);
  assert.equal(dois.carrinho[U(11)], 0);
  assert.match(dois.erro ?? "", /Sem estoque/);
  const caixa = montarCaixa(dados, null, "", dois.carrinho, HOJE);
  assert.equal(caixa.grupos.flatMap((g) => g.itens).find((i) => i.id === U(11))?.resta, 0);
});

test("acima do estoque o caixa segura no máximo e avisa", () => {
  const r = mudarQuantidade(dados, {}, U(10), 5);
  assert.equal(r.carrinho[U(10)], 2);
  assert.match(r.erro ?? "", /Só há estoque para 2 cx/);
  const kg = mudarQuantidade(dados, {}, U(11), 41.5);
  assert.equal(kg.carrinho[U(11)], 40);
  assert.match(kg.erro ?? "", /Só há estoque para 40 kg/);
});

test("seções por embalagem e preço da tabela do cliente", () => {
  const cliente = dados.clientes[0];
  const t = tabelas(dados, cliente, null);
  assert.equal(t.tabela, U(51));
  const caixa = montarCaixa(dados, cliente, t.tabela, { [U(11)]: 2 }, HOJE);
  assert.deepEqual(caixa.grupos.map((g) => g.embalagem), ["kg", "caixa"]);
  assert.equal(caixa.total, 3600);
  const fracao = montarCaixa(dados, cliente, t.tabela, { [U(11)]: 1.25 }, HOJE);
  assert.equal(fracao.total, 2250); // 1,25 kg × R$ 18,00
});

test("venda só fecha com o total pago; troco só de dinheiro; Pix pede conta", () => {
  const t = tabelas(dados, null, null);
  const caixa = montarCaixa(dados, null, t.tabela, { [U(11)]: 1 }, HOJE);
  const base = { clientId: U(99), cliente: null, tabela: t.tabela, tabelaCliente: t.doCliente, conta: "", ponto: U(80) };
  assert.ok("erro" in montarVenda(caixa, { ...base, pagamentos: [{ forma: "dinheiro", valor_cents: 1000 }] }));
  assert.ok("erro" in montarVenda(caixa, { ...base, pagamentos: [{ forma: "pix", valor_cents: 5000 }] }));
  const semConta = montarVenda(caixa, { ...base, pagamentos: [{ forma: "pix", valor_cents: 2000 }] });
  assert.ok("erro" in semConta);
  assert.match(semConta.erro, /conta/);
  const ok = montarVenda(caixa, { ...base, pagamentos: [{ forma: "dinheiro", valor_cents: 5000 }] });
  assert.ok("ok" in ok);
  assert.deepEqual(ok.ok.itens, [{ produto_id: U(11), quantidade: 1 }]);
  assert.equal(ok.ok.lista_id, null);
  assert.equal(ok.ok.ponto_venda_id, U(80));
});

test("tabela trocada no caixa vai para o servidor calcular o preço", () => {
  const t = tabelas(dados, null, U(51));
  const caixa = montarCaixa(dados, null, t.tabela, { [U(11)]: 1 }, HOJE);
  const r = montarVenda(caixa, { clientId: U(99), cliente: null, tabela: t.tabela, tabelaCliente: t.doCliente, conta: U(70), ponto: null, pagamentos: [{ forma: "cartao", valor_cents: 1800 }] });
  assert.ok("ok" in r);
  assert.equal(r.ok.lista_id, U(51));
  assert.equal(r.ok.pagamentos[0].conta_id, U(70));
});

test("cupom lista itens, pagamento e troco", () => {
  const txt = textoCupom({ numero: 7, total_cents: 2000, troco_cents: 3000, cliente: "Consumidor final", ponto: null, itens: [{ nome: "Tambaqui (kg)", quantidade: 1.5, preco: 2000 }], pagamentos: [{ forma: "dinheiro", valor_cents: 5000 }] }, (c) => `R$ ${c / 100}`);
  assert.match(txt, /Venda nº 7/);
  assert.match(txt, /1,5 × Tambaqui \(kg\)/);
  assert.match(txt, /Troco {2}R\$ 30/);
});
