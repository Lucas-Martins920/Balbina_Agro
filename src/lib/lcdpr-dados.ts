import "server-only";
import type { Empresa } from "./empresa";
import { faltasLcdpr, gerarLcdpr, type ContaLcdpr, type ImovelLcdpr, type LancamentoLcdpr, type ProdutorLcdpr } from "./lcdpr";
import { createClient } from "./supabase/server";

export type ConfigLcdpr = Record<string, string | number | null>;

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function produtorDe(c: ConfigLcdpr | null): Partial<ProdutorLcdpr> {
  return {
    cpf: s(c?.cpf), nome: s(c?.nome), forma_apuracao: c?.forma_apuracao === 2 ? 2 : 1, endereco: s(c?.endereco), numero: s(c?.numero),
    complemento: s(c?.complemento), bairro: s(c?.bairro), uf: s(c?.uf), cod_mun: s(c?.cod_mun), cep: s(c?.cep), telefone: s(c?.telefone), email: s(c?.email),
  };
}

export function imovelDe(c: ConfigLcdpr | null): Partial<ImovelLcdpr> {
  return {
    codigo: 1, cad_itr: s(c?.cad_itr), caepf: s(c?.caepf), inscricao_estadual: s(c?.inscricao_estadual), nome: s(c?.imovel_nome),
    endereco: s(c?.imovel_endereco), numero: s(c?.imovel_numero), complemento: s(c?.imovel_complemento), bairro: s(c?.imovel_bairro),
    uf: s(c?.imovel_uf), cod_mun: s(c?.imovel_cod_mun), cep: s(c?.imovel_cep), tipo_exploracao: Number(c?.tipo_exploracao ?? 1),
    participacao_centesimos: Number(c?.participacao_centesimos ?? 10000),
  };
}

// Monta o LCDPR do ano. Conta corrente/poupança com banco vira 0050 (001, 002…); caixinha é espécie
// (000); o resto (cartão, aplicação) é numerário em trânsito (999). Sem CPF/CNPJ do participante, sai o
// do próprio produtor e a contagem volta para o aviso da tela.
export async function montarLcdpr(empresa: Empresa, ano: number) {
  const supabase = await createClient();
  const de = `${ano}-01-01`;
  const ate = `${ano}-12-31`;
  const [{ data: cfg }, { data: contas }, { data: lancs, error }] = await Promise.all([
    supabase.from("lcdpr_config").select("*").eq("empresa_id", empresa.id).maybeSingle(),
    supabase.from("contas_financeiras").select("id, tipo, nome, banco_codigo, agencia, conta, conta_dv").eq("empresa_id", empresa.id).order("created_at"),
    supabase.rpc("lcdpr_lancamentos", { p_empresa: empresa.id, p_de: de, p_ate: ate }),
  ]);
  if (error) throw new Error(error.message);
  const produtor = produtorDe(cfg);
  const imovel = imovelDe(cfg);
  const faltas = faltasLcdpr(produtor, imovel);
  if (faltas.length) return { faltas };

  const codigos = new Map<string, number>();
  const contasLcdpr: ContaLcdpr[] = [];
  for (const c of contas ?? []) {
    if (c.tipo === "caixinha") codigos.set(c.id, 0);
    else if ((c.tipo === "corrente" || c.tipo === "poupanca") && c.banco_codigo) {
      const codigo = contasLcdpr.length + 1;
      codigos.set(c.id, codigo);
      contasLcdpr.push({ codigo, banco: c.banco_codigo, nome_banco: c.nome, agencia: s(c.agencia), numero: `${s(c.conta)}${s(c.conta_dv)}` });
    } else codigos.set(c.id, 999);
  }
  let semParticipante = 0;
  const lancamentos: LancamentoLcdpr[] = (lancs ?? []).map((l: {
    data: string; conta_id: string; num_doc: string | null; hist: string; id_partic: string | null; tipo_lanc: 1 | 2; tipo_doc: number;
    entrada_cents: number; saida_cents: number;
  }) => {
    const partic = (l.id_partic ?? "").replace(/\D/g, "");
    if (!/^(\d{11}|\d{14})$/.test(partic)) semParticipante++;
    return {
      data: l.data, cod_imovel: 1, cod_conta: codigos.get(l.conta_id) ?? 999, num_doc: l.num_doc, tipo_doc: l.tipo_doc, hist: l.hist,
      id_partic: /^(\d{11}|\d{14})$/.test(partic) ? partic : produtor.cpf!, tipo_lanc: l.tipo_lanc,
      entrada_cents: Number(l.entrada_cents), saida_cents: Number(l.saida_cents),
    };
  });
  const arquivo = gerarLcdpr({
    produtor: produtor as ProdutorLcdpr, imoveis: [imovel as ImovelLcdpr], contas: contasLcdpr, lancamentos, de, ate,
    contador: { nome: s(cfg?.contador_nome), documento: s(cfg?.contador_documento), crc: s(cfg?.contador_crc), email: s(cfg?.contador_email), fone: s(cfg?.contador_fone) },
  });
  return { arquivo, nome: `LCDPR-${produtor.cpf!.replace(/\D/g, "")}-${ano}.txt`, lancamentos: lancamentos.length, semParticipante };
}
