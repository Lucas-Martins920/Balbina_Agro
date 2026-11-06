import { test } from "node:test";
import assert from "node:assert/strict";
import { centavos, dataIso, dividirPacote, tipoContaPeloNome } from "./importacao.ts";
import { desdeNiboValido, limiteNibo, pacoteNibo, type DadosNibo, type NiboExtrato } from "./importacao-nibo.ts";

limiteNibo.intervaloMs = 0;
import { lerCsv, pacotePlanilhaContatos } from "./importacao-planilha.ts";

test("valores e datas em formato brasileiro e ISO", () => {
  assert.equal(centavos("1.234,56"), 123456);
  assert.equal(centavos("R$ 10,5"), 1050);
  assert.equal(centavos(12.345), 1235);
  assert.equal(dataIso("05/03/2026"), "2026-03-05");
  assert.equal(dataIso("2026-03-05T00:00:00"), "2026-03-05");
  assert.equal(tipoContaPeloNome("CreditCard", "Cartão Sicredi"), "cartao_credito");
  assert.equal(tipoContaPeloNome(undefined, "Caixa da piscicultura"), "caixinha");
  assert.equal(tipoContaPeloNome(undefined, "Caixa Econômica"), "corrente");
});

test("planilha de clientes do LC", () => {
  const csv = "codigo_lc;nome;cpf_cnpj;telefone;endereco;numero;bairro;cep;cidade;uf\n" +
    "132;CRISTINA FELIX;32449440000117;(92)93014-085;AM 240;KM28;ZONA RURAL;69735-000;Presidente Figueiredo;AM\n" +
    '134;"ABEL; o filho";;;;;;;Manaus;am\n';
  const p = pacotePlanilhaContatos(lerCsv(csv), "cliente", "lc");
  assert.equal(p.contatos?.length, 2);
  assert.deepEqual(p.contatos?.[0], {
    chave: "cliente:132", nome: "CRISTINA FELIX", tipos: ["cliente"], cpf_cnpj: "32449440000117", inscricao_estadual: undefined,
    email: undefined, telefone: "(92)93014-085", cidade: "Presidente Figueiredo", uf: "AM",
    endereco: { logradouro: "AM 240", numero: "KM28", bairro: "ZONA RURAL", cep: "69735000" },
  });
  assert.equal(p.contatos?.[1].nome, "ABEL; o filho");
  assert.equal(p.contatos?.[1].uf, "AM");
});

