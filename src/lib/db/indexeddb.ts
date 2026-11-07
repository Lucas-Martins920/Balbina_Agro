// Armazém do aparelho: os dados que o celular guarda sem internet (filas de envio do campo e do vendedor, conversa
// do chat, preferências das telas) ficam no IndexedDB, não no localStorage. O localStorage tem uns 5 MB, trava a
// tela a cada gravação e o navegador apaga quando falta espaço; o IndexedDB guarda centenas de MB e, com
// navigator.storage.persist(), não é apagado sozinho.
//
// O React precisa ler de forma síncrona (useSyncExternalStore) e o IndexedDB só responde de forma assíncrona. Por
// isso o armazém mantém uma cópia em memória: ao abrir, carrega tudo do banco; cada gravação muda a memória na
// hora (a tela já mostra) e vai para o IndexedDB logo em seguida. Outra aba do mesmo app fica sabendo pelo
// BroadcastChannel. Sem IndexedDB (navegador antigo, aba anônima do Firefox), cai para o localStorage.
//
// Fica fora daqui o que precisa ser lido antes da página desenhar (tema, lateral recolhida, versão completa):
// esses scripts rodam no <head>, antes de qualquer código assíncrono, e continuam no localStorage.
//
// Sem import de "@/": os testes (node --test) carregam este arquivo direto.

export const NOME_BANCO = "balbina";
export const LOJA = "dados";
const VERSAO = 1;
const CANAL = "balbina-armazem";

// O que já existia no localStorage e passa para o IndexedDB na primeira abertura (depois sai do localStorage)
export const PREFIXOS_MIGRADOS = ["balbina:campo:", "balbina:vendedor:"];

export function deveMigrar(chave: string): boolean {
  return PREFIXOS_MIGRADOS.some((p) => chave.startsWith(p));
}

type Estado = "fechado" | "abrindo" | "pronto" | "sem-indexeddb";

const memoria = new Map<string, string>();
const ouvintes = new Set<() => void>();
let estado: Estado = "fechado";
let abertura: Promise<void> | null = null;
let banco: IDBDatabase | null = null;
let canal: BroadcastChannel | null = null;
// gravações feitas antes do banco abrir: vão para o IndexedDB assim que ele abrir
const pendentesAntesDeAbrir = new Map<string, string | null>();
let falhaGravacao: ((erro: unknown) => void) | null = null;

function avisar() {
  for (const cb of ouvintes) cb();
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

function fim(tx: IDBTransaction): Promise<void> {
  return new Promise((ok, falha) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => falha(tx.error);
    tx.onabort = () => falha(tx.error ?? new Error("transação abortada"));
  });
}

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(NOME_BANCO, VERSAO);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(LOJA)) r.result.createObjectStore(LOJA);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
    r.onblocked = () => falha(new Error("IndexedDB bloqueado por outra aba"));
  });
}

function lerStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // armazenamento bloqueado
  }
}

async function carregarTudo(db: IDBDatabase) {
  const tx = db.transaction(LOJA, "readonly");
  const loja = tx.objectStore(LOJA);
  const [chaves, valores] = await Promise.all([req(loja.getAllKeys()), req(loja.getAll())]);
  chaves.forEach((k, i) => {
    // o que a tela gravou antes de o banco abrir é mais novo que o que estava no banco
    if (typeof k === "string" && typeof valores[i] === "string" && !pendentesAntesDeAbrir.has(k)) memoria.set(k, valores[i]);
  });
}

// Copia do localStorage para o IndexedDB o que ainda não está lá e apaga do localStorage
async function migrarLocalStorage(db: IDBDatabase) {
  const ls = lerStorage();
  if (!ls) return;
  const achados: [string, string][] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (!k || !deveMigrar(k)) continue;
    const v = ls.getItem(k);
    if (v !== null) achados.push([k, v]);
  }
  if (!achados.length) return;
  const tx = db.transaction(LOJA, "readwrite");
  const loja = tx.objectStore(LOJA);
  for (const [k, v] of achados) {
    // o IndexedDB já tem a chave (migração de outra aba): fica o do banco
    if (!memoria.has(k) && !pendentesAntesDeAbrir.has(k)) {
      loja.put(v, k);
      memoria.set(k, v);
    }
  }
  await fim(tx);
  for (const [k] of achados) ls.removeItem(k);
}

