// Crescimento do peixe pela curva da espécie. As contas são as mesmas do banco (app.peso_curva,
// app.idade_equivalente e app.peso_estimado), para a tela comparar biometria com o esperado e projetar
// as próximas semanas sem ida e volta ao servidor.
//
// A curva é o peso esperado por semana de cultivo (semana 1 = povoamento de pós-larva). Um lote povoado com
// juvenis começa adiante na curva: a "idade equivalente" é o dia da curva em que a espécie tem aquele peso.

type Num = number | string | null | undefined;
const num = (v: Num) => (v === null || v === undefined || v === "" ? null : Number(v));

export type PontoCurva = { semana: number; peso_g: Num };

function pontos(curva: PontoCurva[]) {
  return curva
    .map((c) => ({ semana: Number(c.semana), peso: num(c.peso_g) }))
    .filter((c): c is { semana: number; peso: number } => c.peso !== null)
    .sort((a, b) => a.semana - b.semana);
}

// Peso da curva depois de `dias` de cultivo, interpolado entre as semanas (app.peso_curva)
export function pesoCurva(curva: PontoCurva[], dias: number): number | null {
  const c = pontos(curva);
  if (!c.length) return null;
  const s = Math.max(dias, 0) / 7 + 1;
  const a = [...c].reverse().find((p) => p.semana <= s);
  const b = c.find((p) => p.semana > s);
  if (!a) return b!.peso;
  if (!b) return a.peso;
  return a.peso + ((b.peso - a.peso) * (s - a.semana)) / (b.semana - a.semana);
}

// Dias de cultivo, pela curva, em que a espécie chega a um peso (app.idade_equivalente)
export function idadeEquivalente(curva: PontoCurva[], pesoG: Num): number | null {
  const p = num(pesoG);
  const c = pontos(curva);
  if (p === null || !c.length) return null;
  const abaixo = c.filter((x) => x.peso <= p).sort((x, y) => y.peso - x.peso || y.semana - x.semana)[0];
  const acima = c.filter((x) => x.peso > p).sort((x, y) => x.peso - y.peso || x.semana - y.semana)[0];
  if (!abaixo) return 0;
  if (!acima) return (abaixo.semana - 1) * 7;
  if (acima.peso === abaixo.peso) return (abaixo.semana - 1) * 7;
  return (abaixo.semana - 1 + ((acima.semana - abaixo.semana) * (p - abaixo.peso)) / (acima.peso - abaixo.peso)) * 7;
}

// Peso esperado depois de `dias` partindo de um peso conhecido (do povoamento ou da última biometria).
// A curva só faz o peso subir: peixe acima do fim da curva fica no peso medido (app.peso_estimado).
export function pesoEsperado(curva: PontoCurva[], pesoInicialG: Num, dias: number): number | null {
  const inicial = num(pesoInicialG);
  if (inicial === null) return null;
  const idade = idadeEquivalente(curva, inicial);
  if (idade === null) return inicial;
  const p = pesoCurva(curva, idade + Math.max(dias, 0));
  return Math.max(p ?? inicial, inicial);
}

const dia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
export const diasEntre = (de: string, ate: string) => Math.round(dia(ate) - dia(de));

// Semana de cultivo, contada do povoamento (mesma conta das views: (data - povoamento) / 7 + 1)
export function semanaCultivo(povoamento: string, data: string) {
  return Math.floor(diasEntre(povoamento, data) / 7) + 1;
}

export type Biometria = { data: string; peso_medio_g: Num; uniformidade_pct?: Num; peixes?: Num; comprimento_cm?: Num };

export type PontoCrescimento = {
  data: string; dias: number; semana: number; peso: number | null; esperado: number | null;
  diferencaPct: number | null; uniformidade: number | null;
  // ganho de peso diário desde a biometria anterior (ou desde o povoamento)
  gpd: number | null;
};

// Cada biometria do lote contra o peso esperado desde o povoamento
export function crescimentoLote({ povoamento, pesoInicialG, biometrias, curva }: {
  povoamento: string; pesoInicialG: Num; biometrias: Biometria[]; curva: PontoCurva[];
}): PontoCrescimento[] {
  let anterior: { data: string; peso: number | null } = { data: povoamento, peso: num(pesoInicialG) };
  return [...biometrias]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((b) => {
      const dias = diasEntre(povoamento, b.data);
      const peso = num(b.peso_medio_g);
      const esperado = pesoEsperado(curva, pesoInicialG, dias);
      const intervalo = diasEntre(anterior.data, b.data);
      const gpd = peso !== null && anterior.peso !== null && intervalo > 0 ? (peso - anterior.peso) / intervalo : null;
      anterior = { data: b.data, peso };
      return {
        data: b.data, dias, semana: semanaCultivo(povoamento, b.data), peso, esperado,
        diferencaPct: peso !== null && esperado ? (peso / esperado - 1) * 100 : null,
        uniformidade: num(b.uniformidade_pct), gpd,
      };
    });
}

// Fator de crescimento do lote: quanto ele ganhou de peso, da referência ao povoamento até a última biometria,
// contra o que a curva previa no mesmo período (1 = igual à curva). Sem biometria, 1.
export const FATOR_MIN = 0.5;
export const FATOR_MAX = 1.3;

export function fatorCrescimento(pontosLote: PontoCrescimento[], pesoInicialG: Num): number {
  const inicial = num(pesoInicialG);
  const ultimo = [...pontosLote].reverse().find((p) => p.peso !== null && p.esperado !== null);
  if (!ultimo || inicial === null) return 1;
  const ganhoEsperado = ultimo.esperado! - inicial;
  if (ganhoEsperado <= 0) return 1;
  return Math.min(FATOR_MAX, Math.max(FATOR_MIN, (ultimo.peso! - inicial) / ganhoEsperado));
}
