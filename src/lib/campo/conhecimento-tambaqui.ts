// Base de conhecimento do manejo do tambaqui, usada pelo chat do app de campo: inteira no prompt da IA (com cache)
// e, sem sinal, buscada por palavra-chave no próprio celular. Só entra aqui o que está nas fontes abaixo; o que não
// estiver na base o chat manda perguntar ao técnico (nunca inventa dose de remédio ou de corretivo).
//
// D1: Corrêa, R. O. et al. Criação de tambaquis. Embrapa Amazônia Oriental, 2018 (Coleção Criar).
// D2: Izel, A. C. U. et al. Produção intensiva de tambaqui em tanques escavados com aeração. Embrapa Amazônia
//     Ocidental, Circular Técnica 39, 2013.

export type FonteManejo = "D1" | "D2" | "Balbina";

export const FONTES: Record<FonteManejo, string> = {
  D1: "Corrêa et al., Criação de tambaquis, Embrapa Amazônia Oriental, 2018",
  D2: "Izel et al., Circular Técnica 39, Embrapa Amazônia Ocidental, 2013",
  Balbina: "regras do sistema Balbina",
};

export type TopicoManejo = {
  chave: string;
  titulo: string;
  palavras: string[]; // sem acento, minúsculas: o que a pessoa costuma falar
  texto: string;
  fontes: FonteManejo[];
};

// Tabela de arraçoamento do tambaqui (D1, tabela 3): faixa de peso, proteína, grânulo, % do peso vivo por dia
// (do começo para o fim da faixa) e refeições por dia. É a que o banco grava em tabela_arracoamento para o tambaqui
// (cada empresa pode ajustar a sua) e que racao_sugerida usa.
export const TABELA_ARRACOAMENTO = [
  { fase: "Alevinagem", de: 0.5, ate: 7, proteina: 55, granulo: "farelada", taxa: [20, 10], refeicoes: 6 },
  { fase: "Recria I", de: 7, ate: 25, proteina: 40, granulo: "1 a 2 mm", taxa: [7.7, 6.4], refeicoes: 4 },
  { fase: "Recria II", de: 25, ate: 70, proteina: 40, granulo: "2 a 4 mm", taxa: [5.9, 4.6], refeicoes: 4 },
  { fase: "Recria III", de: 70, ate: 188, proteina: 32, granulo: "4 a 6 mm", taxa: [4.2, 2.7], refeicoes: 4 },
  { fase: "Recria IV", de: 188, ate: 298, proteina: 28, granulo: "8 mm", taxa: [2.6, 2.2], refeicoes: 4 },
  { fase: "Engorda I", de: 298, ate: 530, proteina: 28, granulo: "8 mm", taxa: [2.1, 1.8], refeicoes: 3 },
  { fase: "Engorda II", de: 530, ate: 1000, proteina: 28, granulo: "8 mm", taxa: [1.7, 1.2], refeicoes: 2 },
  { fase: "Engorda III", de: 1000, ate: 2500, proteina: 28, granulo: "10 mm", taxa: [1.0, 0.8], refeicoes: 2 },
] as const;

const v = (n: number) => n.toLocaleString("pt-BR");

const linhasTabela = TABELA_ARRACOAMENTO.map(
  (f) => `${f.fase} (${v(f.de)} a ${v(f.ate)} g): ração com ${f.proteina}% de proteína, ${f.granulo}, ${v(f.taxa[0])}% a ${v(f.taxa[1])}% do peso vivo por dia, em ${f.refeicoes} refeições.`,
).join("\n");

