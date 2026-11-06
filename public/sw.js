// Service worker dos apps de celular: guarda as telas /campo (apontamento) e /vendedor e os arquivos estáticos
// para abrir sem internet.
const CACHE = "balbina-campo-v3";
const TELAS = ["/campo", "/vendedor"];
const ESTATICO = /\/_next\/static\/[^"'\s\\)]+/g;

// Guarda os arquivos que a tela usa. Sem eles a página abre do cache mas os botões não funcionam.
async function guardarArquivos(urls) {
  const cache = await caches.open(CACHE);
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

async function guardarTela(tela, resp) {
  const cache = await caches.open(CACHE);
  await cache.put(tela, resp.clone());
  const html = await resp.text();
  await guardarArquivos(html.match(ESTATICO) ?? []);
}

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    Promise.all(TELAS.map((tela) => fetch(tela, { credentials: "include" })
      .then((resp) => (resp.ok && !resp.redirected ? guardarTela(tela, resp) : undefined))
      .catch(() => undefined))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// a tela manda a lista do que carregou (inclui os pedaços que o HTML não cita)
self.addEventListener("message", (evento) => {
  const dados = evento.data;
  if (dados?.tipo !== "guardar" || !Array.isArray(dados.urls)) return;
  const urls = dados.urls.filter((u) => typeof u === "string" && new URL(u).origin === self.location.origin && new URL(u).pathname.startsWith("/_next/static/"));
  evento.waitUntil(guardarArquivos(urls));
});

// sinal fraco no viveiro: se a rede não responde em alguns segundos, abre do cache
function comPrazo(promessa, ms) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error("prazo")), ms);
    promessa.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); falha(e); });
  });
}

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // arquivos com hash no nome: cache primeiro
  if (url.pathname.startsWith("/_next/static/") || /^\/(icone[\w-]*\.(svg|png)|apple-touch-icon\.png|manifest\.webmanifest)$/.test(url.pathname)) {
    evento.respondWith(
      caches.match(req, { ignoreSearch: url.pathname === "/manifest.webmanifest" }).then((r) => r || fetch(req).then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return resp;
      })),
    );
    return;
  }

  // as telas de celular (só a navegação; os pedidos internos do Next para elas passam direto):
  // rede primeiro, cache se estiver sem sinal ou a rede demorar
  if (TELAS.includes(url.pathname) && req.mode === "navigate") {
    const tela = url.pathname;
    const rede = fetch(req);
    rede.catch(() => undefined); // a falha da rede é tratada abaixo; evita aviso de promessa sem tratamento
    evento.respondWith(
      comPrazo(rede, 6000).then((resp) => {
        if (resp.ok && !resp.redirected) evento.waitUntil(guardarTela(tela, resp.clone()));
        return resp;
      }).catch(() => caches.match(tela).then((r) => r || rede)),
    );
  }
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
