// Cartões de confirmação do chat do app de campo. A IA (ou, sem sinal, a leitura local da frase) propõe o
// lançamento; a tela mostra o cartão, a pessoa confere, corrige e confirma, e só então ele entra na fila.
// Tudo aqui é regra pura: serve ao servidor (filtrar o que a IA devolveu) e ao celular (montar o envio).

import type { Agua } from "../agua.ts";
import { CAUSAS_MORTE } from "../causas-morte.ts";
import type { ResultadoFala } from "../fala-apontamento.ts";
import type { ItemFila } from "./fila.ts";
import { TIPOS_INSUMO, type TipoInsumo } from "./validar.ts";

export type Turno = "manha" | "tarde";

export type CartaoApontamento = {
  tipo: "apontamento"; viveiro_id: string | null; turno: Turno | null;
  racao_kg: number | null; sacos: number | null; racao_produto_id: string | null;
  mortes: number | null; causa: string | null; agua: Agua | null; observacoes: string;
};
export type CartaoBiometria = {
  tipo: "biometria"; viveiro_id: string | null; peixes: number | null; peso_total_g: number | null; peso_medio_g: number | null; observacoes: string;
};
export type CartaoInsumo = {
  tipo: "insumo"; viveiro_id: string | null; insumo_tipo: TipoInsumo; produto_id: string | null; medicamento_id: string | null;
  quantidade: number | null; observacoes: string;
};
export type Cartao = CartaoApontamento | CartaoBiometria | CartaoInsumo;

// O que a IA devolve (uma linha plana por lançamento; os campos que não se aplicam vêm nulos)
export type PropostaIa = {
  tipo: "apontamento" | "biometria" | "insumo";
  viveiro_id: string | null;
  turno: Turno | null;
  racao_kg: number | null;
  sacos: number | null;
  racao_produto_id: string | null;
  mortes: number | null;
  causa: string | null;
  oxigenio_mg_l: number | null;
  temperatura_c: number | null;
  ph: number | null;
  transparencia_cm: number | null;
  amonia_mg_l: number | null;
  peixes_amostrados: number | null;
  peso_total_g: number | null;
  peso_medio_g: number | null;
  insumo_tipo: TipoInsumo | null;
  produto_id: string | null;
  medicamento_id: string | null;
  quantidade: number | null;
  observacoes: string | null;
};

export type ContextoCartoes = {
  tanques: { id: string; rotulo: string; lote: { id: string } | null }[];
  insumos: { id: string; nome: string; unidade: string }[];
  medicamentos: { id: string; nome: string }[];
  racoes: { id: string; nome: string }[];
};

const positivo = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const inteiro = (v: number | null | undefined) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
const CAUSAS = new Set<string>(CAUSAS_MORTE.map((c) => c.chave));

function aguaDa(p: PropostaIa): Agua | null {
  const agua: Agua = {};
  if (positivo(p.oxigenio_mg_l) !== null || p.oxigenio_mg_l === 0) agua.oxigenio_mg_l = p.oxigenio_mg_l!;
  if (positivo(p.temperatura_c) !== null) agua.temperatura_c = p.temperatura_c!;
  if (positivo(p.ph) !== null) agua.ph = p.ph!;
  if (positivo(p.transparencia_cm) !== null) agua.transparencia_cm = p.transparencia_cm!;
  if (positivo(p.amonia_mg_l) !== null || p.amonia_mg_l === 0) agua.amonia_mg_l = p.amonia_mg_l!;
  return Object.keys(agua).length ? agua : null;
}

