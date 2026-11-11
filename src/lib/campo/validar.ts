// O que a fila do app de campo manda ao servidor (pode chegar horas depois, quando o celular pega sinal).
// Conferido aqui antes de chegar ao banco, que confere de novo (permissão, lote no viveiro, saldo, carência).

import { totaisGrupos, validarGrupos, type GrupoBiometria } from "../biometria-grupos.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

type Resultado<T> = { ok: T } | { erro: string };
type Obj = Record<string, unknown>;

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const vazio = (v: unknown) => v === undefined || v === null || v === "";
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const uuid = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);

function dataValida(v: unknown, hoje: string): string | null {
  return typeof v === "string" && DATA.test(v) && v >= "2000-01-01" && v <= hoje ? v : null;
}

// número positivo opcional até um limite: null quando vazio, undefined quando inválido
function positivo(v: unknown, max: number): number | null | undefined {
  if (vazio(v)) return null;
  const n = numero(v);
  return n !== null && n > 0 && n <= max ? n : undefined;
}

function inteiroPositivo(v: unknown, max: number): number | null | undefined {
  const n = positivo(v, max);
  return n === null || n === undefined ? n : Number.isInteger(n) ? n : undefined;
}

function base(v: unknown, hoje: string): Resultado<{ corpo: Obj; client_id: string; viveiro_id: string; data: string }> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { erro: "Envio inválido." };
  const corpo = v as Obj;
  const client_id = uuid(corpo.client_id);
  if (!client_id) return { erro: "Identificador do envio inválido." };
  const viveiro_id = uuid(corpo.viveiro_id);
  if (!viveiro_id) return { erro: "Escolha o viveiro." };
  const data = dataValida(corpo.data, hoje);
  if (!data) return { erro: "Data inválida: use a data de hoje ou de um dia que já passou." };
  return { ok: { corpo, client_id, viveiro_id, data } };
}

// ---------------------------------------------------------------------------------------------------------------
// Biometria: peixes pesados e peso total da amostra (ou peso médio), em gramas
// ---------------------------------------------------------------------------------------------------------------
export type BiometriaCampo = {
  client_id: string; viveiro_id: string; lote_id: string | null; data: string;
  peixes: number; peso_total_g: number | null; peso_medio_g: number | null; observacoes: string;
  // biometria em grupos (opcional): o servidor grava os grupos e o peso médio ponderado
  grupos?: GrupoBiometria[]; jejum_horas?: number | null; temperatura_c?: number | null; oxigenio_mg_l?: number | null;
};