test("NIBO: agendamentos com baixa, lançamento avulso e transferência", () => {
  const d: DadosNibo = {
    categorias: [
      { id: "c1", name: "Venda de peixe", type: "x", group: { name: "Receitas operacionais" } },
      { id: "c2", name: "Milho", group: { name: "Custos operacionais" }, subgroupName: "Insumos" },
      { id: "c3", name: "Rendimentos", type: "in" },
    ],
    centros: [{ costCenterId: "cc1", description: "Viveiro 1" }],
    contas: [{ id: "a1", name: "Sicredi", type: "Checking", openBalance: 1500.5, dateOfOpenBalance: "2026-01-01T00:00:00", bankNumber: 748 }],
    clientes: [{ id: "p1", name: "Mercado", document: { number: "11.222.333/0001-81" }, address: { city: "Manaus", state: "am", number: 0 } }],
    fornecedores: [{ id: "p2", name: "Cerealista" }],
    debitos: [{ scheduleId: "s1", dueDate: "2026-01-15T00:00:00", value: -500, description: "Milho jan",
      stakeholder: { id: "p2", name: "Cerealista" }, categories: [{ categoryId: "c2", value: -500 }],
      costCenters: [{ costCenterDescription: "Viveiro 1", percent: 100 }] }],
    creditos: [{ scheduleId: "s2", dueDate: "2026-01-10", value: 1000, stakeholder: { id: "p1", name: "Mercado" }, categories: [{ categoryId: "c1" }] }],
    pagamentos: [
      { entryId: "e1", scheduleId: "s1", date: "2026-01-16", value: -505, account: { id: "a1", name: "Sicredi" } },
      { entryId: "e2", date: "2026-01-20", value: -200, isTransfer: true, account: { id: "a1", name: "Sicredi" } },
    ],
    recebimentos: [
      { entryId: "e3", date: "2026-01-20", value: 200, isTransfer: true, account: { id: "a2", name: "Caixa" } },
      { entryId: "e4", date: "2026-01-05", value: 12.3, description: "Rendimento", account: { id: "a1", name: "Sicredi" }, categories: [{ categoryId: "c3", value: 12.3 }] },
    ],
  };
  const p = pacoteNibo(d);
  assert.deepEqual(p.categorias?.find((c) => c.nome === "Milho"), { nome: "Milho", sentido: "saida", grupo: "custo_operacional", pai: "Insumos" });
  assert.equal(p.categorias?.find((c) => c.nome === "Venda de peixe")?.sentido, "entrada");
  assert.equal(p.categorias?.find((c) => c.nome === "Rendimentos")?.sentido, "entrada");
  assert.equal(p.contas?.[0].saldo_inicial_cents, 150050);
  assert.equal(p.contas?.[0].banco_codigo, "748");
  assert.equal(p.contatos?.[0].cpf_cnpj, "11222333000181");
  assert.equal(p.contatos?.[0].endereco?.numero, undefined);
  const s1 = p.titulos?.find((t) => t.chave === "agendamento:s1");
  assert.equal(s1?.tipo, "pagar");
  assert.equal(s1?.valor_cents, 50000);
  assert.deepEqual(s1?.rateio, [{ categoria: "Milho", categoria_pai: "Insumos", centro_custo: "Viveiro 1", valor_cents: 50000 }]);
  assert.deepEqual(s1?.baixas, [{ chave: "lancamento:e1", conta_chave: "a1", conta: "Sicredi", data: "2026-01-16", valor_cents: 50500 }]);
  assert.equal(p.titulos?.find((t) => t.chave === "agendamento:s2")?.rateio[0].valor_cents, 100000);
  const avulso = p.titulos?.find((t) => t.chave === "lancamento:e4");
  assert.equal(avulso?.tipo, "receber");
  assert.equal(avulso?.baixas[0].valor_cents, 1230);
  assert.equal(p.transferencias?.length, 1);
  assert.equal(p.transferencias?.[0].origem_chave, "a1");
  assert.equal(p.transferencias?.[0].destino_chave, "a2");
  assert.equal(dividirPacote(p, 1).length, 1 + 2 + 3 + 1);
});

test("NIBO: lê mês a mês, segue o count mesmo com páginas menores e filtra pela data inicial", async () => {
  const { lerNibo, mesesEntre } = await import("./importacao-nibo.ts");
  assert.deepEqual(mesesEntre("2025-12-31", "2026-02-01"), [{ ano: 2025, mes: 12 }, { ano: 2026, mes: 1 }, { ano: 2026, mes: 2 }]);
  const pagamentos = Array.from({ length: 250 }, (_, i) => ({ entryId: `p${i}`, date: i === 0 ? "2025-12-30T00:00:00" : "2026-01-05T00:00:00", value: -1 }));
  const urls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (entrada: string) => {
    const url = new URL(entrada);
    urls.push(decodeURIComponent(url.search));
    const skip = Number(url.searchParams.get("$skip"));
    const filtro = url.searchParams.get("$filter") ?? "";
    let itens: unknown[] = [];
    if (url.pathname.endsWith("/payments") && /year\(date\) eq 2026 and month\(date\) eq 1|year\(date\) eq 2025 and month\(date\) eq 12/.test(filtro)) {
      const doMes = pagamentos.filter((p) => (filtro.includes("2025") ? p.date.startsWith("2025-12") : p.date.startsWith("2026-01")));
      itens = doMes.slice(skip, skip + 100); // a API devolve só 100 por página
      return new Response(JSON.stringify({ items: itens, count: doMes.length }));
    }
    return new Response(JSON.stringify({ items: [], count: 0 }));
  }) as typeof fetch;
  try {
    const d = await lerNibo("token-de-teste", "2025-12-31");
    assert.equal(d.pagamentos.length, 249, "todos de janeiro, sem o de 30/12");
    assert.ok(urls.some((u) => u.includes("$skip=200")), "pagina até o count");
  } finally {
    globalThis.fetch = original;
  }
});

