// Regras da API pública (/api/v1): escopos, eventos, token, paginação, validação do corpo e assinatura
// dos webhooks. Sem dependência do Next nem do Supabase, para rodar nos testes.
// O banco tem os mesmos escopos e eventos em app.api_escopos() e app.api_eventos()
// (supabase/migrations/20261028233000_api_publica.sql).
import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";

export type Escopo = { chave: string; nome: string; grupo: string };

export const ESCOPOS: Escopo[] = [
  { chave: "contas-a-pagar.ver", nome: "Ler contas a pagar", grupo: "Financeiro" },
  { chave: "contas-a-pagar.editar", nome: "Lançar e baixar contas a pagar", grupo: "Financeiro" },
  { chave: "contas-a-receber.ver", nome: "Ler contas a receber", grupo: "Financeiro" },
  { chave: "contas-a-receber.editar", nome: "Lançar e baixar contas a receber", grupo: "Financeiro" },
  { chave: "contas.ver", nome: "Ler contas, saldos e extrato", grupo: "Financeiro" },
  { chave: "categorias.ver", nome: "Ler categorias", grupo: "Financeiro" },
  { chave: "centros-de-custo.ver", nome: "Ler centros de custo", grupo: "Financeiro" },
  { chave: "contatos.ver", nome: "Ler clientes e fornecedores", grupo: "Cadastros" },
  { chave: "contatos.editar", nome: "Incluir e editar clientes e fornecedores", grupo: "Cadastros" },
  { chave: "produtos.ver", nome: "Ler produtos", grupo: "Cadastros" },
  { chave: "produtos.editar", nome: "Incluir e editar produtos", grupo: "Cadastros" },
  { chave: "vendas.ver", nome: "Ler pedidos de venda", grupo: "Comercial" },
  { chave: "estoque.ver", nome: "Ler saldos de estoque", grupo: "Estoque" },
];

export const ESCOPOS_VALIDOS = new Set(ESCOPOS.map((e) => e.chave));

export type Evento = { chave: string; nome: string; modulo: string };

export const EVENTOS: Evento[] = [
  { chave: "lancamento.criado", nome: "Título a pagar ou a receber incluído", modulo: "contas-a-pagar" },
  { chave: "lancamento.alterado", nome: "Título alterado (baixa, edição, exclusão)", modulo: "contas-a-pagar" },
  { chave: "venda.criada", nome: "Pedido de venda incluído", modulo: "vendas" },
  { chave: "venda.alterada", nome: "Pedido de venda alterado (faturado, cancelado...)", modulo: "vendas" },
  { chave: "contato.criado", nome: "Cliente ou fornecedor incluído", modulo: "contatos" },
  { chave: "contato.alterado", nome: "Cliente ou fornecedor alterado", modulo: "contatos" },
  { chave: "produto.criado", nome: "Produto incluído", modulo: "produtos" },
  { chave: "produto.alterado", nome: "Produto alterado", modulo: "produtos" },
  { chave: "estoque.movimentado", nome: "Movimento de estoque", modulo: "estoque" },
];

export const EVENTOS_VALIDOS = new Set(EVENTOS.map((e) => e.chave));

// O que a chave pode fazer agora: escopo dado pelo master E módulo dentro do plano da empresa.
// "x.editar" inclui "x.ver". modulos null = o plano libera todos.
export type AcessoApi = { escopos: string[]; modulos: string[] | null };

