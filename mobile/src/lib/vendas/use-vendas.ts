import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { chamarSite, ErroApi } from "@/lib/api";
import { corpoPedido } from "./carrinho";
import type { DadosVendas, PedidoEnviado, PedidoPendente } from "./tipos";

// Catálogo guardado no aparelho para vender sem sinal, fila de pedidos e os últimos enviados (como /vendedor).
const chave = (tipo: string, empresa: string) => `balbina:vendas:${tipo}:${empresa}`;

async function lerJson<T>(k: string, padrao: T): Promise<T> {
  try {
    const v = await AsyncStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : padrao;
  } catch {
    return padrao;
  }
}

let trava: Promise<unknown> = Promise.resolve();
function mudar<T>(k: string, fn: (atual: T[]) => T[]): Promise<T[]> {
  const proxima = trava.then(async () => {
    const nova = fn(await lerJson<T[]>(k, []));
    await AsyncStorage.setItem(k, JSON.stringify(nova));
    return nova;
  });
  trava = proxima.catch(() => undefined);
  return proxima;
}

export function useVendas(empresa: string) {
  const [dados, setDados] = useState<DadosVendas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroDados, setErroDados] = useState<string | null>(null);
  const [fila, setFila] = useState<PedidoPendente[]>([]);
  const [enviados, setEnviados] = useState<PedidoEnviado[]>([]);
  const [online, setOnline] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const ocupado = useRef(false);
  const kFila = chave("fila", empresa);
  const kEnviados = chave("enviados", empresa);
  const kDados = chave("dados", empresa);

  const atualizarDados = useCallback(async () => {
    setErroDados(null);
    try {
      const novo = { ...(await chamarSite<DadosVendas>("/api/app/vendas", { empresa_id: empresa })), baixadoEm: new Date().toISOString() };
      await AsyncStorage.setItem(kDados, JSON.stringify(novo));
      setDados(novo);
    } catch (e) {
      if (!(e instanceof ErroApi && e.status === 0)) setErroDados(e instanceof Error ? e.message : "Não foi possível atualizar o catálogo.");
    } finally {
      setCarregando(false);
    }
  }, [empresa, kDados]);

  const sincronizar = useCallback(async () => {
    if (ocupado.current) return;
    const pendentes = (await lerJson<PedidoPendente[]>(kFila, [])).filter((p) => !p.erro);
    if (!pendentes.length) return;
    ocupado.current = true;
    setEnviando(true);
    const ok = new Map<string, { numero: number | null; total_cents: number; aviso?: string }>();
    const erros = new Map<string, string>();
    for (const p of pendentes) {
      try {
        const r = await chamarSite<{ numero: number | null; total_cents: number; aviso?: string }>("/api/app/pedidos", { empresa_id: empresa, pedido: corpoPedido(p) });
        ok.set(p.client_id, r);
      } catch (e) {
        if (!(e instanceof ErroApi) || e.status === 0) break;
        erros.set(p.client_id, e.message);
        if (e.status === 401) break;
      }
    }
    const agora = new Date().toISOString();
    let feitos: PedidoEnviado[] = [];
    setFila(
      await mudar<PedidoPendente>(kFila, (f) => {
        feitos = f.filter((p) => ok.has(p.client_id)).map((p) => ({ ...p, ...ok.get(p.client_id)!, erro: undefined, enviado_em: agora }));
        return f.filter((p) => !ok.has(p.client_id)).map((p) => (erros.has(p.client_id) ? { ...p, erro: erros.get(p.client_id) } : p));
      }),
    );
    if (feitos.length) setEnviados(await mudar<PedidoEnviado>(kEnviados, (e) => [...feitos, ...e].slice(0, 20)));
    if (ok.size || erros.size) {
      setAviso([ok.size ? `${ok.size} pedido(s) enviado(s) ao escritório.` : "", erros.size ? `${erros.size} com erro: confira na fila.` : ""].filter(Boolean).join(" "));
    }
    ocupado.current = false;
    setEnviando(false);
  }, [empresa, kFila, kEnviados]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const [d, f, e] = await Promise.all([lerJson<DadosVendas | null>(kDados, null), lerJson<PedidoPendente[]>(kFila, []), lerJson<PedidoEnviado[]>(kEnviados, [])]);
      if (!ativo) return;
      setDados(d);
      setFila(f);
      setEnviados(e);
      if (d) setCarregando(false);
      await atualizarDados();
      await sincronizar();
    })();
    const rede = NetInfo.addEventListener((s) => {
      const conectado = s.isConnected !== false && s.isInternetReachable !== false;
      setOnline(conectado);
      if (conectado) void sincronizar();
    });
    const frente = AppState.addEventListener("change", (estado) => estado === "active" && void sincronizar());
    const relogio = setInterval(() => void sincronizar(), 60_000);
    return () => {
      ativo = false;
      rede();
      frente.remove();
      clearInterval(relogio);
    };
  }, [kDados, kFila, kEnviados, atualizarDados, sincronizar]);

  const guardar = useCallback(
    async (p: PedidoPendente) => {
      setFila(await mudar<PedidoPendente>(kFila, (f) => [...f, p]));
      setAviso(online ? "Enviando o pedido…" : "Pedido guardado no celular. Envia sozinho quando voltar o sinal.");
      void sincronizar();
    },
    [kFila, online, sincronizar],
  );
  const reenviar = useCallback(
    async (id: string) => {
      setFila(await mudar<PedidoPendente>(kFila, (f) => f.map((p) => (p.client_id === id ? { ...p, erro: undefined } : p))));
      void sincronizar();
    },
    [kFila, sincronizar],
  );
  const descartar = useCallback(async (id: string) => setFila(await mudar<PedidoPendente>(kFila, (f) => f.filter((p) => p.client_id !== id))), [kFila]);

  return { dados, carregando, erroDados, atualizarDados, fila, enviados, online, enviando, aviso, sincronizar, guardar, reenviar, descartar };
}