export const TOPICOS_MANEJO: TopicoManejo[] = [
  {
    chave: "oxigenio",
    titulo: "Oxigênio dissolvido",
    palavras: ["oxigenio", "od", "boquejando", "boquejo", "superficie", "aerador", "aeracao", "asfixia", "respirando"],
    texto:
      "O ideal para o tambaqui é de 4 a 8 mg/L. Meça ao amanhecer, quando o oxigênio está mais baixo. " +
      "Abaixo de 3 mg/L, suspenda a ração até a água melhorar. Peixe boquejando na superfície de manhã é sinal de falta de oxigênio: " +
      "ligue o aerador, se houver, e avise o técnico. No sistema, abaixo de 4 mg/L o apontamento vira alerta de atenção e abaixo de 3 mg/L, crítico.",
    fontes: ["D1", "Balbina"],
  },
  {
    chave: "temperatura",
    titulo: "Temperatura da água",
    palavras: ["temperatura", "frio", "friagem", "calor", "graus", "quente"],
    texto:
      "O tambaqui come e cresce melhor com a água entre 28 e 30 °C. Em dias frios (friagem) ele come menos: " +
      "observe a sobra e diminua a ração para não perder ração nem sujar a água.",
    fontes: ["D1"],
  },
  {
    chave: "ph",
    titulo: "pH da água",
    palavras: ["ph", "acida", "acido", "alcalina", "calcario", "calagem", "cal"],
    texto:
      "A referência para o tambaqui é pH de 5 a 7. A correção da água ácida é a calagem, com a dose definida pela análise da água e do solo " +
      "(a base não traz dose de calcário: pergunte ao técnico). Registre cada aplicação no app, em Insumos, para o custo do lote.",
    fontes: ["D1", "Balbina"],
  },
  {
    chave: "amonia",
    titulo: "Amônia",
    palavras: ["amonia", "nh3", "amoniaco", "nitrito"],
    texto:
      "A parte tóxica da amônia deve ficar abaixo de 0,46 mg/L. Ela aumenta com pH e temperatura altos e com excesso de ração. " +
      "Com amônia alta, diminua a ração e avise o técnico. O sistema calcula a parte tóxica pela amônia total, o pH e a temperatura.",
    fontes: ["D1", "Balbina"],
  },
  {
    chave: "transparencia",
    titulo: "Transparência (disco de Secchi)",
    palavras: ["transparencia", "secchi", "disco", "agua verde", "plancton", "turva", "cor da agua", "adubacao", "adubo", "adubar"],
    texto:
      "Água verde boa tem transparência de 30 a 40 cm no disco de Secchi. Abaixo de 30 cm há plâncton demais e risco de faltar oxigênio de madrugada: " +
      "não adube e fique de olho no oxigênio. Acima de 40 cm a água está pobre: a adubação ajuda, na dose que o técnico indicar.",
    fontes: ["D1"],
  },
  {
    chave: "arracoamento",
    titulo: "Quanto e qual ração dar",
    palavras: ["racao", "arracoamento", "quanto", "trato", "tratar", "alimentar", "alimentacao", "proteina", "granulo", "milimetro", "refeicao", "refeicoes", "comer", "comida", "saco", "sacos"],
    texto:
      "A ração do dia é um percentual do peso vivo do viveiro (biomassa = peixes vivos × peso médio). Tabela do tambaqui:\n" +
      linhasTabela +
      "\nDivida a ração do dia pelas refeições. O app mostra a ração sugerida de cada viveiro pela última biometria; se sobrar ração, diminua.",
    fontes: ["D1", "Balbina"],
  },
  {
    chave: "biometria",
    titulo: "Biometria",
    palavras: ["biometria", "pesar", "pesagem", "amostra", "peso medio", "pesei", "medir"],
    texto:
      "Pese uma amostra de cerca de 10% dos peixes do viveiro. Até a Recria II (abaixo de 70 g), faça biometria a cada 15 dias; depois, uma vez por mês. " +
      "Lance no app o número de peixes pesados e o peso total da amostra: o peso médio, a biomassa e a ração sugerida se atualizam.",
    fontes: ["D1", "Balbina"],
  },
  {
    chave: "crescimento",
    titulo: "Crescimento esperado",
    palavras: ["crescimento", "crescer", "ganho", "gpd", "engorda", "tempo", "meses", "quando despescar", "peso de abate", "curva"],
    texto:
      "Alevinos de 0,5 g chegam a 5 a 7 g em cerca de 30 dias na alevinagem. Na engorda intensiva com aeração, o tambaqui foi de 160 g a 2,62 kg em 10 meses, " +
      "ganhando 8,1 g por dia, com conversão alimentar de 2,09. O app compara o peso das biometrias com a curva da espécie.",
    fontes: ["D1", "D2", "Balbina"],
  },
  {
    chave: "conversao",
    titulo: "Conversão alimentar",
    palavras: ["conversao", "ca", "fca", "racao por kg", "desperdicio", "sobra"],
    texto:
      "Conversão alimentar é quantos kg de ração foram gastos para cada kg de peixe ganho. A referência da Embrapa na engorda com aeração é 2,09. " +
      "Conversão alta costuma vir de sobra de ração, água ruim ou peixe doente: confira a sobra no cocho e a qualidade da água.",
    fontes: ["D2"],
  },
  {
    chave: "despesca",
    titulo: "Despesca e carência",
    palavras: ["despesca", "despescar", "colheita", "colher", "carencia", "abate", "vender"],
    texto:
      "Remédio com carência segura a despesca: o sistema não deixa despescar o lote antes do fim da carência. " +
      "Na despesca total, informe os kg retirados; o lote fecha sozinho quando não sobra peixe em nenhum viveiro.",
    fontes: ["Balbina"],
  },
  {
    chave: "mortalidade",
    titulo: "Mortes e doença",
    palavras: ["morte", "mortes", "morreu", "morreram", "mortos", "doenca", "doente", "mancha", "ferida", "parasita", "fungo", "remedio", "medicamento"],
    texto:
      "Registre as mortes de cada turno com a causa provável: o painel acompanha a mortalidade do lote. Peixe com manchas, feridas ou nadando de lado: " +
      "separe uma amostra e chame o técnico. A base não traz dose de remédio: só use o medicamento e a dose que o técnico indicar.",
    fontes: ["Balbina"],
  },
];

export function normalizarPergunta(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Os tópicos que respondem a pergunta, do mais para o menos citado. Usado sem sinal (e sem IA no servidor).
export function buscarConhecimento(pergunta: string, limite = 2): TopicoManejo[] {
  const t = ` ${normalizarPergunta(pergunta)} `;
  return TOPICOS_MANEJO
    .map((topico) => ({ topico, pontos: topico.palavras.reduce((s, p) => s + (t.includes(` ${p} `) || (p.includes(" ") && t.includes(p)) ? 1 : 0), 0) }))
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limite)
    .map((x) => x.topico);
}

// Texto inteiro da base para o prompt da IA (fica no cache: muda só quando este arquivo muda).
export function textoBaseConhecimento(): string {
  const corpo = TOPICOS_MANEJO.map((t) => `## ${t.titulo}\n${t.texto}\nFonte: ${t.fontes.map((f) => FONTES[f]).join("; ")}.`).join("\n\n");
  return `# Base de conhecimento do manejo do tambaqui\n\n${corpo}`;
}
