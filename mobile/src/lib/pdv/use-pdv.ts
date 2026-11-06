import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useState } from "react";
import type { VendaBalcao } from "@regras/pdv.ts";
import { chamarSite, ErroApi } from "@/lib/api";
import type { DadosPdv, VendaFeita } from "./tipos";

// PDV de balcão: precisa de internet, porque a venda baixa o estoque e recebe na hora (como no site).
// Ponto de venda e conta do Pix/cartão ficam lembrados no aparelho, como o navegador lembra no site.
const chave = (tipo: string, empresa: string) => `balbina:pdv:${tipo}:${empresa}`;

export function usePdv(empresa: string) {
  const [dados, setDados] = useState<DadosPdv | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [conta, setContaEstado] = useState("");

  const carregar = useCallback(
    async (ponto: string | null) => {
      setCarregando(true);
      setErro(null);
      try {
        const d = await chamarSite<DadosPdv>("/api/app/pdv", { empresa_id: empresa, ponto_venda_id: ponto });
        if (d.ponto) await AsyncStorage.setItem(chave("ponto", empresa), d.ponto.id).catch(() => undefined);
        const salva = await AsyncStorage.getItem(chave("conta", empresa)).catch(() => null);
        const bancos = d.contas.filter((c) => c.tipo !== "caixinha");
        setContaEstado(salva && d.contas.some((c) => c.id === salva) ? salva : (bancos[0]?.id ?? ""));
        setDados(d);
      } catch (e) {
        setErro(e instanceof ErroApi && e.status === 0 ? "Sem internet. O caixa precisa de sinal para baixar o estoque na hora; sem sinal, use Pedido." : e instanceof Error ? e.message : "Não foi possível abrir o caixa.");
      } finally {
        setCarregando(false);
      }
    },
    [empresa],
  );

  // abre no último ponto usado neste aparelho
  const reabrir = useCallback(
    () => AsyncStorage.getItem(chave("ponto", empresa)).catch(() => null).then((ponto) => carregar(ponto)),
    [empresa, carregar],
  );

  useEffect(() => {
    void reabrir();
    return NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false));
  }, [reabrir]);

  const setConta = useCallback(
    (id: string) => {
      setContaEstado(id);
      void AsyncStorage.setItem(chave("conta", empresa), id).catch(() => undefined);
    },
    [empresa],
  );

  // Reenviar com o mesmo client_id não duplica: o banco devolve a mesma venda
  const vender = useCallback(
    async (venda: VendaBalcao): Promise<{ ok: VendaFeita } | { erro: string }> => {
      try {
        return { ok: await chamarSite<VendaFeita>("/api/app/pdv/vender", { empresa_id: empresa, venda }) };
      } catch (e) {
        if (e instanceof ErroApi && e.status === 0) return { erro: "Sem sinal: a venda não foi confirmada. Toque em Finalizar de novo quando voltar; ela não é lançada duas vezes." };
        return { erro: e instanceof Error ? e.message : "Não foi possível finalizar a venda." };
      }
    },
    [empresa],
  );

  return { dados, carregando, erro, online, carregar, reabrir, conta, setConta, vender };
}