test("data inicial do NIBO: só datas reais dos últimos 10 anos", () => {
  assert.equal(desdeNiboValido("2024-01-01", "2026-10-28"), true);
  assert.equal(desdeNiboValido("2016-10-28", "2026-10-28"), true);
  assert.equal(desdeNiboValido("2016-10-27", "2026-10-28"), false);
  assert.equal(desdeNiboValido("0000-01-01", "2026-10-28"), false);
  assert.equal(desdeNiboValido("2026-13-01", "2026-10-28"), false);
  assert.equal(desdeNiboValido("2026-02-30", "2026-10-28"), false);
  assert.equal(desdeNiboValido("2026-10-29", "2026-10-28"), false);
  assert.equal(desdeNiboValido("ontem", "2026-10-28"), false);
});

test("NIBO: abertura pelos pagamentos e recebimentos, extrato só para comparar, conciliação e auditoria", async () => {
  const { auditarNibo, chavesSincronizacao, conciliacaoNibo, diagnosticarNibo } = await import("./importacao-nibo.ts");
  const d: DadosNibo = {
    categorias: [], centros: [], clientes: [], fornecedores: [], debitos: [], creditos: [],
    contas: [
      { id: "a1", name: "Banco", openBalance: 999, dateOfOpenBalance: "2020-01-01" },
      { id: "a2", name: "Caixa", openBalance: 0, dateOfOpenBalance: "2020-01-01" },
    ],
    pagamentos: [
      { entryId: "p1", date: "2026-01-05", value: 100, account: { id: "a1", name: "Banco" } },
      { entryId: "t-out", date: "2026-01-07", value: 200, isTransfer: true, account: { id: "a2", name: "Caixa" } },
      // transferência para uma conta que não veio do NIBO: sai desta conta mesmo
      { entryId: "t-sem-par", date: "2026-01-08", value: 30, isTransfer: true, account: { id: "a1", name: "Banco" } },
    ],
    recebimentos: [
      { entryId: "r1", date: "2026-01-06", value: 500, account: { id: "a2", name: "Caixa" } },
      { entryId: "t-in", date: "2026-01-07", value: 200, isTransfer: true, account: { id: "a1", name: "Banco" } },
    ],
    desde: "2025-12-31",
    saldos: [{ accountId: "a1", balance: 1000 }, { accountId: "a2", balance: 300 }],
    extratos: {
      a1: [
        { entryId: "p1", date: "2026-01-05", value: 100, isReconciliated: true, currentBalance: 900 },
        { entryId: "t-in", date: "2026-01-07", value: 200, isTransfer: true, type: "Credit", isReconciled: true, currentBalance: 1100 } as NiboExtrato,
        // linha só do extrato: não entra como lançamento (o sinal dela não é confiável)
        { entryId: "tarifa", date: "2026-01-08", value: -9.9, description: "Tarifa", currentBalance: 1090.1 },
      ],
      a2: [
        { entryId: "r1", date: "2026-01-06", value: 500 },
        { entryId: "t-out", date: "2026-01-07", value: -200, isTransfer: true },
      ],
    },
    pendentes: { a1: [{ accountEntry: { id: "b1", date: "2026-01-09", value: -50, description: "PIX ENVIADO" } }] },
  };
  const p = pacoteNibo(d);
  // Banco: 1000 hoje; no período -100 +200 -30 = +70 → abertura 930 em 31/12/2025
  // Caixa: 300 hoje; no período +500 -200 = +300 → abertura 0
  assert.deepEqual(p.contas?.map((c) => [c.chave, c.saldo_inicial_cents, c.saldo_inicial_data]),
    [["a1", 93000, "2025-12-31"], ["a2", 0, "2025-12-31"]]);
  assert.equal(p.transferencias?.length, 1);
  assert.deepEqual(p.transferencias?.[0].lancamentos, ["t-out", "t-in"]);
  assert.equal(p.transferencias?.[0].origem_chave, "a2");
  assert.equal(p.titulos?.find((t) => t.chave === "lancamento:tarifa"), undefined, "linha só do extrato não entra");
  const semPar = p.titulos?.find((t) => t.chave === "lancamento:t-sem-par");
  assert.deepEqual([semPar?.tipo, semPar?.descricao, semPar?.baixas[0].conta_chave], ["pagar", "Transferência", "a1"]);

  const sinc = chavesSincronizacao(p, "2025-12-31");
  assert.ok(sinc.titulos.includes("lancamento:p1"));
  assert.deepEqual(sinc.baixas.find((b) => b.chave === "lancamento:p1"), { chave: "lancamento:p1", conta_chave: "a1", data: "2026-01-05", valor_cents: 10000 });
  assert.deepEqual(sinc.transferencias, [{ chave: "transferencia:t-out:t-in", origem_chave: "a2", destino_chave: "a1", data: "2026-01-07", valor_cents: 20000 }]);

  const conc = conciliacaoNibo(d);
  const banco = conc.find((c) => c.conta_chave === "a1")!;
  assert.deepEqual(banco.conciliados.map((m) => [m.id_externo, m.valor_cents, m.baixa_chave, m.lancamento]),
    [["nibo:p1", -10000, "lancamento:p1", undefined], ["nibo:t-in", 20000, "lancamento:t-in", "t-in"]]);
  assert.deepEqual(banco.pendentes, [{ id_externo: "nibo-banco:b1", data: "2026-01-09", valor_cents: -5000, descricao: "PIX ENVIADO" }]);

  diagnosticarNibo(d);
  assert.deepEqual(
    [d.diag?.a1.listas_linhas, d.diag?.a1.extrato_nas_listas, d.diag?.a1.extrato_transferencias, d.diag?.a1.extrato_negativas,
      d.diag?.a1.extrato_conciliadas, d.diag?.a1.extrato_ultimo_saldo],
    [3, 2, 1, 1, 2, 109010]);

  const a = auditarNibo(d, [
    { chave: "a1", nome: "Banco", saldo_cents: 100000, movimentos: [{ data: "2026-01-05", valor_cents: -10000 }, { data: "2026-01-07", valor_cents: 20000 }, { data: "2026-01-08", valor_cents: -3000 }] },
    { chave: "a2", nome: "Caixa", saldo_cents: 25000, movimentos: [{ data: "2026-01-06", valor_cents: 45000 }, { data: "2026-01-07", valor_cents: -20000 }] },
  ]);
  assert.equal(a[0].diferenca_cents, 0);
  assert.equal(a[0].total_dias_diferentes, 0);
  assert.equal(a[0].nibo_extrato_cents, 9010, "soma do extrato fica para comparar");
  assert.equal(a[1].diferenca_cents, -5000);
  assert.deepEqual(a[1].dias, [{ data: "2026-01-06", nibo_cents: 50000, balbina_cents: 45000 }]);
});

