// Preenchimento automático do cadastro pelos dados públicos: CNPJ (Receita, pela BrasilAPI) e CEP.
// Roda no navegador; só preenche campo vazio e a pessoa confere antes de salvar.

export type DadosCadastro = {
  nome?: string; email?: string; telefone?: string;
  cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string;
};

const limpo = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const digitos = (v: unknown) => limpo(v).replace(/\D/g, "");

function telefone(v: unknown) {
  const d = digitos(v);
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return "";
}

function cepFormatado(v: unknown) {
  const d = digitos(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : "";
}

// Resposta de https://brasilapi.com.br/api/cnpj/v1/{cnpj}
export function dadosDoCnpj(r: Record<string, unknown>): DadosCadastro {
  const tipo = limpo(r.descricao_tipo_de_logradouro);
  const rua = limpo(r.logradouro);
  return {
    nome: limpo(r.razao_social),
    email: limpo(r.email).toLowerCase(),
    telefone: telefone(r.ddd_telefone_1),
    cep: cepFormatado(r.cep),
    logradouro: tipo && rua && !rua.toUpperCase().startsWith(tipo.toUpperCase()) ? `${tipo} ${rua}` : rua,
    numero: limpo(r.numero),
    complemento: limpo(r.complemento),
    bairro: limpo(r.bairro),
    cidade: limpo(r.municipio),
    uf: limpo(r.uf).toUpperCase(),
  };
}

// Resposta de https://brasilapi.com.br/api/cep/v1/{cep}
export function dadosDoCep(r: Record<string, unknown>): DadosCadastro {
  return { cep: cepFormatado(r.cep), logradouro: limpo(r.street), bairro: limpo(r.neighborhood), cidade: limpo(r.city), uf: limpo(r.state).toUpperCase() };
}

async function buscar(url: string): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  }
}

export async function consultarCnpj(doc: string) {
  const d = doc.replace(/\D/g, "");
  if (d.length !== 14) return null;
  const r = await buscar(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
  return r ? dadosDoCnpj(r) : null;
}

export async function consultarCep(cep: string) {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return null;
  const r = await buscar(`https://brasilapi.com.br/api/cep/v1/${d}`);
  return r ? dadosDoCep(r) : null;
}