// Fica só o que aponta para o que existe: viveiro, produto, ração e medicamento desta piscicultura.
export function cartoesDaIa(propostas: PropostaIa[], ctx: ContextoCartoes): Cartao[] {
  const existe = (lista: { id: string }[], id: string | null) => (id && lista.some((x) => x.id === id) ? id : null);
  const cartoes: Cartao[] = [];
  for (const p of propostas.slice(0, 12)) {
    const viveiro_id = existe(ctx.tanques, p.viveiro_id);
    const observacoes = (p.observacoes ?? "").slice(0, 300);
    if (p.tipo === "apontamento") {
      const c: CartaoApontamento = {
        tipo: "apontamento", viveiro_id, turno: p.turno === "manha" || p.turno === "tarde" ? p.turno : null,
        racao_kg: positivo(p.racao_kg), sacos: positivo(p.sacos), racao_produto_id: existe(ctx.racoes, p.racao_produto_id),
        mortes: inteiro(p.mortes), causa: p.causa && CAUSAS.has(p.causa) ? p.causa : null, agua: aguaDa(p), observacoes,
      };
      if (c.racao_kg !== null || c.sacos !== null || c.mortes !== null || c.agua) cartoes.push(c);
    } else if (p.tipo === "biometria") {
      const c: CartaoBiometria = {
        tipo: "biometria", viveiro_id, peixes: inteiro(p.peixes_amostrados) || null, peso_total_g: positivo(p.peso_total_g),
        peso_medio_g: positivo(p.peso_total_g) ? null : positivo(p.peso_medio_g), observacoes,
      };
      if (c.peixes !== null || c.peso_total_g !== null || c.peso_medio_g !== null) cartoes.push(c);
    } else if (p.tipo === "insumo") {
      const medicamento_id = existe(ctx.medicamentos, p.medicamento_id);
      const insumo_tipo: TipoInsumo = medicamento_id ? "medicamento" : p.insumo_tipo && p.insumo_tipo in TIPOS_INSUMO && p.insumo_tipo !== "medicamento" ? p.insumo_tipo : "outro";
      const produto_id = medicamento_id ? null : existe(ctx.insumos, p.produto_id);
      if (!medicamento_id && !produto_id && insumo_tipo === "outro") continue;
      cartoes.push({ tipo: "insumo", viveiro_id, insumo_tipo, produto_id, medicamento_id, quantidade: positivo(p.quantidade), observacoes });
    }
  }
  return cartoes;
}

// Leitura local da frase (sem sinal ou sem IA) vira um cartão de apontamento
export function cartaoDaFala(r: ResultadoFala): CartaoApontamento | null {
  const mortes = r.mortes !== undefined || r.descartes !== undefined ? (r.mortes ?? 0) + (r.descartes ?? 0) : null;
  const c: CartaoApontamento = {
    tipo: "apontamento", viveiro_id: r.viveiro_id ?? null, turno: null, racao_kg: r.racao_kg ?? null, sacos: r.sacos ?? null,
    racao_produto_id: null, mortes, causa: r.causa ?? null, agua: r.agua && Object.keys(r.agua).length ? r.agua : null, observacoes: "",
  };
  return c.racao_kg !== null || c.sacos !== null || c.mortes !== null || c.agua ? c : null;
}

// O que falta para o cartão poder ir para a fila (null = pronto)
export function pendenciaDoCartao(c: Cartao, ctx: ContextoCartoes): string | null {
  const tanque = ctx.tanques.find((t) => t.id === c.viveiro_id);
  if (!tanque) return "Escolha o viveiro.";
  if (c.tipo === "apontamento") {
    if (!tanque.lote) return "Este viveiro está vazio: abra o lote antes de lançar ração.";
    if (c.sacos !== null && c.racao_kg === null) return "Quantos kg tem cada saco?";
    if (c.racao_kg === null && c.mortes === null && !c.agua) return "Informe a ração, as mortes ou a água.";
    return null;
  }
  if (c.tipo === "biometria") {
    if (!tanque.lote) return "Este viveiro está vazio: não há peixe para pesar.";
    if (!c.peixes) return "Informe quantos peixes foram pesados.";
    if (c.peso_total_g === null && c.peso_medio_g === null) return "Informe o peso da amostra.";
    return null;
  }
  if (c.insumo_tipo === "medicamento") {
    if (!c.medicamento_id) return "Escolha o medicamento ou a vitamina.";
    if (!tanque.lote) return "Este viveiro está vazio: medicamento é aplicado nos peixes.";
    return null;
  }
  if (c.insumo_tipo === "banho" && !tanque.lote) return "Este viveiro está vazio: banho é aplicado nos peixes.";
  if ((c.insumo_tipo === "calagem" || c.insumo_tipo === "adubacao") && !c.produto_id) return "Escolha o produto aplicado.";
  if (c.produto_id && c.quantidade === null) return "Informe a quantidade aplicada.";
  return null;
}

