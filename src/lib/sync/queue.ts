// Regras da fila de envios que valem para qualquer tela que guarda lançamentos sem internet (campo, vendedor):
// quando tentar de novo, quando desistir e esperar a pessoa. A fila em si mora no armazém do aparelho
// (src/lib/db/indexeddb.ts); aqui só a regra, sem window, para os testes.

// Depois de tantas falhas seguidas do servidor (5xx, 429), o item para e espera a pessoa tocar em Reenviar.
// Falta de sinal não conta: sem rede o item nem é tentado.
export const MAX_TENTATIVAS = 8;
export const ESPERA_INICIAL_MS = 5_000;
export const ESPERA_MAXIMA_MS = 5 * 60_000;

export type ComRetry = {
  tentativas?: number;
  proxima_em?: string;   // antes disso a sincronização não manda o item de novo
  erro?: string;
  parado?: boolean;      // precisa da pessoa: não reenvia sozinho
};

// 5 s, 10 s, 20 s, 40 s... até 5 min entre uma tentativa e outra
export function esperaAntes(tentativas: number): number {
  if (tentativas <= 0) return 0;
  return Math.min(ESPERA_INICIAL_MS * 2 ** (tentativas - 1), ESPERA_MAXIMA_MS);
}

export function prontoAgora(item: ComRetry, agora: number): boolean {
  if (item.parado) return false;
  if (!item.proxima_em) return true;
  const t = Date.parse(item.proxima_em);
  return Number.isNaN(t) || t <= agora;
}

// O servidor falhou (erro temporário): conta a tentativa e marca quando tentar de novo, ou para no limite
export function registrarFalha<T extends ComRetry>(item: T, erro: string, agora: number): T {
  const tentativas = (item.tentativas ?? 0) + 1;
  if (tentativas >= MAX_TENTATIVAS) {
    return { ...item, tentativas, erro: `${erro} Parou depois de ${MAX_TENTATIVAS} tentativas: toque em Reenviar.`, parado: true, proxima_em: undefined };
  }
  return { ...item, tentativas, erro, parado: false, proxima_em: new Date(agora + esperaAntes(tentativas)).toISOString() };
}

// A pessoa pediu para reenviar: zera a contagem
export function liberar<T extends ComRetry>(item: T): T {
  return { ...item, tentativas: 0, proxima_em: undefined, erro: undefined, parado: undefined };
}

// Quanto falta para o próximo item da fila poder ir (null: nenhum vai sozinho)
export function proximaRodada(itens: ComRetry[], agora: number): number | null {
  let menor: number | null = null;
  for (const i of itens) {
    if (i.parado) continue;
    const t = i.proxima_em ? Date.parse(i.proxima_em) : agora;
    const falta = Math.max(0, (Number.isNaN(t) ? agora : t) - agora);
    menor = menor === null ? falta : Math.min(menor, falta);
  }
  return menor;
}
