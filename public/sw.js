// Service worker do Balbina: o sistema abre sem internet e os lançamentos do celular saem sozinhos.
//
// - Arquivos estáticos (_next/static, ícones): cache primeiro (o nome tem hash, nunca mudam).
// - Telas (toda navegação de página): rede primeiro, cache se estiver sem sinal ou a rede demorar. Cada tela
//   aberta com internet fica guardada; o app também pede para guardar de antemão as telas do menu ("aquecer",
//   src/components/offline.tsx). Ao sair da conta (ir para /login), as telas guardadas são apagadas.
// - Background Sync ("balbina-envios"): com envio na fila e o app fechado ou em segundo plano, o Android acorda
//   este worker quando a internet volta. Com uma tela aberta, ela mesma sincroniza (src/lib/sync/worker.ts);
//   sem tela aberta, o worker lê a fila no IndexedDB e envia com as mesmas regras de src/lib/campo/fila.ts e
//   src/lib/sync/queue.ts (o client_id evita duplicar no banco se a tela e o worker mandarem o mesmo item).
const ESTATICO = "balbina-estatico-v4";
const TELAS = "balbina-telas-v1";
const CACHES_ATUAIS = [ESTATICO, TELAS];
const TELAS_CELULAR = ["/campo", "/vendedor"];
const ARQUIVO_ESTATICO = /\/_next\/static\/[^"'\s\\)]+/g;
const FORA_DO_CACHE = /^\/(api|auth|login|app-captcha|aceitar-termos|assinatura|onboarding)(\/|$)/;

// Guarda os arquivos que a tela usa. Sem eles a página abre do cache mas os botões não funcionam.
async function guardarArquivos(urls) {
  const cache = await caches.open(ESTATICO);
  await Promise.all([...new Set(urls)].map(async (u) => {
    if (await cache.match(u)) return;
    try {
      const resp = await fetch(u);
      if (resp.ok) await cache.put(u, resp);
    } catch {
      /* sem sinal: fica para a próxima visita */
    }
  }));
}

function ehHtml(resp) {
  return (resp.headers.get("content-type") || "").includes("text/html");
}

async function guardarTela(chave, resp) {
  if (!resp.ok || resp.redirected || !ehHtml(resp)) return;
  const cache = await caches.open(TELAS);
  await cache.put(chave, resp.clone());
  const html = await resp.text();
  await guardarArquivos(html.match(ARQUIVO_ESTATICO) ?? []);
}

// Telas do menu, uma de cada vez para não pesar no servidor nem no celular
async function aquecer(caminhos) {
  for (const caminho of caminhos) {
    try {
      const resp = await fetch(caminho, { credentials: "include" });
      if (resp.redirected) return; // sessão caiu: para por aqui
      await guardarTela(caminho, resp);
    } catch {
      return; // sem sinal
    }
  }
}

self.addEventListener("install", (evento) => {
  evento.waitUntil(aquecer(TELAS_CELULAR));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => !CACHES_ATUAIS.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (evento) => {
  const dados = evento.data;
  const doSite = (u) => typeof u === "string" && new URL(u, self.location.origin).origin === self.location.origin;
  // a tela manda a lista do que carregou (inclui os pedaços que o HTML não cita)
  if (dados?.tipo === "guardar" && Array.isArray(dados.urls)) {
    const urls = dados.urls.filter((u) => doSite(u) && new URL(u).pathname.startsWith("/_next/static/"));
    evento.waitUntil(guardarArquivos(urls));
  }
  // tela de login aberta (saiu da conta): as telas guardadas eram da pessoa anterior
  if (dados?.tipo === "sair") evento.waitUntil(caches.delete(TELAS));
  if (dados?.tipo === "aquecer" && Array.isArray(dados.urls)) {
    const caminhos = dados.urls.filter((u) => doSite(u) && u.startsWith("/") && !FORA_DO_CACHE.test(u)).slice(0, 80);
    evento.waitUntil(aquecer(caminhos));
  }
});

// sinal fraco no viveiro: se a rede não responde em alguns segundos, abre do cache
function comPrazo(promessa, ms) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error("prazo")), ms);
    promessa.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); falha(e); });
  });
}