test("NIBO: lê saldo, extrato mês a mês e pendentes de cada conta", async () => {
  const { lerNibo } = await import("./importacao-nibo.ts");
  const urls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (entrada: string) => {
    const url = new URL(entrada);
    urls.push(url.pathname + decodeURIComponent(url.search));
    if (url.pathname.endsWith("/accounts")) return new Response(JSON.stringify({ items: [{ id: "a1", name: "Banco" }], count: 1 }));
    if (url.pathname.endsWith("/accounts/views/balance")) return new Response(JSON.stringify({ items: [{ accountId: "a1", balance: 10 }], count: 1 }));
    if (url.pathname.endsWith("/views/statement")) {
      return new Response(JSON.stringify({ items: [{ entryId: "x", date: "2026-02-03", value: 1 }], count: 1 }));
    }
    if (url.pathname.endsWith("/reconciliation")) return new Response(JSON.stringify({ items: [{ accountEntry: { id: "b1" } }], count: 1 }));
    return new Response(JSON.stringify({ items: [], count: 0 }));
  }) as typeof fetch;
  try {
    const d = await lerNibo("token-de-teste", "2025-12-31");
    assert.deepEqual(d.saldos, [{ accountId: "a1", balance: 10 }]);
    assert.equal(d.extratos?.a1.length, 1);
    assert.equal(d.pendentes?.a1.length, 1);
    assert.equal(urls.filter((u) => u.includes("/views/statement")).length, 1, "extrato do período todo numa consulta");
    assert.ok(urls.some((u) => u.includes("/accounts/a1/views/statement?startDate=2025-12-31&endDate=")));
  } finally {
    globalThis.fetch = original;
  }
});

