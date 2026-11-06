// Regras de conciliação em partes: cada chamada a aplicar_regras_lote para em ~3 s (o banco corta
// a consulta do usuário em 8 s) e devolve onde parou; aqui chamamos de novo até acabar ou até o
// prazo da requisição. O que sobrar continua pendente e sai no botão "Aplicar regras".

export type Ponto = { apos_data: string | null; apos_id: string | null };
export type Parte = { aplicadas: number; fim: boolean; apos_data?: string | null; apos_id?: string | null };
export type ResultadoRegras = { aplicadas: number; fim: boolean };

export async function aplicarRegrasEmPartes(
  chamar: (ponto: Ponto) => Promise<Parte>,
  opcoes: { inicio?: Ponto; prazoMs?: number; agora?: () => number } = {},
): Promise<ResultadoRegras> {
  const agora = opcoes.agora ?? Date.now;
  const limite = opcoes.prazoMs === undefined ? Infinity : agora() + opcoes.prazoMs;
  let ponto: Ponto = opcoes.inicio ?? { apos_data: null, apos_id: null };
  let aplicadas = 0;
  for (;;) {
    if (agora() >= limite) return { aplicadas, fim: false };
    const parte = await chamar(ponto);
    aplicadas += parte.aplicadas;
    if (parte.fim) return { aplicadas, fim: true };
    // sem ponto de continuação a próxima chamada recomeçaria do início: melhor parar
    if (!parte.apos_id) return { aplicadas, fim: false };
    ponto = { apos_data: parte.apos_data ?? null, apos_id: parte.apos_id };
  }
}