async function gravarNoBanco(db: IDBDatabase, mudancas: Map<string, string | null>) {
  const tx = db.transaction(LOJA, "readwrite");
  const loja = tx.objectStore(LOJA);
  for (const [k, v] of mudancas) {
    if (v === null) loja.delete(k);
    else loja.put(v, k);
  }
  await fim(tx);
}

function ouvirOutrasAbas() {
  if (typeof BroadcastChannel === "undefined" || canal) return;
  canal = new BroadcastChannel(CANAL);
  canal.onmessage = (e: MessageEvent<{ chave?: string; valor?: string | null }>) => {
    const { chave, valor } = e.data ?? {};
    if (typeof chave !== "string") return;
    if (valor === null || valor === undefined) memoria.delete(chave);
    else memoria.set(chave, valor);
    avisar();
  };
}

// Abre o banco e carrega a memória. Pode chamar quantas vezes quiser: abre uma vez só.
export function abrirArmazem(): Promise<void> {
  if (abertura) return abertura;
  estado = "abrindo";
  abertura = (async () => {
    if (typeof indexedDB === "undefined") {
      estado = "sem-indexeddb";
      return;
    }
    try {
      banco = await abrirBanco();
      banco.onversionchange = () => banco?.close();
      await carregarTudo(banco);
      await migrarLocalStorage(banco);
      if (pendentesAntesDeAbrir.size) {
        await gravarNoBanco(banco, new Map(pendentesAntesDeAbrir));
        pendentesAntesDeAbrir.clear();
      }
      estado = "pronto";
      ouvirOutrasAbas();
    } catch {
      banco = null;
      estado = "sem-indexeddb";
    }
    avisar();
  })();
  return abertura;
}

export function armazemPronto(): boolean {
  return estado === "pronto" || estado === "sem-indexeddb";
}

export function usandoIndexedDB(): boolean {
  return estado === "pronto";
}

// Leitura síncrona. Antes do banco abrir (primeiro desenho da tela) ou sem IndexedDB, lê o localStorage.
export function lerItem(chave: string): string | null {
  const m = memoria.get(chave);
  if (m !== undefined) return m;
  if (pendentesAntesDeAbrir.has(chave)) return pendentesAntesDeAbrir.get(chave) ?? null;
  if (estado === "pronto") return null;
  try {
    return lerStorage()?.getItem(chave) ?? null;
  } catch {
    return null;
  }
}

// Grava na memória (a tela vê na hora) e no IndexedDB. Devolve false só quando não há onde guardar.
export function gravarItem(chave: string, valor: string | null): boolean {
  if (valor === null) memoria.delete(chave);
  else memoria.set(chave, valor);
  let ok = true;
  if (estado === "pronto" && banco) {
    gravarNoBanco(banco, new Map([[chave, valor]])).catch((e) => falhaGravacao?.(e));
  } else if (estado === "sem-indexeddb") {
    try {
      const ls = lerStorage();
      if (!ls) ok = false;
      else if (valor === null) ls.removeItem(chave);
      else ls.setItem(chave, valor);
    } catch {
      ok = false; // cota cheia
    }
  } else {
    pendentesAntesDeAbrir.set(chave, valor);
    void abrirArmazem();
  }
  canal?.postMessage({ chave, valor });
  avisar();
  return ok;
}

export const apagarItem = (chave: string) => gravarItem(chave, null);

export function lerJson<T>(chave: string, padrao: T): T {
  const bruto = lerItem(chave);
  if (bruto === null) return padrao;
  try {
    return JSON.parse(bruto) as T;
  } catch {
    return padrao;
  }
}

export const gravarJson = (chave: string, valor: unknown) => gravarItem(chave, JSON.stringify(valor));

// Para o useSyncExternalStore: avisa a cada mudança (desta aba, de outra aba ou quando o banco termina de abrir)
export function assinarArmazem(cb: () => void): () => void {
  ouvintes.add(cb);
  void abrirArmazem();
  return () => ouvintes.delete(cb);
}

// Gravação no IndexedDB que falhou depois (cota cheia): a tela pode avisar a pessoa
export function aoFalharGravacao(cb: ((erro: unknown) => void) | null) {
  falhaGravacao = cb;
}

// Só para os testes: volta ao estado inicial
export function _reiniciarArmazem() {
  banco?.close();
  canal?.close();
  banco = null;
  canal = null;
  abertura = null;
  estado = "fechado";
  memoria.clear();
  pendentesAntesDeAbrir.clear();
  ouvintes.clear();
}
