// Teste ponta a ponta da NF-e/NFC-e no ambiente de HOMOLOGAÇÃO da Focus NFe (notas sem valor fiscal).
// Emite, consulta, baixa DANFE e XML, manda carta de correção, cancela e inutiliza um número,
// usando o mesmo montador de nota do app (src/lib/focus-mapa.ts).
//
// Uso: FOCUS_TOKEN=... FOCUS_EMITENTE_DOC=CNPJ-ou-CPF [FOCUS_EMITENTE_UF=AM] [FOCUS_NFCE=1] \
//      node --experimental-strip-types scripts/focus-homologacao.ts
import { agoraComFuso, lerInutilizacao, lerRetorno, montarNfce, montarNfe, type RetornoFocus } from "../src/lib/focus-mapa.ts";

const BASE = "https://homologacao.focusnfe.com.br";
const token = process.env.FOCUS_TOKEN ?? "";
const doc = (process.env.FOCUS_EMITENTE_DOC ?? "").replace(/\D/g, "");
const uf = (process.env.FOCUS_EMITENTE_UF ?? "AM").toUpperCase();
if (!token || !doc) {
  console.log("Sem FOCUS_TOKEN e FOCUS_EMITENTE_DOC: teste de homologação não roda.");
  process.exit(0);
}

const resultado: [string, boolean, string][] = [];
const passo = (nome: string, ok: boolean, detalhe = "") => {
  resultado.push([nome, ok, detalhe]);
  console.log(`${ok ? "ok" : "FALHOU"} - ${nome}${detalhe ? `: ${detalhe}` : ""}`);
  return ok;
};

async function api<T = RetornoFocus>(caminho: string, init: { method?: string; body?: unknown } = {}) {
  const r = await fetch(`${BASE}${caminho}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const texto = await r.text();
  let dados = {} as T;
  try { dados = (texto ? JSON.parse(texto) : {}) as T; } catch { /* resposta sem JSON */ }
  return { status: r.status, dados, texto };
}

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
async function aguardar(caminho: string) {
  for (let i = 0; i < 30; i++) {
    const { dados } = await api(caminho);
    if (dados.status && !dados.status.startsWith("processando")) return dados;
    await espera(2000);
  }
  return { status: "processando" } as RetornoFocus;
}
async function arquivo(caminho: string | undefined) {
  if (!caminho) return false;
  const r = await fetch(`${BASE}${caminho}`);
  return r.ok && (await r.arrayBuffer()).byteLength > 100;
}

const config = { cfop_interna: "5101", cfop_interestadual: "6101", icms_situacao: doc.length === 11 ? "40" : "400",
  pis_situacao: doc.length === 11 ? "08" : "49", cofins_situacao: doc.length === 11 ? "08" : "49", serie: 1,
  informacoes_adicionais: "Teste automático do Balbina em homologação.", funrural_percentual: doc.length === 11 ? 1.5 : 0 };
const itens = [{ numero_item: 1, codigo: "CX-EXTRA", descricao: "Caixa 12 cartelas ovos Extra brancos", ncm: "04072100", cfop_padrao: null,
  unidade: "cx", quantidade: 2, preco_unit_cents: 18000, desconto_cents: 0 }];
const sufixo = Date.now().toString(36);

// 1. NF-e
const nfe = montarNfe({
  docEmitente: doc, ufEmitente: uf, config, itens, dataEmissao: agoraComFuso("America/Manaus"), numeroPedido: 1, formaPagamento: "pix",
  dest: { nome: "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL", cpf_cnpj: "52998224725", inscricao_estadual: null, email: null, telefone: null,
    endereco: { logradouro: "Avenida Eduardo Ribeiro", numero: "520", bairro: "Centro", cep: "69010001" }, cidade: "Manaus", uf },
});
const ref = `balbina-teste-${sufixo}`;
const envio = await api(`/v2/nfe?ref=${ref}`, { method: "POST", body: nfe });
if (passo("NF-e enviada", envio.status < 400, envio.status >= 400 ? envio.texto.slice(0, 300) : `ref ${ref}`)) {
  const r = await aguardar(`/v2/nfe/${ref}`);
  const lido = lerRetorno(r);
  if (passo("NF-e autorizada", lido.status === "autorizada", lido.status === "autorizada" ? `nº ${lido.numero}, chave ${lido.chave_acesso}` : String(lido.motivo_rejeicao))) {
    passo("DANFE da NF-e", await arquivo(lido.danfe_path));
    passo("XML da NF-e", await arquivo(lido.xml_path));
    const cce = await api(`/v2/nfe/${ref}/carta_correcao`, { method: "POST", body: { correcao: "Correção de teste: endereço de entrega no centro de Manaus." } });
    passo("Carta de correção", cce.status < 400 && cce.dados.status === "autorizado", cce.dados.mensagem_sefaz ?? cce.texto.slice(0, 200));
    const canc = await api(`/v2/nfe/${ref}`, { method: "DELETE", body: { justificativa: "Teste automático de cancelamento do Balbina" } });
    passo("Cancelamento da NF-e", canc.dados.status === "cancelado", canc.dados.mensagem_sefaz ?? canc.texto.slice(0, 200));
    // 2. Inutilização de um número bem à frente do último usado
    const numero = Number(lido.numero ?? 1) + 500;
    const inu = await api<RetornoFocus & { protocolo_sefaz?: string; caminho_xml?: string }>("/v2/nfe/inutilizacao", {
      method: "POST", body: { [doc.length === 11 ? "cpf" : "cnpj"]: doc, serie: "1", numero_inicial: numero, numero_final: numero, justificativa: "Teste automático de inutilização do Balbina" },
    });
    const li = lerInutilizacao(inu.dados);
    passo(`Inutilização do nº ${numero}`, li.status === "autorizada", li.motivo ?? li.protocolo ?? inu.texto.slice(0, 200));
  }
}

// 3. NFC-e (só CNPJ e com CSC cadastrado na Focus)
if (process.env.FOCUS_NFCE === "1" && doc.length === 14) {
  const nfce = montarNfce({ docEmitente: doc, config, itens, dataEmissao: agoraComFuso("America/Manaus"), numeroPedido: 2,
    pagamentos: [{ forma: "dinheiro", valor_cents: 16000 }, { forma: "pix", valor_cents: 20000 }] });
  const refc = `balbina-teste-c-${sufixo}`;
  const e = await api(`/v2/nfce?ref=${refc}`, { method: "POST", body: nfce });
  const lido = lerRetorno(e.dados);
  if (passo("NFC-e autorizada", lido.status === "autorizada", lido.status === "autorizada" ? `nº ${lido.numero}` : String(lido.motivo_rejeicao ?? e.texto.slice(0, 300)))) {
    passo("DANFE da NFC-e", await arquivo(lido.danfe_path));
    const c = await api(`/v2/nfce/${refc}`, { method: "DELETE", body: { justificativa: "Teste automático de cancelamento do Balbina" } });
    passo("Cancelamento da NFC-e", c.dados.status === "cancelado", c.dados.mensagem_sefaz ?? c.texto.slice(0, 200));
  }
}

const falhas = resultado.filter(([, ok]) => !ok);
console.log(`\n${resultado.length - falhas.length} de ${resultado.length} passos ok`);
process.exit(falhas.length ? 1 : 0);
