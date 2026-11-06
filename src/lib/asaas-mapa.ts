// Tradução entre o que o ERP guarda e a API v3 do Asaas. Sem rede aqui, para dar para testar.

export type Perfil = { juros_mes_percentual: number; multa_percentual: number; desconto_ate_vencimento_percentual: number };
export type Meio = "boleto" | "pix" | "boleto_pix";

export const MEIOS_COBRANCA: Record<Meio, string> = { boleto_pix: "Boleto com Pix", boleto: "Só boleto", pix: "Só Pix" };

const TIPO_ASAAS: Record<Meio, string> = { boleto: "BOLETO", pix: "PIX", boleto_pix: "UNDEFINED" };

export type AmbienteAsaas = "producao" | "sandbox";

// Só "produção" (com ou sem acento, ou "production") liga a conta real; qualquer outra coisa é sandbox.
export function ambienteAsaas(valor: string | undefined): AmbienteAsaas {
  const v = (valor ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return v === "producao" || v === "production" ? "producao" : "sandbox";
}

export function urlBase(ambiente: string | undefined) {
  return ambienteAsaas(ambiente) === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

// Chaves novas do Asaas dizem o ambiente no prefixo; as antigas ($aact_ sem prod/hmlg) não.
export function ambienteDaChave(chave: string): AmbienteAsaas | null {
  if (chave.startsWith("$aact_prod_")) return "producao";
  if (chave.startsWith("$aact_hmlg_")) return "sandbox";
  return null;
}

// Erro de configuração que o Asaas só devolveria como 401 genérico, ou null se está tudo certo.
// Fora da produção (npm run dev, preview) nunca se fala com o Asaas de produção: seria cobrança de verdade.
export function conferirCredencial(c: { chave: string; ambiente: string | undefined }, onde: { foraDaProducao: boolean }): string | null {
  const ambiente = ambienteAsaas(c.ambiente);
  const daChave = ambienteDaChave(c.chave);
  if (daChave && daChave !== ambiente) {
    return daChave === "sandbox"
      ? "A chave do Asaas é de sandbox, mas o ambiente está como produção."
      : "A chave do Asaas é de produção, mas o ambiente está como sandbox.";
  }
  if (onde.foraDaProducao && ambiente === "producao") return "Fora da produção não se usa o Asaas de produção. Use uma chave de sandbox.";
  return null;
}

// Mensagem de erro de uma resposta do Asaas, mesmo quando ele devolve HTML (fora do ar) em vez de JSON.
export function mensagemErroAsaas(status: number, texto: string) {
  if (status === 401) return "Asaas recusou (401): chave da API inválida ou de outro ambiente.";
  if (status === 429) return "Asaas recusou (429): muitas chamadas seguidas. Tente de novo em alguns minutos.";
  let erros = "";
  try {
    erros = ((JSON.parse(texto) as { errors?: { description?: string }[] }).errors ?? []).map((e) => e.description).filter(Boolean).join("; ");
  } catch {
    // não é JSON
  }
  return `Asaas recusou (${status}): ${erros || texto.slice(0, 200)}`;
}

export function montarCliente(c: { id: string; nome: string; cpf_cnpj: string; email: string | null; telefone: string | null }) {
  const fone = (c.telefone ?? "").replace(/\D/g, "");
  return {
    name: c.nome,
    cpfCnpj: c.cpf_cnpj,
    ...(c.email ? { email: c.email } : {}),
    ...(fone.length >= 10 ? { mobilePhone: fone } : {}),
    externalReference: c.id,
    notificationDisabled: false,
  };
}

export function montarCobranca(p: { clienteAsaas: string; cobrancaId: string; meio: Meio; vencimento: string; valor_cents: number; descricao: string; perfil: Perfil }) {
  const pct = (v: number) => Number(v) || 0;
  return {
    customer: p.clienteAsaas,
    billingType: TIPO_ASAAS[p.meio],
    value: p.valor_cents / 100,
    dueDate: p.vencimento,
    description: p.descricao.slice(0, 500),
    externalReference: p.cobrancaId,
    fine: { value: pct(p.perfil.multa_percentual), type: "PERCENTAGE" },
    interest: { value: pct(p.perfil.juros_mes_percentual) },
    ...(pct(p.perfil.desconto_ate_vencimento_percentual) > 0
      ? { discount: { value: pct(p.perfil.desconto_ate_vencimento_percentual), dueDateLimitDays: 0, type: "PERCENTAGE" } }
      : {}),
  };
}

export type AcaoWebhook =
  | { acao: "baixar"; pagamento: string; valor_cents: number; data: string }
  | { acao: "status"; pagamento: string; status: "visualizada" | "expirada" | "cancelada" }
  | { acao: "ignorar" };

type Evento = { id?: string; event?: string; payment?: { id?: string; value?: number; paymentDate?: string | null; clientPaymentDate?: string | null } };

// O que fazer com cada evento. Pagamento só conta quando o dinheiro cai (RECEIVED);
// CONFIRMED do boleto ainda não está na conta.
export function lerWebhook(evento: Evento, hoje: string): AcaoWebhook {
  const p = evento.payment;
  if (!p?.id) return { acao: "ignorar" };
  switch (evento.event) {
    case "PAYMENT_RECEIVED":
    case "PAYMENT_RECEIVED_IN_CASH":
      return { acao: "baixar", pagamento: p.id, valor_cents: Math.round((p.value ?? 0) * 100), data: p.paymentDate ?? p.clientPaymentDate ?? hoje };
    case "PAYMENT_CHECKOUT_VIEWED":
    case "PAYMENT_BANK_SLIP_VIEWED":
      return { acao: "status", pagamento: p.id, status: "visualizada" };
    case "PAYMENT_OVERDUE":
      return { acao: "status", pagamento: p.id, status: "expirada" };
    case "PAYMENT_DELETED":
    case "PAYMENT_REFUNDED":
      return { acao: "status", pagamento: p.id, status: "cancelada" };
    default:
      return { acao: "ignorar" };
  }
}

// Resposta de GET /payments/{id}. O webhook só diz qual pagamento mudou; valor, data e situação
// vêm daqui, para um token vazado não conseguir baixar cobrança com valor inventado.
export type Pagamento = { id?: string; status?: string; value?: number; paymentDate?: string | null; clientPaymentDate?: string | null; externalReference?: string | null };

export function lerPagamento(p: Pagamento, hoje: string) {
  const valor_cents = Math.round((p.value ?? 0) * 100);
  return {
    pago: (p.status === "RECEIVED" || p.status === "RECEIVED_IN_CASH") && valor_cents > 0,
    valor_cents,
    data: p.paymentDate ?? p.clientPaymentDate ?? hoje,
    referencia: p.externalReference ?? null,
  };
}

// Compara em tempo constante para não vazar o token pelo tempo de resposta
export function tokenConfere(recebido: string | null, esperado: string | undefined) {
  if (!recebido || !esperado || recebido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return dif === 0;
}

// Ids do Asaas que vão na URL: só o formato do Asaas (pay_..., cus_...), nada de "/" ou "?".
export function idAsaas(id: unknown, prefixo: "pay" | "cus" | "sub"): string | null {
  return typeof id === "string" && new RegExp(`^${prefixo}_[A-Za-z0-9]+$`).test(id) ? id : null;
}

// Conta Asaas de cada piscicultura: subconta aberta pelo Balbina ou conta que a piscicultura já tinha.

export type SituacaoConta = "PENDING" | "AWAITING_APPROVAL" | "APPROVED" | "REJECTED";

export const SITUACAO_CONTA: Record<SituacaoConta, string> = {
  PENDING: "Falta enviar dados ou documentos",
  AWAITING_APPROVAL: "Em análise no Asaas",
  APPROVED: "Aprovada",
  REJECTED: "Recusada pelo Asaas",
};

export const TIPOS_EMPRESA_ASAAS: Record<string, string> = { LIMITED: "Limitada (Ltda)", INDIVIDUAL: "Empresário individual", MEI: "MEI", ASSOCIATION: "Associação ou cooperativa" };

// Eventos que a conta da piscicultura manda para o nosso webhook.
export const EVENTOS_WEBHOOK_PISCICULTURA = [
  "PAYMENT_RECEIVED", "PAYMENT_CHECKOUT_VIEWED", "PAYMENT_BANK_SLIP_VIEWED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED", "ACCOUNT_STATUS_GENERAL_APPROVAL_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_PENDING", "ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED",
];

export function montarWebhook(p: { url: string; email: string; token: string }) {
  return {
    name: "Balbina ERP", url: p.url, email: p.email, enabled: true, interrupted: false, apiVersion: 3,
    authToken: p.token, sendType: "SEQUENTIALLY", events: EVENTOS_WEBHOOK_PISCICULTURA,
  };
}

export function situacaoDoEvento(evento: string | undefined): SituacaoConta | null {
  const m = /^ACCOUNT_STATUS_GENERAL_APPROVAL_(APPROVED|AWAITING_APPROVAL|PENDING|REJECTED)$/.exec(evento ?? "");
  return m ? (m[1] as SituacaoConta) : null;
}

export type DadosSubconta = {
  nome: string; documento: string; email: string; celular: string; faturamento_cents: number | null;
  cep: string; endereco: string; numero: string; complemento: string; bairro: string; tipo_empresa: string; nascimento: string;
};

// Corpo do POST /v3/accounts. Devolve a mensagem do que falta, para a piscicultura corrigir antes de ir ao Asaas.
export function montarSubconta(d: DadosSubconta): { corpo: Record<string, unknown> } | { erro: string } {
  const doc = d.documento.replace(/\D/g, "");
  const cep = d.cep.replace(/\D/g, "");
  const celular = d.celular.replace(/\D/g, "");
  const pf = doc.length === 11;
  if (!d.email.includes("@")) return { erro: "Informe o e-mail da conta." };
  if (celular.length < 10) return { erro: "Informe o celular com DDD." };
  if (!d.faturamento_cents || d.faturamento_cents <= 0) return { erro: "Informe o faturamento mensal." };
  if (cep.length !== 8) return { erro: "Informe o CEP com 8 dígitos." };
  if (!d.endereco.trim() || !d.numero.trim() || !d.bairro.trim()) return { erro: "Informe endereço, número e bairro." };
  if (pf && !/^\d{4}-\d{2}-\d{2}$/.test(d.nascimento)) return { erro: "Produtor pessoa física: informe a data de nascimento." };
  if (!pf && !(d.tipo_empresa in TIPOS_EMPRESA_ASAAS)) return { erro: "Escolha o tipo de empresa." };
  return {
    corpo: {
      name: d.nome, email: d.email.trim().toLowerCase(), cpfCnpj: doc, mobilePhone: celular, incomeValue: d.faturamento_cents / 100,
      address: d.endereco.trim(), addressNumber: d.numero.trim(), province: d.bairro.trim(), postalCode: cep,
      ...(d.complemento.trim() ? { complement: d.complemento.trim() } : {}),
      ...(pf ? { birthDate: d.nascimento } : { companyType: d.tipo_empresa }),
    },
  };
}
