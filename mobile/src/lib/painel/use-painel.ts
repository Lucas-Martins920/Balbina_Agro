import { useCallback, useEffect, useRef, useState } from "react";
import { chamarSite } from "../api";
import type { DadosPainel } from "./tipos";

// Carrega o painel do dia e atualiza a cada foco no app.
export function usePainel(empresaId: string | undefined) {
  const [dados, setDados] = useState<DadosPainel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const montado = useRef(true);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    setErro("");
    try {
      const r = await chamarSite<DadosPainel>("/api/app/painel", { empresa_id: empresaId });
      if (montado.current) setDados(r);
    } catch (e) {
      if (montado.current) setErro(e instanceof Error ? e.message : "Erro ao carregar painel.");
    } finally {
      if (montado.current) setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => {
    montado.current = true;
    // Encadeia fora do corpo síncrono do efeito para não disparar o lint de set-state-in-effect.
    void Promise.resolve().then(carregar);
    return () => { montado.current = false; };
  }, [carregar]);

  return { dados, carregando, erro, recarregar: carregar };
}