export function escopoLiberado(acesso: AcessoApi, escopo: string): boolean {
  const [modulo, acao] = escopo.split(".");
  if (acesso.modulos && !acesso.modulos.includes(modulo)) return false;
  return acesso.escopos.includes(escopo) || (acao === "ver" && acesso.escopos.includes(`${modulo}.editar`));
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

const TOKEN = /^balbina_[A-Za-z0-9_-]{43}$/;

export function gerarToken() {
  return `balbina_${randomBytes(32).toString("base64url")}`;
}

export function prefixoToken(token: string) {
  return `${token.slice(0, 13)}…`;
}

// Aceita "Authorization: Bearer <token>" ou "X-API-Key: <token>".
export function lerToken(authorization: string | null, apiKey: string | null): string | null {
  const bruto = (authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? apiKey ?? "").trim();
  return TOKEN.test(bruto) ? bruto : null;
}

// ---------------------------------------------------------------------------
// Consulta: paginação e filtros
// ---------------------------------------------------------------------------

export type Paginacao = { pagina: number; porPagina: number; inicio: number; fim: number };

export function lerPaginacao(params: URLSearchParams): Paginacao | { erro: string } {
  const pagina = params.has("pagina") ? Number(params.get("pagina")) : 1;
  const porPagina = params.has("por_pagina") ? Number(params.get("por_pagina")) : 100;
  if (!Number.isInteger(pagina) || pagina < 1) return { erro: "pagina deve ser um inteiro a partir de 1" };
  if (!Number.isInteger(porPagina) || porPagina < 1 || porPagina > 500) return { erro: "por_pagina deve ser um inteiro de 1 a 500" };
  const inicio = (pagina - 1) * porPagina;
  return { pagina, porPagina, inicio, fim: inicio + porPagina - 1 };
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function dataValida(texto: unknown): texto is string {
  if (typeof texto !== "string" || !DATA.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

export function instanteValido(texto: unknown): texto is string {
  return typeof texto === "string" && INSTANTE.test(texto) && !Number.isNaN(Date.parse(texto));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidValido(texto: unknown): texto is string {
  return typeof texto === "string" && UUID.test(texto);
}

// ---------------------------------------------------------------------------
// Corpo das gravações
// ---------------------------------------------------------------------------

type Resultado<T> = { ok: T } | { erro: string };
type Corpo = Record<string, unknown>;

const FORMAS = ["boleto", "pix", "ted", "dinheiro", "cartao", "debito_automatico", "cheque"];

function objeto(corpo: unknown): corpo is Corpo {
  return typeof corpo === "object" && corpo !== null && !Array.isArray(corpo);
}

function centavos(valor: unknown, zeroPode = false): valor is number {
  return Number.isSafeInteger(valor) && (valor as number) >= (zeroPode ? 0 : 1);
}

function textoOpcional(valor: unknown, max: number): string | null | undefined {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "string" || valor.length > max) return undefined;
  return valor.trim() || null;
}

export type TituloApi = {
  p_tipo: "pagar" | "receber";
  p_descricao: string;
  p_vencimento: string;
  p_competencia: string;
  p_valor_cents: number;
  p_rateio: { categoria_id: string; centro_custo_id: string | null; valor_cents: number }[];
  p_contato: string | null;
  p_referencia: string | null;
  p_parcelas: number;
  p_forma_pagamento: string | null;
};

// Rateio opcional: sem ele, "categoria_id" (e "centro_custo_id") valem para o total.
export function validarTitulo(corpo: unknown): Resultado<TituloApi> {
  if (!objeto(corpo)) return { erro: "Envie um objeto JSON" };
  const { tipo, descricao, vencimento, competencia, valor_cents, contato_id, parcelas = 1, forma_pagamento } = corpo;
  if (tipo !== "pagar" && tipo !== "receber") return { erro: "tipo deve ser pagar ou receber" };
  if (typeof descricao !== "string" || !descricao.trim() || descricao.length > 200) return { erro: "descricao é obrigatória (até 200 caracteres)" };
  if (!dataValida(vencimento)) return { erro: "vencimento deve ser uma data AAAA-MM-DD" };
  if (competencia !== undefined && !dataValida(competencia)) return { erro: "competencia deve ser uma data AAAA-MM-DD" };
  if (!centavos(valor_cents)) return { erro: "valor_cents deve ser um inteiro positivo (centavos)" };
  if (contato_id !== undefined && contato_id !== null && !uuidValido(contato_id)) return { erro: "contato_id inválido" };
  if (!Number.isInteger(parcelas) || (parcelas as number) < 1 || (parcelas as number) > 120) return { erro: "parcelas deve ser de 1 a 120" };
  if (forma_pagamento !== undefined && forma_pagamento !== null && !FORMAS.includes(forma_pagamento as string)) {
    return { erro: `forma_pagamento deve ser uma de: ${FORMAS.join(", ")}` };
  }
  const referencia = textoOpcional(corpo.referencia, 100);
  if (referencia === undefined) return { erro: "referencia deve ser texto (até 100 caracteres)" };

  let rateio: TituloApi["p_rateio"];
  if (corpo.rateio !== undefined) {
    if (!Array.isArray(corpo.rateio) || corpo.rateio.length === 0 || corpo.rateio.length > 50) return { erro: "rateio deve ser uma lista de 1 a 50 linhas" };
    rateio = [];
    for (const linha of corpo.rateio) {
      if (!objeto(linha) || !uuidValido(linha.categoria_id)) return { erro: "cada linha do rateio precisa de categoria_id" };
      if (linha.centro_custo_id != null && !uuidValido(linha.centro_custo_id)) return { erro: "centro_custo_id inválido no rateio" };
      if (!centavos(linha.valor_cents)) return { erro: "cada linha do rateio precisa de valor_cents positivo" };
      rateio.push({ categoria_id: linha.categoria_id, centro_custo_id: (linha.centro_custo_id as string | null) ?? null, valor_cents: linha.valor_cents });
    }
    const soma = rateio.reduce((s, l) => s + l.valor_cents, 0);
    if (soma !== valor_cents) return { erro: `o rateio soma ${soma} e o título vale ${valor_cents} centavos` };
  } else {
    if (!uuidValido(corpo.categoria_id)) return { erro: "informe categoria_id ou rateio" };
    if (corpo.centro_custo_id != null && !uuidValido(corpo.centro_custo_id)) return { erro: "centro_custo_id inválido" };
    rateio = [{ categoria_id: corpo.categoria_id, centro_custo_id: (corpo.centro_custo_id as string | null) ?? null, valor_cents }];
  }

  return {
    ok: {
      p_tipo: tipo,
      p_descricao: descricao.trim(),
      p_vencimento: vencimento,
      p_competencia: (competencia as string | undefined) ?? vencimento,
      p_valor_cents: valor_cents,
      p_rateio: rateio,
      p_contato: (contato_id as string | null | undefined) ?? null,
      p_referencia: referencia,
      p_parcelas: parcelas as number,
      p_forma_pagamento: (forma_pagamento as string | null | undefined) ?? null,
    },
  };
}

export type BaixaApi = {
  conta_id: string; data: string; valor_cents: number; juros_cents: number; multa_cents: number; desconto_cents: number; observacao: string | null;
};

export function validarBaixa(corpo: unknown): Resultado<BaixaApi> {
  if (!objeto(corpo)) return { erro: "Envie um objeto JSON" };
  const { conta_id, data, valor_cents, juros_cents = 0, multa_cents = 0, desconto_cents = 0 } = corpo;
  if (!uuidValido(conta_id)) return { erro: "conta_id inválido" };
  if (!dataValida(data)) return { erro: "data deve ser AAAA-MM-DD" };
  if (!centavos(valor_cents)) return { erro: "valor_cents deve ser um inteiro positivo (centavos)" };
  if (!centavos(juros_cents, true) || !centavos(multa_cents, true) || !centavos(desconto_cents, true)) {
    return { erro: "juros_cents, multa_cents e desconto_cents devem ser inteiros sem sinal" };
  }
  if (desconto_cents > valor_cents + juros_cents + multa_cents) return { erro: "o desconto não pode passar do valor pago" };
  const observacao = textoOpcional(corpo.observacao, 500);
  if (observacao === undefined) return { erro: "observacao deve ser texto (até 500 caracteres)" };
  return { ok: { conta_id, data, valor_cents, juros_cents, multa_cents, desconto_cents, observacao } };
}

const TIPOS_CONTATO = ["cliente", "fornecedor", "funcionario", "socio"];

export type ContatoApi = {
  tipos?: string[]; nome?: string; cpf_cnpj?: string | null; inscricao_estadual?: string | null; email?: string | null;
  telefone?: string | null; cidade?: string | null; uf?: string | null; produtor_rural?: boolean; observacoes?: string | null; arquivado?: boolean;
};

// parcial = edição (PATCH): só os campos enviados mudam.
export function validarContato(corpo: unknown, parcial = false): Resultado<ContatoApi> {
  if (!objeto(corpo)) return { erro: "Envie um objeto JSON" };
  const saida: ContatoApi = {};
  if (corpo.tipos !== undefined || !parcial) {
    const tipos = corpo.tipos;
    if (!Array.isArray(tipos) || tipos.length === 0 || tipos.some((t) => !TIPOS_CONTATO.includes(t))) {
      return { erro: `tipos deve ser uma lista com: ${TIPOS_CONTATO.join(", ")}` };
    }
    saida.tipos = [...new Set(tipos as string[])];
  }
  if (corpo.nome !== undefined || !parcial) {
    if (typeof corpo.nome !== "string" || !corpo.nome.trim() || corpo.nome.length > 200) return { erro: "nome é obrigatório (até 200 caracteres)" };
    saida.nome = corpo.nome.trim();
  }
  if (corpo.cpf_cnpj !== undefined) {
    const doc = corpo.cpf_cnpj === null ? "" : String(corpo.cpf_cnpj).replace(/\D/g, "");
    if (doc && doc.length !== 11 && doc.length !== 14) return { erro: "cpf_cnpj deve ter 11 ou 14 dígitos" };
    saida.cpf_cnpj = doc || null;
  }
  for (const [campo, max] of [["inscricao_estadual", 30], ["email", 200], ["telefone", 40], ["cidade", 100], ["observacoes", 2000]] as const) {
    if (corpo[campo] === undefined) continue;
    const valor = textoOpcional(corpo[campo], max);
    if (valor === undefined) return { erro: `${campo} deve ser texto (até ${max} caracteres)` };
    saida[campo] = valor;
  }
  if (corpo.uf !== undefined) {
    if (corpo.uf !== null && (typeof corpo.uf !== "string" || !/^[A-Za-z]{2}$/.test(corpo.uf))) return { erro: "uf deve ter 2 letras" };
    saida.uf = corpo.uf ? (corpo.uf as string).toUpperCase() : null;
  }
  for (const campo of ["produtor_rural", "arquivado"] as const) {
    if (corpo[campo] === undefined) continue;
    if (typeof corpo[campo] !== "boolean") return { erro: `${campo} deve ser true ou false` };
    saida[campo] = corpo[campo];
  }
  if (parcial && Object.keys(saida).length === 0) return { erro: "Nada para alterar" };
  return { ok: saida };
}

const TIPOS_PRODUTO = ["peixe", "alevino", "racao", "corretivo", "embalagem", "medicamento", "vacina", "outro"];

export type ProdutoApi = {
  tipo?: string; nome?: string; unidade?: string; sku?: string | null; ncm?: string | null; observacoes?: string | null;
  estoque_minimo?: number | null; ativo?: boolean; para_venda?: boolean;
};

export function validarProduto(corpo: unknown, parcial = false): Resultado<ProdutoApi> {
  if (!objeto(corpo)) return { erro: "Envie um objeto JSON" };
  const saida: ProdutoApi = {};
  if (corpo.tipo !== undefined || !parcial) {
    if (!TIPOS_PRODUTO.includes(corpo.tipo as string)) return { erro: `tipo deve ser um de: ${TIPOS_PRODUTO.join(", ")}` };
    if (corpo.tipo === "peixe") return { erro: "Produtos de peixe são criados pelas classes de peixe no Balbina" };
    saida.tipo = corpo.tipo as string;
  }
  if (corpo.nome !== undefined || !parcial) {
    if (typeof corpo.nome !== "string" || !corpo.nome.trim() || corpo.nome.length > 200) return { erro: "nome é obrigatório (até 200 caracteres)" };
    saida.nome = corpo.nome.trim();
  }
  if (corpo.unidade !== undefined || !parcial) {
    if (typeof corpo.unidade !== "string" || !corpo.unidade.trim() || corpo.unidade.length > 20) return { erro: "unidade é obrigatória (ex.: kg, un, l)" };
    saida.unidade = corpo.unidade.trim();
  }
  for (const [campo, max] of [["sku", 60], ["ncm", 10], ["observacoes", 2000]] as const) {
    if (corpo[campo] === undefined) continue;
    const valor = textoOpcional(corpo[campo], max);
    if (valor === undefined) return { erro: `${campo} deve ser texto (até ${max} caracteres)` };
    saida[campo] = valor;
  }
  if (corpo.estoque_minimo !== undefined) {
    if (corpo.estoque_minimo !== null && (typeof corpo.estoque_minimo !== "number" || !(corpo.estoque_minimo >= 0))) return { erro: "estoque_minimo deve ser um número sem sinal" };
    saida.estoque_minimo = corpo.estoque_minimo as number | null;
  }
  if (corpo.para_venda !== undefined) {
    if (typeof corpo.para_venda !== "boolean") return { erro: "para_venda deve ser true ou false" };
    saida.para_venda = corpo.para_venda;
  }
  if (corpo.ativo !== undefined) {
    if (typeof corpo.ativo !== "boolean") return { erro: "ativo deve ser true ou false" };
    saida.ativo = corpo.ativo;
  }
  if (parcial && Object.keys(saida).length === 0) return { erro: "Nada para alterar" };
  return { ok: saida };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

// Cabeçalho X-Balbina-Assinatura: "t=<segundos>,v1=<HMAC-SHA256 hex de `${t}.${corpo}`>", no jeito do Stripe.
export function assinarWebhook(segredo: string, corpo: string, segundos: number) {
  const hmac = createHmac("sha256", segredo).update(`${segundos}.${corpo}`).digest("hex");
  return `t=${segundos},v1=${hmac}`;
}

export function gerarSegredoWebhook() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

// Endereços internos não recebem webhook: sem isso a piscicultura usaria o Balbina para sondar a rede do servidor.
export function ipPrivado(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    const v4 = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (v4) return ipPrivado(v4);
    return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff") || x.startsWith("::ffff:");
  }
  return true;
}

export function validarUrlWebhook(texto: string): string | null {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return "Endereço inválido";
  }
  if (url.protocol !== "https:") return "O endereço precisa começar com https://";
  if (url.username || url.password) return "Não coloque usuário e senha no endereço";
  if (url.port && url.port !== "443") return "Use a porta padrão do https (443)";
  if (texto.length > 500) return "Endereço muito longo";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && !isIP(host)) {
    return "Use um endereço público na internet";
  }
  if (isIP(host) && ipPrivado(host)) return "Use um endereço público na internet";
  return null;
}
