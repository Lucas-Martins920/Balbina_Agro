// A3 do estudo de automação: apontamento por voz. O reconhecimento de fala do celular (pt-BR) devolve um
// texto como "viveiro 3, quarenta quilos de ração, duas mortes por falta de oxigênio, oxigênio quatro vírgula
// dois" e aqui ele vira os campos do formulário. Sem IA e sem internet: só números por extenso e
// palavras-chave. Quem lança confere.

import type { Agua } from "./agua.ts";
import { CAUSAS_MORTE } from "./causas-morte.ts";

export type ViveiroFala = { id: string; rotulo: string };
export type ResultadoFala = {
  viveiro_id?: string;
  mortes?: number;
  descartes?: number;
  racao_kg?: number;
  sacos?: number;   // "2 sacos de ração": racao_kg sai de sacos × kg do saco (o dito na frase ou o padrão da pessoa)
  causa?: string;
  agua?: Agua;
};

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
  oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600,
  setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};

export function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Troca números por extenso e "4.210" por algarismos: "quatro mil duzentos e dez" vira "4210".
export function numerosPorExtenso(texto: string): string {
  const t = normalizar(texto)
    .replace(/(\d{1,3})(?:\.(\d{3}))+(?!\d)/g, (m) => m.replace(/\./g, ""))
    .replace(/(\d),(\d)/g, "$1.$2");
  const tokens = t.split(/(\s+|[,;:!?]+)/);
  const saida: string[] = [];
  let total = 0;
  let grupo = 0;
  let aberto = false;
  let pendente: string[] = []; // separadores e "e" dentro de um número

  const fechar = () => {
    if (aberto) saida.push(String(total + grupo));
    saida.push(...pendente);
    total = 0; grupo = 0; aberto = false; pendente = [];
  };

  for (const tk of tokens) {
    const palavra = tk.trim();
    if (palavra === "") { if (aberto) pendente.push(tk); else saida.push(tk); continue; }
    if (palavra in UNIDADES) { grupo += UNIDADES[palavra]; aberto = true; pendente = []; continue; }
    if (/^\d+(\.\d+)?$/.test(palavra) && !aberto) { grupo = Number(palavra); aberto = true; pendente = []; continue; }
    if (palavra === "mil") { total += (grupo || 1) * 1000; grupo = 0; aberto = true; pendente = []; continue; }
    if (palavra === "e" && aberto) { pendente.push(tk); continue; }
    fechar();
    saida.push(tk);
  }
  fechar();
  // "quatro vírgula dois" -> "4.2"
  return saida.join("").replace(/(\d+)\s+virgula\s+(\d+)/g, "$1.$2");
}

const NUM = String.raw`(\d+(?:\.\d+)?)`;

// "3 mortes" ou "mortes 3": a ordem que a pessoa usa na frase (a do primeiro número) vale para todas.
function antesOuDepois(t: string, palavras: string, numeroPrimeiro: boolean): number | undefined {
  const depois = new RegExp(String.raw`${NUM}\s+(?:${palavras})\b`);
  const antes = new RegExp(String.raw`\b(?:${palavras})\s+(?:de\s+|foi\s+|foram\s+|:\s*)?${NUM}`);
  const [primeiro, segundo] = numeroPrimeiro ? [depois, antes] : [antes, depois];
  const m = primeiro.exec(t) ?? segundo.exec(t);
  return m ? Number(m[1]) : undefined;
}

// Palavra dita depois de "por" ou "de" -> causa da baixa (lista em causas-morte.ts)
const PALAVRAS_CAUSA: Record<string, string> = {
  "falta de oxigenio": "oxigenio", oxigenio: "oxigenio", asfixia: "oxigenio", boquejando: "oxigenio", aerador: "oxigenio",
  amonia: "qualidade_agua", "qualidade da agua": "qualidade_agua", "agua ruim": "qualidade_agua", ph: "qualidade_agua",
  doenca: "doenca", doente: "doenca", parasita: "doenca", fungo: "doenca", bacteria: "doenca", ictio: "doenca", mancha: "doenca",
  temperatura: "temperatura", frio: "temperatura", friagem: "temperatura", calor: "temperatura", estresse: "temperatura",
  predador: "predador", passaro: "predador", garca: "predador", bigua: "predador", jacare: "predador", lontra: "predador",
  ariranha: "predador", cobra: "predador", "martim pescador": "predador",
  manejo: "manejo", despesca: "manejo", transporte: "manejo", rede: "manejo", arrasto: "manejo", biometria: "manejo", pesagem: "manejo",
};

