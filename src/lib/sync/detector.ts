// Tem internet de verdade? O navigator.onLine só diz se o aparelho está ligado a uma rede: no viveiro o celular
// pega o Wi-Fi da sede sem a sede ter internet e o navegador diz "online". Aqui a resposta vem de um pedido
// pequeno ao próprio servidor (o manifest, que não passa pelo login nem pelo banco). Quando um envio falha por
// rede, a tela chama marcarSemRede() e o detector volta a conferir a cada 10 s até o servidor responder.

const INTERVALO_SEM_REDE_MS = 10_000;
const PRAZO_PING_MS = 4_000;

let online = typeof navigator === "undefined" ? true : navigator.onLine;
let iniciado = false;
let conferindo: Promise<boolean> | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
const ouvintes = new Set<() => void>();
const aoVoltarOuvintes = new Set<() => void>();

function mudar(novo: boolean) {
  if (novo === online) return;
  const voltou = novo && !online;
  online = novo;
  if (online) {
    clearInterval(timer);
    timer = undefined;
  } else if (!timer && typeof setInterval !== "undefined") {
    timer = setInterval(() => void conferirConexao(), INTERVALO_SEM_REDE_MS);
  }
  for (const cb of ouvintes) cb();
  if (voltou) for (const cb of aoVoltarOuvintes) cb();
}

// Pergunta ao servidor. O parâmetro _ping faz o service worker deixar passar direto (sem cache).
export function conferirConexao(): Promise<boolean> {
  if (conferindo) return conferindo;
  if (typeof fetch === "undefined" || typeof navigator === "undefined") return Promise.resolve(online);
  if (!navigator.onLine) {
    mudar(false);
    return Promise.resolve(false);
  }
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), PRAZO_PING_MS);
  conferindo = fetch(`/manifest.webmanifest?_ping=${Date.now()}`, { method: "HEAD", cache: "no-store", signal: controle.signal })
    .then((r) => r.ok || r.status === 304)
    .catch(() => false)
    .then((ok) => {
      clearTimeout(prazo);
      conferindo = null;
      mudar(ok);
      return ok;
    });
  return conferindo;
}

function iniciar() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  online = navigator.onLine;
  window.addEventListener("online", () => void conferirConexao());
  window.addEventListener("offline", () => mudar(false));
  if (!online) timer = setInterval(() => void conferirConexao(), INTERVALO_SEM_REDE_MS);
}

export function conexaoAtual(): boolean {
  return online;
}

export function assinarConexao(cb: () => void): () => void {
  iniciar();
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

// Chamado quando a internet volta (de sem rede para com rede)
export function aoVoltarConexao(cb: () => void): () => void {
  iniciar();
  aoVoltarOuvintes.add(cb);
  return () => aoVoltarOuvintes.delete(cb);
}

// Um envio falhou por rede: considera sem internet até o servidor responder de novo
export function marcarSemRede() {
  iniciar();
  mudar(false);
}

export function marcarComRede() {
  mudar(true);
}
