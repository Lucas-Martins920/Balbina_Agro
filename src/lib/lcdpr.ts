// E2 do estudo de automação: Livro Caixa Digital do Produtor Rural (LCDPR), leiaute 1.3 da Receita
// (Ato Declaratório Executivo COPES nº 1/2020, versão 0013). Texto UTF-8, campos separados por "|",
// linhas terminadas em CRLF, valores sem separador com 2 casas implícitas, datas ddmmaaaa.
// O conteúdo sai do financeiro realizado (baixas); o contador confere antes de transmitir.

export type ProdutorLcdpr = {
  cpf: string; nome: string; forma_apuracao: 1 | 2;
  endereco: string; numero: string; complemento?: string | null; bairro: string; uf: string; cod_mun: string; cep: string;
  telefone?: string | null; email: string;
};
export type ImovelLcdpr = {
  codigo: number; cad_itr?: string | null; caepf?: string | null; inscricao_estadual?: string | null; nome: string;
  endereco: string; numero?: string | null; complemento?: string | null; bairro: string; uf: string; cod_mun: string; cep: string;
  tipo_exploracao: number; participacao_centesimos: number; // 10000 = 100%
  terceiros?: { tipo: number; documento: string; nome: string; participacao_centesimos: number }[];
};
export type ContaLcdpr = { codigo: number; banco: string; nome_banco: string; agencia: string; numero: string };
export type LancamentoLcdpr = {
  data: string; // AAAA-MM-DD
  cod_imovel: number; cod_conta: number; // conta 0 = espécie, 999 = numerário em trânsito
  num_doc?: string | null; tipo_doc: number; hist: string; id_partic: string;
  tipo_lanc: 1 | 2 | 3; entrada_cents: number; saida_cents: number;
};
export type Contador = { nome?: string | null; documento?: string | null; crc?: string | null; email?: string | null; fone?: string | null };

const so = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
// texto livre: sem "|", sem caracteres de controle, no tamanho do campo
const txt = (v: string | null | undefined, max = 255) => (v ?? "").replace(/[|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const num = (n: number, largura = 3) => String(n).padStart(largura, "0");
const data = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
const mes = (iso: string) => `${iso.slice(5, 7)}${iso.slice(0, 4)}`;
const valor = (cents: number) => String(Math.abs(Math.round(cents)));
const natureza = (cents: number) => (cents < 0 ? "N" : "P");

export function gerarLcdpr(p: {
  produtor: ProdutorLcdpr; imoveis: ImovelLcdpr[]; contas: ContaLcdpr[]; lancamentos: LancamentoLcdpr[];
  de: string; ate: string; contador?: Contador;
}): string {
  const linhas: string[][] = [];
  const pr = p.produtor;
  linhas.push(["0000", "LCDPR", "0013", so(pr.cpf), txt(pr.nome), "0", "0", "", data(p.de), data(p.ate)]);
  linhas.push(["0010", String(pr.forma_apuracao)]);
  linhas.push(["0030", txt(pr.endereco, 150), txt(pr.numero, 6) || "SN", txt(pr.complemento, 50), txt(pr.bairro, 50), txt(pr.uf, 2).toUpperCase(),
    so(pr.cod_mun), so(pr.cep), so(pr.telefone).slice(0, 15), txt(pr.email, 115)]);
  for (const i of p.imoveis) {
    linhas.push(["0040", num(i.codigo), "BR", "BRL", so(i.cad_itr), so(i.caepf), so(i.inscricao_estadual), txt(i.nome, 50), txt(i.endereco, 150),
      txt(i.numero, 6), txt(i.complemento, 50), txt(i.bairro, 50), txt(i.uf, 2).toUpperCase(), so(i.cod_mun), so(i.cep),
      String(i.tipo_exploracao), num(i.participacao_centesimos, 5)]);
    for (const t of i.terceiros ?? []) {
      linhas.push(["0045", num(i.codigo), String(t.tipo), so(t.documento), txt(t.nome, 50), num(t.participacao_centesimos, 5)]);
    }
  }
  for (const c of p.contas) {
    linhas.push(["0050", num(c.codigo), "BR", num(Number(so(c.banco) || 0)), txt(c.nome_banco, 30), so(c.agencia).slice(0, 4), so(c.numero).slice(0, 16)]);
  }

  const ordenados = [...p.lancamentos].sort((a, b) => a.data.localeCompare(b.data));
  let saldo = 0;
  const meses = new Map<string, { entrada: number; saida: number; saldo: number }>();
  for (const l of ordenados) {
    saldo += l.entrada_cents - l.saida_cents;
    linhas.push(["Q100", data(l.data), num(l.cod_imovel), num(l.cod_conta), txt(l.num_doc), String(l.tipo_doc), txt(l.hist) || "Lançamento",
      so(l.id_partic), String(l.tipo_lanc), valor(l.entrada_cents), valor(l.saida_cents), valor(saldo), natureza(saldo)]);
    const m = meses.get(mes(l.data)) ?? { entrada: 0, saida: 0, saldo: 0 };
    m.entrada += l.entrada_cents; m.saida += l.saida_cents; m.saldo = saldo;
    meses.set(mes(l.data), m);
  }
  for (const [m, v] of meses) linhas.push(["Q200", m, valor(v.entrada), valor(v.saida), valor(v.saldo), natureza(v.saldo)]);

  const c = p.contador ?? {};
  // QTD_LIN conta todas as linhas do arquivo, inclusive a própria 9999
  linhas.push(["9999", txt(c.nome), so(c.documento), txt(c.crc), txt(c.email, 115), so(c.fone).slice(0, 15), String(linhas.length + 1)]);
  return linhas.map((l) => l.join("|")).join("\r\n") + "\r\n";
}

// O que falta no cadastro para o arquivo passar no validador.
export function faltasLcdpr(produtor: Partial<ProdutorLcdpr>, imovel: Partial<ImovelLcdpr>): string[] {
  const f: string[] = [];
  if (!/^\d{11}$/.test(so(produtor.cpf))) f.push("CPF do produtor");
  if (!produtor.nome) f.push("nome do produtor");
  if (!produtor.endereco || !produtor.bairro) f.push("endereço do produtor");
  if (!/^\d{7}$/.test(so(produtor.cod_mun))) f.push("código IBGE do município do produtor");
  if (!/^\d{8}$/.test(so(produtor.cep))) f.push("CEP do produtor");
  if (!produtor.email) f.push("e-mail do produtor");
  if (!imovel.nome) f.push("nome do imóvel rural");
  if (!/^\d{8}$/.test(so(imovel.cad_itr))) f.push("número do imóvel na Receita (CIB/NIRF, 8 dígitos)");
  if (!/^\d{14}$/.test(so(imovel.caepf))) f.push("CAEPF (14 dígitos)");
  if (!/^\d{7}$/.test(so(imovel.cod_mun))) f.push("código IBGE do município do imóvel");
  return f;
}