function escapar(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// Tela nunca aberta neste aparelho e sem internet: mostra as que estão guardadas
async function telaSemInternet() {
  const cache = await caches.open(TELAS);
  const guardadas = [...new Set((await cache.keys()).map((r) => new URL(r.url).pathname))].sort();
  const links = guardadas.map((p) => `<li><a href="${escapar(p)}">${escapar(p)}</a></li>`).join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem internet · Balbina</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f8f2;color:#15281b;margin:0;padding:24px;line-height:1.5}main{max-width:480px;margin:0 auto}h1{font-size:1.25rem}a{color:#2e7d32;font-weight:600}li{margin:6px 0}@media (prefers-color-scheme:dark){body{background:#0f1a14;color:#e4efe6}a{color:#7cc37f}}</style></head>
<body><main><h1>Sem internet</h1><p>Esta tela ainda não foi aberta neste aparelho com internet, então não está guardada.</p>
${links ? `<p>Telas guardadas que abrem sem internet:</p><ul>${links}</ul>` : "<p>Abra o Balbina uma vez com internet para guardar as telas.</p>"}
<p><a href="">Tentar de novo</a></p></main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

async function doCache(req, url) {
  const cache = await caches.open(TELAS);
  return (await cache.match(req)) || (await cache.match(url.pathname)) || (await cache.match(url.pathname, { ignoreSearch: true }));
}

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.has("_ping")) return; // o detector de internet pergunta direto ao servidor

  // arquivos com hash no nome: cache primeiro
  if (url.pathname.startsWith("/_next/static/") || /^\/(icone[\w-]*\.(svg|png)|apple-touch-icon\.png|manifest\.webmanifest)$/.test(url.pathname)) {
    evento.respondWith(
      caches.match(req, { ignoreSearch: url.pathname === "/manifest.webmanifest" }).then((r) => r || fetch(req).then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(ESTATICO).then((c) => c.put(req, copia));
        }
        return resp;
      })),
    );
    return;
  }

  if (req.mode !== "navigate") return; // pedidos internos do Next (RSC) passam direto; sem rede, o Next recarrega a página e cai aqui

  // saiu da conta (ou a sessão caiu): as telas guardadas eram da pessoa anterior
  if (url.pathname === "/login") {
    evento.waitUntil(caches.delete(TELAS));
    return;
  }
  if (FORA_DO_CACHE.test(url.pathname)) return;

  // toda tela: rede primeiro, cache se estiver sem sinal ou a rede demorar
  const prazo = TELAS_CELULAR.includes(url.pathname) ? 6000 : 8000;
  const rede = fetch(req);
  rede.catch(() => undefined); // a falha da rede é tratada abaixo; evita aviso de promessa sem tratamento
  evento.respondWith(
    comPrazo(rede, prazo).then((resp) => {
      evento.waitUntil(guardarTela(url.pathname + url.search, resp.clone()));
      return resp;
    }).catch(async () => (await doCache(req, url)) || rede.catch(() => telaSemInternet())),
  );
});

// ---------------------------------------------------------------------------------------------------------------
// Background Sync: envia as filas guardadas no IndexedDB (src/lib/db/indexeddb.ts) com o app fechado
// ---------------------------------------------------------------------------------------------------------------
const TAG_SYNC = "balbina-envios";
const BANCO = "balbina";
const LOJA = "dados";
const MAX_TENTATIVAS = 8; // src/lib/sync/queue.ts
const ROTAS = { apontamento: "/api/apontamentos", biometria: "/api/biometrias", insumo: "/api/lancar-insumos", abrir_lote: "/api/abrir-lote" };

function abrirBanco() {
  return new Promise((ok) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(LOJA)) r.result.createObjectStore(LOJA);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ok(null);
    r.onblocked = () => ok(null);
  });
}

function pedido(r) {
  return new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

function lerLista(db, chave) {
  return pedido(db.transaction(LOJA).objectStore(LOJA).get(chave)).then((v) => {
    try {
      const lista = JSON.parse(v ?? "[]");
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  });
}

// relê a fila na hora de gravar (a pessoa pode ter aberto o app e lançado algo no meio)
async function aplicar(db, chaveFila, chaveEnviados, enviados, mudancas, limite) {
  const fila = await lerLista(db, chaveFila);
  const historico = await lerLista(db, chaveEnviados);
  const ids = new Set(enviados.map((e) => e.client_id));
  const novaFila = fila.filter((i) => !ids.has(i.client_id)).map((i) => (mudancas.has(i.client_id) ? { ...i, ...mudancas.get(i.client_id) } : i));
  const novoHistorico = [...enviados, ...historico.filter((h) => !ids.has(h.client_id))].slice(0, limite);
  const tx = db.transaction(LOJA, "readwrite");
  tx.objectStore(LOJA).put(JSON.stringify(novaFila), chaveFila);
  if (enviados.length) tx.objectStore(LOJA).put(JSON.stringify(novoHistorico), chaveEnviados);
  await new Promise((ok, falha) => {
    tx.oncomplete = ok;
    tx.onerror = () => falha(tx.error);
  });
}

function falhaTemporaria(item, erro) {
  const tentativas = (item.tentativas ?? 0) + 1;
  if (tentativas >= MAX_TENTATIVAS) return { tentativas, erro: `${erro} Parou depois de ${MAX_TENTATIVAS} tentativas: toque em Reenviar.`, parado: true, proxima_em: undefined };
  const espera = Math.min(5000 * 2 ** (tentativas - 1), 5 * 60_000);
  return { tentativas, erro, parado: false, proxima_em: new Date(Date.now() + espera).toISOString() };
}

const pronto = (i) => !i.parado && !i.conflito && (!i.proxima_em || Date.parse(i.proxima_em) <= Date.now());
const recusado = (status) => status >= 400 && status < 500 && status !== 408 && status !== 429;

// Envia uma fila. Devolve false se a rede caiu (o navegador tenta o sync de novo mais tarde).
async function enviarFila(db, chaveFila, chaveEnviados, limite, montar) {
  const itens = (await lerLista(db, chaveFila)).filter(pronto);
  if (!itens.length) return true;
  const enviados = [];
  const mudancas = new Map();
  let rede = true;
  for (const item of itens) {
    const { rota, corpo, enviado } = montar(item);
    let resp;
    try {
      resp = await fetch(rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), redirect: "manual", credentials: "same-origin" });
    } catch {
      rede = false;
      break;
    }
    if (resp.type === "opaqueredirect" || resp.status === 401) break; // sessão caiu: espera a pessoa entrar
    const dados = await resp.json().catch(() => ({}));
    if (resp.ok) {
      enviados.push(enviado(dados));
      continue;
    }
    const erro = dados.erro ?? `O servidor respondeu ${resp.status}.`;
    if (resp.status === 409 && Array.isArray(dados.conflito)) mudancas.set(item.client_id, { erro, conflito: dados.conflito, parado: true, tentativas: (item.tentativas ?? 0) + 1 });
    else if (recusado(resp.status)) mudancas.set(item.client_id, { erro, parado: true, tentativas: (item.tentativas ?? 0) + 1 });
    else mudancas.set(item.client_id, falhaTemporaria(item, erro));
  }
  if (enviados.length || mudancas.size) await aplicar(db, chaveFila, chaveEnviados, enviados, mudancas, limite);
  return rede;
}