const num = (v: number, casas = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

export function rotuloCartao(c: Cartao, ctx: ContextoCartoes): string {
  const tanque = ctx.tanques.find((t) => t.id === c.viveiro_id)?.rotulo ?? "viveiro?";
  if (c.tipo === "apontamento") {
    const partes = [c.racao_kg !== null || c.sacos !== null ? "Ração" : c.mortes !== null ? "Mortes" : "Água", tanque];
    if (c.racao_kg !== null) partes.push(`${num(c.racao_kg)} kg${c.sacos !== null ? ` (${num(c.sacos)} ${c.sacos === 1 ? "saco" : "sacos"})` : ""}`);
    else if (c.sacos !== null) partes.push(`${num(c.sacos)} ${c.sacos === 1 ? "saco" : "sacos"}`);
    if (c.mortes !== null && (c.racao_kg !== null || c.sacos !== null)) partes.push(`${c.mortes} ${c.mortes === 1 ? "morte" : "mortes"}`);
    else if (c.mortes !== null) partes.push(String(c.mortes));
    if (c.agua?.oxigenio_mg_l !== undefined) partes.push(`O₂ ${num(c.agua.oxigenio_mg_l)} mg/L`);
    return partes.join(" · ");
  }
  if (c.tipo === "biometria") {
    const medio = c.peso_medio_g ?? (c.peso_total_g !== null && c.peixes ? c.peso_total_g / c.peixes : null);
    return ["Biometria", tanque, c.peixes ? `${c.peixes} peixes` : null, medio !== null ? `${num(medio, 0)} g` : null].filter(Boolean).join(" · ");
  }
  const produto = c.medicamento_id ? ctx.medicamentos.find((m) => m.id === c.medicamento_id)?.nome
    : ctx.insumos.find((i) => i.id === c.produto_id);
  const textoProduto = typeof produto === "string" ? produto
    : produto ? `${produto.nome}${c.quantidade !== null ? ` ${num(c.quantidade, 3)} ${produto.unidade}` : ""}` : null;
  return [TIPOS_INSUMO[c.insumo_tipo], tanque, textoProduto].filter(Boolean).join(" · ");
}

// Cartão confirmado vira envio da fila, no formato que a rota do servidor espera
export function itemDoCartao(c: Cartao, ctx: ContextoCartoes, extra: { client_id: string; data: string; turno: Turno; agora: string }): ItemFila {
  const base = { client_id: extra.client_id, viveiro_id: c.viveiro_id, data: extra.data };
  const rotulo = rotuloCartao(c, ctx);
  if (c.tipo === "apontamento") {
    const racao = c.racao_kg ?? 0;
    return {
      client_id: extra.client_id, tipo: "apontamento", rotulo, criado_em: extra.agora,
      corpo: {
        ...base, turno: c.turno ?? extra.turno, mortes: c.mortes ?? 0, descartes: 0, racao_kg: racao,
        racoes: c.racao_produto_id && racao > 0 ? [{ produto_id: c.racao_produto_id, kg: racao }] : [],
        agua: c.agua, observacoes: c.observacoes, causas: c.causa && c.mortes ? { [c.causa]: c.mortes } : undefined,
      },
    };
  }
  if (c.tipo === "biometria") {
    const lote = ctx.tanques.find((t) => t.id === c.viveiro_id)?.lote?.id ?? null;
    return {
      client_id: extra.client_id, tipo: "biometria", rotulo, criado_em: extra.agora,
      corpo: { ...base, lote_id: lote, peixes: c.peixes, peso_total_g: c.peso_total_g, peso_medio_g: c.peso_medio_g, observacoes: c.observacoes },
    };
  }
  return {
    client_id: extra.client_id, tipo: "insumo", rotulo, criado_em: extra.agora,
    corpo: { ...base, tipo: c.insumo_tipo, produto_id: c.produto_id, quantidade: c.quantidade, medicamento_id: c.medicamento_id, dias: 1, observacoes: c.observacoes },
  };
}
