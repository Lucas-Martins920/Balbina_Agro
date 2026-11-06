// Qualidade da água do viveiro, medida no turno do apontamento. O banco guarda cada medida no lançamento
// (apontamento_lancamentos) e o resumo do dia no apontamento; os alertas (view alertas) usam as mesmas faixas.
// Referência do tambaqui (Corrêa et al., "Criação de tambaquis", Embrapa Amazônia Oriental, 2018): oxigênio de
// 4 a 8 mg/L (abaixo de 3, suspender a ração), temperatura de 28 a 30 °C, pH de 5 a 7, amônia tóxica abaixo
// de 0,46 mg/L.

export type ChaveAgua = "oxigenio_mg_l" | "temperatura_c" | "ph" | "transparencia_cm" | "amonia_mg_l";
export type Agua = Partial<Record<ChaveAgua, number>>;

export const CAMPOS_AGUA: readonly { chave: ChaveAgua; nome: string; curto: string; unidade: string; min: number; max: number; ajuda: string }[] = [
  { chave: "oxigenio_mg_l", nome: "Oxigênio dissolvido", curto: "Oxigênio", unidade: "mg/L", min: 0, max: 30, ajuda: "De preferência ao amanhecer, quando é mais baixo. Ideal de 4 a 8." },
  { chave: "temperatura_c", nome: "Temperatura da água", curto: "Temperatura", unidade: "°C", min: 0, max: 45, ajuda: "O tambaqui come melhor entre 28 e 30 °C." },
  { chave: "ph", nome: "pH", curto: "pH", unidade: "", min: 0, max: 14, ajuda: "Referência de 5 a 7." },
  { chave: "transparencia_cm", nome: "Transparência (disco de Secchi)", curto: "Transparência", unidade: "cm", min: 0, max: 500, ajuda: "Água verde boa: de 30 a 40 cm." },
  { chave: "amonia_mg_l", nome: "Amônia total", curto: "Amônia", unidade: "mg/L", min: 0, max: 50, ajuda: "Com pH e temperatura, o sistema calcula a parte tóxica." },
];

const CHAVES = new Set<string>(CAMPOS_AGUA.map((c) => c.chave));

// Texto digitado ("5,2", "5.2") -> número. undefined quando vazio, null quando não é número.
export function lerMedida(valor: unknown): number | null | undefined {
  const t = String(valor ?? "").trim().replace(",", ".");
  if (t === "") return undefined;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

// Objeto vindo do formulário ou do celular. Vazio vira null (o banco grava sem medida).
export function validarAgua(v: unknown): { ok: Agua | null } | { erro: string } {
  if (v === undefined || v === null) return { ok: null };
  if (typeof v !== "object" || Array.isArray(v)) return { erro: "Qualidade da água inválida." };
  const ok: Agua = {};
  for (const [chave, bruto] of Object.entries(v as Record<string, unknown>)) {
    if (!CHAVES.has(chave)) return { erro: "Medida da água desconhecida." };
    const campo = CAMPOS_AGUA.find((c) => c.chave === chave)!;
    const n = typeof bruto === "number" ? bruto : lerMedida(bruto);
    if (n === undefined || (typeof bruto === "number" && !Number.isFinite(bruto))) continue;
    if (n === null || !Number.isFinite(n) || n < campo.min || n > campo.max) {
      return { erro: `${campo.nome}: informe um número de ${campo.min} a ${campo.max}${campo.unidade ? ` ${campo.unidade}` : ""}.` };
    }
    ok[campo.chave] = n;
  }
  return { ok: Object.keys(ok).length ? ok : null };
}

// Campos agua_<chave> do formulário (apontamento do site)
export function lerAguaForm(form: FormData) {
  const bruto: Record<string, unknown> = {};
  for (const c of CAMPOS_AGUA) bruto[c.chave] = form.get(`agua_${c.chave}`);
  return validarAgua(bruto);
}

// Amônia tóxica (NH3, mg/L) pela amônia total, pH e temperatura (Emerson et al., 1975). Igual a app.amonia_toxica.
export function amoniaToxica(total: number | null | undefined, ph: number | null | undefined, temperatura: number | null | undefined) {
  if (total === null || total === undefined || ph === null || ph === undefined || temperatura === null || temperatura === undefined) return null;
  const pka = 0.09018 + 2729.92 / (temperatura + 273.15);
  return Math.round((total / (1 + 10 ** (pka - ph))) * 1000) / 1000;
}

export type NivelAgua = "critico" | "atencao";
export type AvisoAgua = { chave: ChaveAgua; nivel: NivelAgua; texto: string };

const br = (n: number, casas = 1) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(n);

// O que a medida pede na hora, com as mesmas faixas dos alertas do banco
export function avisosAgua(a: Agua | null | undefined): AvisoAgua[] {
  if (!a) return [];
  const avisos: AvisoAgua[] = [];
  const od = a.oxigenio_mg_l;
  if (od !== undefined && od < 3) avisos.push({ chave: "oxigenio_mg_l", nivel: "critico", texto: `Oxigênio ${br(od)} mg/L: suspenda a ração e ligue o aerador.` });
  else if (od !== undefined && od < 4) avisos.push({ chave: "oxigenio_mg_l", nivel: "atencao", texto: `Oxigênio ${br(od)} mg/L: abaixo do ideal (4 a 8). Reduza a ração e acompanhe.` });
  const t = a.temperatura_c;
  if (t !== undefined && (t < 24 || t > 33)) avisos.push({ chave: "temperatura_c", nivel: "atencao", texto: `Água a ${br(t)} °C: fora da faixa (28 a 30 °C), o peixe come menos.` });
  const ph = a.ph;
  if (ph !== undefined && (ph < 4.5 || ph > 8.5)) avisos.push({ chave: "ph", nivel: "atencao", texto: `pH ${br(ph)}: fora da faixa (5 a 7)${ph < 4.5 ? "; avalie a calagem" : ""}.` });
  const nh3 = amoniaToxica(a.amonia_mg_l, a.ph, a.temperatura_c);
  if (nh3 !== null && nh3 >= 0.2) {
    avisos.push({ chave: "amonia_mg_l", nivel: nh3 >= 0.46 ? "critico" : "atencao", texto: `Amônia tóxica ${br(nh3, 3)} mg/L: reduza a ração e renove a água.` });
  } else if (nh3 === null && a.amonia_mg_l !== undefined && a.amonia_mg_l >= 1) {
    avisos.push({ chave: "amonia_mg_l", nivel: "atencao", texto: `Amônia total ${br(a.amonia_mg_l, 2)} mg/L: meça pH e temperatura para saber a parte tóxica.` });
  }
  return avisos;
}

// Resumo curto para listas: "OD 5,2 · 29 °C · pH 6,5"
export function resumoAgua(a: Agua | null | undefined) {
  if (!a) return "";
  return [
    a.oxigenio_mg_l !== undefined && `OD ${br(a.oxigenio_mg_l)}`,
    a.temperatura_c !== undefined && `${br(a.temperatura_c)} °C`,
    a.ph !== undefined && `pH ${br(a.ph)}`,
    a.transparencia_cm !== undefined && `Secchi ${br(a.transparencia_cm, 0)} cm`,
    a.amonia_mg_l !== undefined && `amônia ${br(a.amonia_mg_l, 2)}`,
  ].filter(Boolean).join(" · ");
}