function filaCampo(db, chave) {
  const empresa = chave.slice("balbina:campo:envios:".length);
  return enviarFila(db, chave, `balbina:campo:enviados:${empresa}`, 30, (item) => ({
    rota: item.tipo === "fechar_lote" ? `/api/lotes/${encodeURIComponent(item.lote_id ?? "")}/fechar` : ROTAS[item.tipo],
    corpo: item.corpo,
    enviado: (dados) => ({
      client_id: item.client_id, tipo: item.tipo, rotulo: item.rotulo, enviado_em: new Date().toISOString(),
      repetido: dados.situacao === "repetido" || undefined,
      viveiro_id: item.corpo?.viveiro_id, data: item.corpo?.data, turno: item.corpo?.turno,
    }),
  }));
}

function filaVendedor(db, chave) {
  const empresa = chave.slice("balbina:vendedor:fila:".length);
  return enviarFila(db, chave, `balbina:vendedor:enviados:${empresa}`, 20, (p) => ({
    rota: "/api/pedidos",
    corpo: {
      client_id: p.client_id, cliente_id: p.cliente_id, data: p.data, condicao: p.condicao, forma_pagamento: p.forma_pagamento,
      entrega: p.entrega, observacoes: p.observacoes, faturar: p.faturar, itens: p.itens,
    },
    enviado: (dados) => ({
      ...p, erro: undefined, tentativas: undefined, proxima_em: undefined, enviado_em: new Date().toISOString(),
      numero: dados.numero ?? null, total_cents: dados.total_cents ?? p.total_estimado, aviso: dados.aviso,
    }),
  }));
}

async function enviarFilasGuardadas() {
  const db = await abrirBanco();
  if (!db) return;
  try {
    const chaves = (await pedido(db.transaction(LOJA).objectStore(LOJA).getAllKeys())).filter((k) => typeof k === "string");
    const resultados = [];
    for (const k of chaves) {
      if (k.startsWith("balbina:campo:envios:")) resultados.push(await filaCampo(db, k));
      else if (k.startsWith("balbina:vendedor:fila:")) resultados.push(await filaVendedor(db, k));
    }
    // rede caiu no meio: rejeitar faz o navegador tentar de novo mais tarde
    if (resultados.includes(false)) throw new Error("sem rede");
  } finally {
    db.close();
  }
}

self.addEventListener("sync", (evento) => {
  if (evento.tag !== TAG_SYNC) return;
  evento.waitUntil(self.clients.matchAll({ type: "window" }).then((janelas) => {
    // com tela aberta, ela sincroniza (mantém a fila da tela e a do banco iguais)
    if (janelas.length) {
      for (const j of janelas) j.postMessage({ tipo: "sincronizar" });
      return undefined;
    }
    return enviarFilasGuardadas();
  }));
});

// Avisos no celular (lembrete de apontamento etc.): mostra a notificação e abre a tela ao tocar.
self.addEventListener("push", (evento) => {
  let aviso = {};
  try {
    aviso = evento.data ? evento.data.json() : {};
  } catch {
    aviso = { texto: evento.data ? evento.data.text() : "" };
  }
  evento.waitUntil(self.registration.showNotification(aviso.titulo || "Balbina", {
    body: aviso.texto || "",
    tag: aviso.tag,
    icon: "/icone-192.png",
    badge: "/icone-192.png",
    data: { link: typeof aviso.link === "string" && aviso.link.startsWith("/") ? aviso.link : "/campo" },
  }));
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const link = evento.notification.data?.link || "/campo";
  evento.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
    const aberta = janelas.find((j) => new URL(j.url).pathname === link);
    return aberta ? aberta.focus() : self.clients.openWindow(link);
  }));
});