test("NIBO: limite de consultas (429) espera e tenta de novo; sem folga, para com mensagem clara", async () => {
  const { lerNibo } = await import("./importacao-nibo.ts");
  const original = globalThis.fetch;
  const esperaOriginal = limiteNibo.esperaMaximaMs;
  limiteNibo.esperaMaximaMs = 5;
  let recusas = 2;
  let chamadas = 0;
  globalThis.fetch = (async () => {
    chamadas++;
    if (recusas-- > 0) return new Response("", { status: 429, headers: { "retry-after": "1" } });
    return new Response(JSON.stringify({ items: [], count: 0 }));
  }) as typeof fetch;
  try {
    const d = await lerNibo("token-de-teste", "2026-10-01");
    assert.equal(d.categorias.length, 0);
    assert.ok(chamadas > 2, "repetiu depois do 429");
    globalThis.fetch = (async () => new Response("", { status: 429 })) as typeof fetch;
    await assert.rejects(lerNibo("token-de-teste", "2026-10-01"), /limitou o número de consultas/);
  } finally {
    globalThis.fetch = original;
    limiteNibo.esperaMaximaMs = esperaOriginal;
  }
});

test("NIBO: extrato vazio não muda a abertura pelos pagamentos e recebimentos", async () => {
  const { auditarNibo } = await import("./importacao-nibo.ts");
  const d: DadosNibo = {
    categorias: [], centros: [], clientes: [], fornecedores: [], debitos: [], creditos: [],
    contas: [{ id: "a1", name: "Caixa", openBalance: 50, dateOfOpenBalance: "2020-01-01" }],
    pagamentos: [
      { entryId: "p1", date: "2026-01-05", value: -100, account: { id: "a1" } },
      { entryId: "p0", date: "2025-12-01", value: -999, account: { id: "a1" } },
      { entryId: "t1", date: "2026-01-07", value: 40, isTransfer: true, account: { id: "a1" } },
    ],
    recebimentos: [{ entryId: "r1", date: "2026-01-06", value: 500, account: { id: "a1" } }],
    desde: "2025-12-31", saldos: [{ accountId: "a1", balance: 1000 }], extratos: { a1: [] },
    diag: { a1: { saldo_informado: true, extrato_linhas: 0, extrato_chaves: ["items", "count"] } },
  };
  const p = pacoteNibo(d);
  // 1000 hoje; no período -100 +500 -40 = +360 → abertura 640 em 31/12/2025
  assert.deepEqual([p.contas?.[0].saldo_inicial_cents, p.contas?.[0].saldo_inicial_data], [64000, "2025-12-31"]);
  const [a] = auditarNibo(d, [{ chave: "a1", nome: "Caixa", saldo_cents: 110000, abertura_cents: 64000, movimentos: [
    { data: "2026-01-05", valor_cents: -10000, importado: true }, { data: "2026-01-06", valor_cents: 50000, importado: true },
    { data: "2026-01-07", valor_cents: -4000, importado: true }, { data: "2026-01-08", valor_cents: 10000, importado: false },
  ] }]);
  assert.equal(a.fonte, "pagamentos e recebimentos");
  assert.equal(a.nibo_periodo_cents, 36000);
  assert.equal(a.balbina_proprio_cents, 10000);
  assert.equal(a.diferenca_cents, 10000, "a diferença é o lançamento feito só no Balbina");
  assert.deepEqual(a.dias, [{ data: "2026-01-08", nibo_cents: 0, balbina_cents: 10000 }]);
  assert.equal(a.diag?.extrato_linhas, 0);
});