export function validarBiometriaCampo(v: unknown, hoje: string): Resultado<BiometriaCampo> {
  const b = base(v, hoje);
  if ("erro" in b) return b;
  const c = b.ok.corpo;
  if (c.grupos !== undefined) {
    const g = validarGrupos(c.grupos);
    if ("erro" in g) return g;
    const t = totaisGrupos(g.ok);
    const opcional = (v: unknown, max: number) => (vazio(v) ? null : (numero(v) !== null && numero(v)! >= 0 && numero(v)! <= max ? numero(v) : undefined));
    const jejum = opcional(c.jejum_horas, 96), temp = opcional(c.temperatura_c, 45), ox = opcional(c.oxigenio_mg_l, 30);
    if (jejum === undefined) return { erro: "Jejum inválido: de 0 a 96 horas." };
    if (temp === undefined) return { erro: "Temperatura inválida: de 0 a 45 °C." };
    if (ox === undefined) return { erro: "Oxigênio inválido: de 0 a 30 mg/L." };
    return {
      ok: {
        client_id: b.ok.client_id, viveiro_id: b.ok.viveiro_id, lote_id: uuid(c.lote_id), data: b.ok.data,
        peixes: t.peixes, peso_total_g: t.pesoTotalG, peso_medio_g: null, observacoes: texto(c.observacoes, 500),
        grupos: g.ok, jejum_horas: jejum, temperatura_c: temp, oxigenio_mg_l: ox,
      },
    };
  }
  const peixes = inteiroPositivo(c.peixes, 100_000);
  if (!peixes) return { erro: "Informe quantos peixes foram pesados (número inteiro)." };
  const total = positivo(c.peso_total_g, 5_000_000);
  const medio = positivo(c.peso_medio_g, 100_000);
  if (total === undefined || medio === undefined) return { erro: "Peso inválido: use gramas, maior que zero." };
  if (total === null && medio === null) return { erro: "Informe o peso total da amostra ou o peso médio." };
  if (total !== null && total / peixes > 100_000) return { erro: "O peso médio passa de 100 kg: confira o peso total e o número de peixes." };
  return {
    ok: {
      client_id: b.ok.client_id, viveiro_id: b.ok.viveiro_id, lote_id: uuid(c.lote_id), data: b.ok.data,
      peixes, peso_total_g: total, peso_medio_g: total === null ? medio : null, observacoes: texto(c.observacoes, 500),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Abrir lote: povoamento do viveiro vazio
// ---------------------------------------------------------------------------------------------------------------
export type AbrirLoteCampo = {
  client_id: string; viveiro_id: string; data: string; codigo: string; especie_id: string;
  quantidade: number; peso_inicial_g: number; peso_alvo_g: number | null; custo_cents: number;
};

export function validarAbrirLote(v: unknown, hoje: string): Resultado<AbrirLoteCampo> {
  const b = base(v, hoje);
  if ("erro" in b) return b;
  const c = b.ok.corpo;
  const codigo = texto(c.codigo, 40);
  if (!codigo) return { erro: "Informe o código do lote." };
  const especie_id = uuid(c.especie_id);
  if (!especie_id) return { erro: "Escolha a espécie." };
  const quantidade = inteiroPositivo(c.quantidade, 10_000_000);
  if (!quantidade) return { erro: "Informe quantos peixes foram povoados (número inteiro)." };
  const peso = positivo(c.peso_inicial_g, 100_000);
  if (!peso) return { erro: "Informe o peso médio dos peixes no povoamento, em gramas." };
  const alvo = positivo(c.peso_alvo_g, 100_000);
  if (alvo === undefined) return { erro: "Peso de despesca inválido." };
  const custo = vazio(c.custo_cents) ? 0 : numero(c.custo_cents);
  if (custo === null || custo < 0 || !Number.isInteger(custo)) return { erro: "Custo dos alevinos inválido." };
  return {
    ok: { client_id: b.ok.client_id, viveiro_id: b.ok.viveiro_id, data: b.ok.data, codigo, especie_id, quantidade,
      peso_inicial_g: peso, peso_alvo_g: alvo, custo_cents: custo },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Fechar lote no viveiro: despesca total (kg retirados) ou encerramento sem despesca (perda, erro de cadastro)
// ---------------------------------------------------------------------------------------------------------------
export type FecharLoteCampo = {
  client_id: string; viveiro_id: string; data: string; modo: "despesca" | "encerrar";
  kg: number | null; peixes: number | null; motivo: string; observacoes: string;
};

export function validarFecharLote(v: unknown, hoje: string): Resultado<FecharLoteCampo> {
  const b = base(v, hoje);
  if ("erro" in b) return b;
  const c = b.ok.corpo;
  const observacoes = texto(c.observacoes, 500);
  if (c.modo === "encerrar") {
    const motivo = texto(c.motivo, 300);
    if (!motivo) return { erro: "Diga por que o lote está sendo encerrado sem despesca." };
    return { ok: { client_id: b.ok.client_id, viveiro_id: b.ok.viveiro_id, data: b.ok.data, modo: "encerrar", kg: null, peixes: null, motivo, observacoes } };
  }
  if (c.modo !== "despesca") return { erro: "Escolha despesca total ou encerrar sem despesca." };
  const kg = positivo(c.kg, 1_000_000);
  if (!kg) return { erro: "Informe os kg despescados." };
  const peixes = inteiroPositivo(c.peixes, 10_000_000);
  if (peixes === undefined) return { erro: "Quantidade de peixes precisa ser um número inteiro." };
  return { ok: { client_id: b.ok.client_id, viveiro_id: b.ok.viveiro_id, data: b.ok.data, modo: "despesca", kg, peixes, motivo: "", observacoes } };
}

// ---------------------------------------------------------------------------------------------------------------
// Insumo aplicado no viveiro: medicamento do cadastro ou corretivo/fertilizante/outro produto do estoque
// ---------------------------------------------------------------------------------------------------------------
export const TIPOS_INSUMO = {
  calagem: "Calagem",
  adubacao: "Adubação",
  medicamento: "Medicamento ou vitamina",
  banho: "Banho",
  limpeza: "Limpeza",
  outro: "Outro insumo",
} as const;
export type TipoInsumo = keyof typeof TIPOS_INSUMO;

export type InsumoCampo = {
  client_id: string; viveiro_id: string; data: string; tipo: TipoInsumo;
  produto_id: string | null; quantidade: number | null;
  medicamento_id: string | null; dias: number; dose: number | null; base: number | null;
  observacoes: string; baixar_estoque: boolean;
};

export function validarInsumoCampo(v: unknown, hoje: string): Resultado<InsumoCampo> {
  const b = base(v, hoje);
  if ("erro" in b) return b;
  const c = b.ok.corpo;
  if (typeof c.tipo !== "string" || !(c.tipo in TIPOS_INSUMO)) return { erro: "Escolha o tipo de manejo." };
  const tipo = c.tipo as TipoInsumo;
  const comum = { client_id: b.ok.client_id, viveiro_id: b.ok.viveiro_id, data: b.ok.data, tipo, observacoes: texto(c.observacoes, 500),
    baixar_estoque: c.baixar_estoque !== false };

  const quantidade = positivo(c.quantidade, 1_000_000);
  if (quantidade === undefined) return { erro: "Quantidade inválida: use um número maior que zero." };
  if (tipo === "medicamento") {
    const medicamento_id = uuid(c.medicamento_id);
    if (!medicamento_id) return { erro: "Escolha o medicamento ou a vitamina." };
    const dias = vazio(c.dias) ? 1 : numero(c.dias);
    if (dias === null || !Number.isInteger(dias) || dias < 1 || dias > 120) return { erro: "Dias de tratamento: de 1 a 120." };
    const dose = positivo(c.dose, 100_000);
    const baseDose = positivo(c.base, 1_000_000);
    if (dose === undefined || baseDose === undefined) return { erro: "Dose e base (kg de ração ou m³ de água) precisam ser maiores que zero." };
    return { ok: { ...comum, produto_id: null, quantidade, medicamento_id, dias, dose, base: baseDose } };
  }
  const produto_id = vazio(c.produto_id) ? null : uuid(c.produto_id);
  if (produto_id === null && !vazio(c.produto_id)) return { erro: "Produto inválido." };
  if (produto_id && quantidade === null) return { erro: "Informe a quantidade aplicada." };
  if (!produto_id && quantidade !== null) return { erro: "Escolha o produto aplicado." };
  if (tipo === "calagem" || tipo === "adubacao") {
    if (!produto_id) return { erro: tipo === "calagem" ? "Escolha o calcário ou a cal aplicada." : "Escolha o adubo aplicado." };
  }
  return { ok: { ...comum, produto_id, quantidade, medicamento_id: null, dias: 1, dose: null, base: null } };
}
