import { useCallback, useEffect, useRef, useState } from "react";
import { chamarSite } from "../api";
import type { DadosEstoque } from "./tipos";

export function useEstoque(empresaId: string | undefined) {
  const [dados, setDados] = useState<DadosEstoque | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const montado = useRef(true);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    setErro("");
    try {
      const r = await chamarSite<DadosEstoque>("/api/app/estoque", { empresa_id: empresaId });
      if (montado.current) setDados(r);
    } catch (e) {
      if (montado.current) setErro(e instanceof Error ? e.message : "Erro ao carregar estoque.");
    } finally {
      if (montado.current) setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => {
    montado.current = true;
    void Promise.resolve().then(carregar);
    return () => { montado.current = false; };
  }, [carregar]);

  const movimentar = useCallback(async (corpo: {
    empresa_id: string;
    produto_id: string;
    operacao: string;
    quantidade: number;
    deposito_id?: string | null;
    data?: string;
    custo_total_cents?: number | null;
    motivo?: string | null;
    observacao?: string | null;
  }) => {
    const r = await chamarSite<{ ok: boolean; diferenca: number }>("/api/app/estoque/movimentar", corpo);
    await carregar();
    return r;
  }, [carregar]);

  return { dados, carregando, erro, recarregar: carregar, movimentar };
}