// Medidas da água: "oxigênio 4,2" ou "4,2 de oxigênio", "29 graus", "pH 6,5", "transparência 35", "amônia 0,5"
const MEDIDAS: { chave: keyof Agua; antes: RegExp; depois?: RegExp }[] = [
  { chave: "oxigenio_mg_l", antes: new RegExp(String.raw`\b(?:oxigenio|od)\s+(?:dissolvido\s+)?(?:de\s+|e\s+|:\s*)?${NUM}`), depois: new RegExp(String.raw`${NUM}\s*(?:mg|miligramas?)?\s*(?:por\s+litro\s+)?de\s+oxigenio`) },
  { chave: "temperatura_c", antes: new RegExp(String.raw`\btemperatura\s+(?:da\s+agua\s+)?(?:de\s+|e\s+|:\s*)?${NUM}`), depois: new RegExp(String.raw`${NUM}\s*(?:graus|°c?)`) },
  { chave: "ph", antes: new RegExp(String.raw`\bph\s+(?:de\s+|e\s+|:\s*)?${NUM}`) },
  { chave: "transparencia_cm", antes: new RegExp(String.raw`\b(?:transparencia|secchi)\s+(?:de\s+|e\s+|:\s*)?${NUM}`), depois: new RegExp(String.raw`${NUM}\s*(?:cm|centimetros?)\b`) },
  { chave: "amonia_mg_l", antes: new RegExp(String.raw`\bamonia\s+(?:total\s+)?(?:de\s+|e\s+|:\s*)?${NUM}`) },
];

export function interpretarFala(texto: string, viveiros: ViveiroFala[], kgSaco?: number): ResultadoFala {
  // "meio saco" e "1 saco e meio" antes dos números por extenso (meio não é número para eles)
  let t = numerosPorExtenso(normalizar(texto).replace(/\bmeio\s+saco\b/g, "0.5 saco"))
    .replace(/(\d+)\s+(sacos?|sacas?)\s+e\s+meio\b/g, (_, n: string, p: string) => `${Number(n) + 0.5} ${p}`);
  const r: ResultadoFala = {};

  const g = /\b(?:viveiro|tanque|acude|barragem)\s+(?:numero\s+)?([a-z0-9-]+)/.exec(t);
  if (g) {
    const alvo = g[1];
    const achado = viveiros.find((x) => {
      const rot = normalizar(x.rotulo);
      if (new RegExp(String.raw`(^|[^a-z0-9])${alvo}($|[^a-z0-9])`).test(rot)) return true;
      const digitos = rot.match(/\d+/)?.[0];
      return digitos !== undefined && /^\d+$/.test(alvo) && Number(digitos) === Number(alvo);
    });
    if (achado) r.viveiro_id = achado.id;
    t = t.replace(g[0], " "); // o número do viveiro não conta como mortes nem ração
  }

  // água primeiro: a medida sai do texto para não virar causa ("4,2 de oxigênio") nem morte
  const agua: Agua = {};
  for (const m of MEDIDAS) {
    const achou = m.antes.exec(t) ?? m.depois?.exec(t);
    if (!achou) continue;
    agua[m.chave] = Number(achou[1]);
    t = t.replace(achou[0], " ");
  }
  if (Object.keys(agua).length) r.agua = agua;

  // sacos de ração: "2 sacos", "3 sacos de 20 kg" (o kg dito na frase vale mais que o padrão)
  const sacos = new RegExp(String.raw`${NUM}\s*(?:sacos?|sacas?)\b(?:\s+de\s+(?:racao\s+de\s+)?${NUM}\s*(?:kg|quilos?|kilos?)\b)?`).exec(t);
  if (sacos) {
    r.sacos = Number(sacos[1]);
    const porSaco = sacos[2] !== undefined ? Number(sacos[2]) : kgSaco;
    if (porSaco && porSaco > 0) r.racao_kg = Math.round(r.sacos * porSaco * 1000) / 1000;
    t = t.replace(sacos[0], " ");
  }

  const racao = r.sacos !== undefined ? null
    : new RegExp(String.raw`${NUM}\s*(?:kg|quilos?|kilos?)\b`).exec(t) ?? new RegExp(String.raw`\bracao\s+(?:de\s+|:\s*)?${NUM}`).exec(t);
  if (racao) {
    r.racao_kg = Number(racao[1]);
    t = t.replace(racao[0], " ");
  }

  const palavraChave = /\b(mortes?|mortas?|mortos?|morreram|morreu|descart\w*|retirad\w*|sacrificad\w*)\b/.exec(t);
  const numero = new RegExp(NUM).exec(t);
  const np = !palavraChave || (numero !== null && numero.index < palavraChave.index);

  const mortes = antesOuDepois(t, "(?:peixes?\\s+)?(?:mortes|morte|mortas|morta|mortos|morto)|morreram|morreu", np);
  if (mortes !== undefined) r.mortes = Math.round(mortes);
  else if (/\b(sem|nenhuma)\s+morte/.test(t)) r.mortes = 0;
  const descartes = antesOuDepois(t, "descartes|descarte|descartei|descartados|retirados|retirei|sacrificados", np);
  if (descartes !== undefined) r.descartes = Math.round(descartes);
  else if (/\b(sem|nenhum)\s+descarte/.test(t)) r.descartes = 0;

  const causa = /\b(?:por|de)\s+([a-z ]{2,30})/g;
  for (const m of t.matchAll(causa)) {
    const trecho = m[1];
    const chave = Object.entries(PALAVRAS_CAUSA).find(([p]) => trecho.startsWith(p) || trecho.includes(` ${p}`))?.[1];
    if (chave && CAUSAS_MORTE.some((c) => c.chave === chave)) { r.causa = chave; break; }
  }
  return r;
}

