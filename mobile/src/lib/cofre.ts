import * as SecureStore from "expo-secure-store";
import { partes, juntar } from "./cofre-partes";

// Cofre do aparelho (Keychain no iPhone, Keystore no Android). Cada item tem limite de ~2 KB e a sessão
// do Supabase passa disso, então o valor vai em pedaços: <chave>.n guarda quantos, <chave>.0..n-1 o texto.
const OPCOES: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
const seguro = (chave: string) => chave.replace(/[^A-Za-z0-9._-]/g, "_");

export async function lerCofre(chave: string): Promise<string | null> {
  const k = seguro(chave);
  const n = Number(await SecureStore.getItemAsync(`${k}.n`, OPCOES));
  if (!n) return null;
  const pedacos: (string | null)[] = [];
  for (let i = 0; i < n; i++) pedacos.push(await SecureStore.getItemAsync(`${k}.${i}`, OPCOES));
  return juntar(pedacos);
}

export async function gravarCofre(chave: string, valor: string) {
  const k = seguro(chave);
  await apagarCofre(chave);
  const lista = partes(valor);
  for (let i = 0; i < lista.length; i++) await SecureStore.setItemAsync(`${k}.${i}`, lista[i], OPCOES);
  await SecureStore.setItemAsync(`${k}.n`, String(lista.length), OPCOES);
}

export async function apagarCofre(chave: string) {
  const k = seguro(chave);
  const n = Number(await SecureStore.getItemAsync(`${k}.n`, OPCOES));
  await SecureStore.deleteItemAsync(`${k}.n`, OPCOES);
  for (let i = 0; i < (n || 0); i++) await SecureStore.deleteItemAsync(`${k}.${i}`, OPCOES);
}

// Adaptador que o supabase-js usa para guardar a sessão
export const armazenamentoSessao = { getItem: lerCofre, setItem: gravarCofre, removeItem: apagarCofre };
