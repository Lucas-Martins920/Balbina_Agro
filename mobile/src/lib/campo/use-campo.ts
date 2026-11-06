import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { chamarSite, ErroApi } from "@/lib/api";
import { gravarDadosCampo, lerDadosCampo, lerFila, mudarFila } from "./armazenamento";
import { aplicarResultados, corpoEnvio, descartar as tirar, paraEnviar, reenviar as voltar, type Resultado } from "./fila";
import type { DadosCampo, Existente, Pendente } from "./tipos";

// Estado do apontamento no app: dados do campo (guardados para usar sem sinal), fila e envio.
// Envia ao abrir, quando o sinal volta, quando o app volta para a frente e a cada minuto com fila.
export function useCampo(empresa: string) {
  const [dados, setDados] = useState<DadosCampo | null>(null);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [erroDados, setErroDados] = useState<string | null>(null);
  const [fila, setFila] = useState<Pendente[]>([]);
  const [online, setOnline] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sessaoExpirada, setSessaoExpirada] = useState(false);
  const ocupado = useRef(false);

  const atualizarDados = useCallback(async () => {
    setErroDados(null);
    try {
      const novo = await chamarSite<DadosCampo>("/api/app/campo", { empresa_id: empresa });
      const comData = { ...novo, baixadoEm: new Date().toISOString() };
      await gravarDadosCampo(empresa, comData);
      setDados(comData);
    } catch (e) {
      // sem sinal fica com o que já estava guardado
      if (!(e instanceof ErroApi && e.status === 0)) setErroDados(e instanceof Error ? e.message : "Não foi possível atualizar os viveiros.");
    } finally {
      setCarregandoDados(false);
    }
  }, [empresa]);

  const sincronizar = useCallback(async () => {
    if (ocupado.current) return;
    const pendentes = paraEnviar(await lerFila(empresa));
    if (!pendentes.length) return;
    ocupado.current = true;
    setEnviando(true);
    const resultados: Resultado[] = [];
    let expirou = false;
    for (const p of pendentes) {
      try {
        await chamarSite("/api/app/apontamentos", { empresa_id: empresa, apontamento: corpoEnvio(p) });
        resultados.push({ client_id: p.client_id, tipo: "enviado" });
      } catch (e) {
        if (!(e instanceof ErroApi) || e.status === 0) break; // caiu o sinal: o resto fica para a próxima
        if (e.status === 401) {
          expirou = true;
          break;
        }
        const conflito = e.dados.conflito as Existente[] | undefined;
        resultados.push(e.status === 409 && conflito ? { client_id: p.client_id, tipo: "conflito", erro: e.message, conflito } : { client_id: p.client_id, tipo: "erro", erro: e.message });
      }
    }
    setFila(await mudarFila(empresa, (f) => aplicarResultados(f, resultados)));
    const enviados = resultados.filter((r) => r.tipo === "enviado").length;
    if (enviados) setAviso(`${enviados} apontamento(s) enviado(s).`);
    setSessaoExpirada(expirou);
    ocupado.current = false;
    setEnviando(false);
  }, [empresa]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const [guardados, filaGuardada] = await Promise.all([lerDadosCampo(empresa), lerFila(empresa)]);
      if (!ativo) return;
      setDados(guardados);
      setFila(filaGuardada);
      if (guardados) setCarregandoDados(false);
      await atualizarDados();
      await sincronizar();
    })();
    const semRede = NetInfo.addEventListener((s) => {
      const conectado = s.isConnected !== false && s.isInternetReachable !== false;
      setOnline(conectado);
      if (conectado) void sincronizar();
    });
    const frente = AppState.addEventListener("change", (estado) => {
      if (estado === "active") void sincronizar();
    });
    const relogio = setInterval(() => void sincronizar(), 60_000);
    return () => {
      ativo = false;
      semRede();
      frente.remove();
      clearInterval(relogio);
    };
  }, [empresa, atualizarDados, sincronizar]);

  const guardar = useCallback(
    async (p: Pendente) => {
      setFila(await mudarFila(empresa, (f) => [...f, p]));
      setAviso(online ? "Enviando…" : "Salvo no celular. Envia sozinho quando voltar o sinal.");
      void sincronizar();
    },
    [empresa, online, sincronizar],
  );

  const reenviar = useCallback(
    async (id: string, mudar?: (p: Pendente) => Pendente) => {
      setFila(await mudarFila(empresa, (f) => voltar(f, id, mudar)));
      void sincronizar();
    },
    [empresa, sincronizar],
  );

  const descartar = useCallback(
    async (id: string) => {
      setFila(await mudarFila(empresa, (f) => tirar(f, id)));
    },
    [empresa],
  );

  return { dados, carregandoDados, erroDados, atualizarDados, fila, online, enviando, aviso, setAviso, sessaoExpirada, sincronizar, guardar, reenviar, descartar };
}
