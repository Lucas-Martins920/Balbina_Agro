import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DadosCampo, Pendente } from "./tipos";

// A fila e os dados do campo ficam no aparelho (não são segredo: são os mesmos números do viveiro).
// Uma chave por piscicultura. Toda mudança na fila passa por `mudarFila`, uma de cada vez, relendo antes.
const chaveFila = (empresa: string) => `balbina:campo:fila:${empresa}`;
const chaveDados = (empresa: string) => `balbina:campo:dados:${empresa}`;

async function lerJson<T>(chave: string, padrao: T): Promise<T> {
  try {
    const v = await AsyncStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : padrao;
  } catch {
    return padrao;
  }
}

export const lerFila = (empresa: string) => lerJson<Pendente[]>(chaveFila(empresa), []);

let fila: Promise<unknown> = Promise.resolve();
export function mudarFila(empresa: string, mudar: (atual: Pendente[]) => Pendente[]): Promise<Pendente[]> {
  const proxima = fila.then(async () => {
    const nova = mudar(await lerFila(empresa));
    await AsyncStorage.setItem(chaveFila(empresa), JSON.stringify(nova));
    return nova;
  });
  fila = proxima.catch(() => undefined);
  return proxima;
}

export const lerDadosCampo = (empresa: string) => lerJson<DadosCampo | null>(chaveDados(empresa), null);
export async function gravarDadosCampo(empresa: string, dados: DadosCampo) {
  await AsyncStorage.setItem(chaveDados(empresa), JSON.stringify(dados));
}
