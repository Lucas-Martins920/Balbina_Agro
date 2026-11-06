// Planilha (CSV) de clientes ou fornecedores → pacote de importação. Reconhece as colunas pelos
// nomes mais comuns (LC Sistemas, NIBO, Excel feito à mão), com ou sem acento.
import { semAcento } from "./formato.ts";
import { documento, type ContatoImportado, type Pacote, type TipoContato } from "./importacao.ts";

// Lê CSV com ; ou , e aspas. A primeira linha é o cabeçalho.
export function lerCsv(texto: string): Record<string, string>[] {
  const t = texto.replace(/^﻿/, "");
  const primeira = t.slice(0, t.indexOf("\n") >= 0 ? t.indexOf("\n") : t.length);
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let campo = "", linha: string[] = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...resto] = linhas.filter((l) => l.some((v) => v.trim()));
  if (!cab) return [];
  const chaves = cab.map((h) => semAcento(h).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  return resto.map((l) => Object.fromEntries(chaves.map((k, i) => [k, (l[i] ?? "").trim()])));
}

const ALIASES: Record<string, string[]> = {
  chave: ["codigo_lc", "codigo", "cod", "id"],
  nome: ["nome", "razao_social", "nome_razao_social", "cliente", "fornecedor", "nome_fantasia"],
  cpf_cnpj: ["cpf_cnpj", "cnpj_cpf", "cpf", "cnpj", "documento", "cpf_cnpj_"],
  inscricao_estadual: ["inscricao_estadual", "ie", "insc_estadual"],
  email: ["email", "e_mail"],
  telefone: ["telefone", "fone", "celular", "telefone_1", "whatsapp"],
  logradouro: ["endereco", "logradouro", "rua", "end"],
  numero: ["numero", "n", "no"],
  bairro: ["bairro"],
  cep: ["cep"],
  complemento: ["complemento", "referencia", "ref"],
  cidade: ["cidade", "municipio"],
  uf: ["uf", "estado"],
};

function valor(linha: Record<string, string>, campo: string) {
  for (const a of ALIASES[campo]) if (linha[a]) return linha[a];
  return "";
}

export function pacotePlanilhaContatos(linhas: Record<string, string>[], tipo: TipoContato, origem: string): Pacote {
  const contatos: ContatoImportado[] = [];
  for (const l of linhas) {
    const nome = valor(l, "nome");
    if (!nome) continue;
    const endereco: Record<string, string> = {};
    for (const k of ["logradouro", "numero", "bairro", "cep", "complemento"]) {
      const v = valor(l, k);
      if (v) endereco[k] = k === "cep" ? v.replace(/\D/g, "") : v;
    }
    const uf = valor(l, "uf").toUpperCase();
    const chave = valor(l, "chave");
    contatos.push({
      chave: chave ? `${tipo}:${chave}` : undefined, nome, tipos: [tipo], cpf_cnpj: documento(valor(l, "cpf_cnpj")),
      inscricao_estadual: valor(l, "inscricao_estadual") || undefined, email: valor(l, "email") || undefined,
      telefone: valor(l, "telefone") || undefined, cidade: valor(l, "cidade") || undefined,
      uf: uf.length === 2 ? uf : undefined, endereco,
    });
  }
  return { origem, contatos };
}

// Texto do arquivo: UTF-8, e se vier quebrado tenta Windows-1252 (Excel brasileiro).
export function decodificar(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