const NOMES_AGUA: Record<keyof Agua, (v: number) => string> = {
  oxigenio_mg_l: (v) => `oxigênio ${v.toLocaleString("pt-BR")} mg/L`,
  temperatura_c: (v) => `${v.toLocaleString("pt-BR")} °C`,
  ph: (v) => `pH ${v.toLocaleString("pt-BR")}`,
  transparencia_cm: (v) => `transparência ${v.toLocaleString("pt-BR")} cm`,
  amonia_mg_l: (v) => `amônia ${v.toLocaleString("pt-BR")} mg/L`,
};

// Resumo do que foi entendido, para mostrar antes de a pessoa conferir.
export function resumoFala(r: ResultadoFala, viveiros: ViveiroFala[]): string {
  const partes: string[] = [];
  if (r.viveiro_id) partes.push(viveiros.find((g) => g.id === r.viveiro_id)?.rotulo ?? "viveiro");
  if (r.sacos !== undefined) {
    const sacos = `${r.sacos.toLocaleString("pt-BR")} ${r.sacos === 1 ? "saco" : "sacos"}`;
    partes.push(r.racao_kg !== undefined ? `${sacos} (${r.racao_kg.toLocaleString("pt-BR")} kg de ração)` : `${sacos} de ração`);
  } else if (r.racao_kg !== undefined) partes.push(`${r.racao_kg.toLocaleString("pt-BR")} kg de ração`);
  if (r.mortes !== undefined) partes.push(`${r.mortes} ${r.mortes === 1 ? "morte" : "mortes"}`);
  if (r.descartes !== undefined) partes.push(`${r.descartes} ${r.descartes === 1 ? "descarte" : "descartes"}`);
  if (r.causa) partes.push(`causa: ${CAUSAS_MORTE.find((c) => c.chave === r.causa)?.nome}`);
  for (const [chave, valor] of Object.entries(r.agua ?? {}) as [keyof Agua, number][]) partes.push(NOMES_AGUA[chave](valor));
  return partes.join(", ");
}
