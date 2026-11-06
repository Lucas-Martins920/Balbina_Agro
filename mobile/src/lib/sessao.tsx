import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { SEM_ACESSO, temPermissao, type Acesso } from "@regras/permissoes-regras.ts";
import { chamarSite, ErroApi } from "./api";
import { apagarCofre, gravarCofre, lerCofre } from "./cofre";
import { supabase } from "./supabase";

export type Empresa = { id: string; razao_social: string; nome_fantasia: string | null; fuso: string; apontar_qualidade_agua: boolean };
export const nomeEmpresa = (e: Empresa) => e.nome_fantasia || e.razao_social;

type Estado =
  | { fase: "carregando" }
  | { fase: "fora" }
  | { fase: "mfa"; email: string | null }
  | { fase: "bloqueado" }
  | { fase: "sem-empresa" }
  | { fase: "pronto"; empresa: Empresa; empresas: Empresa[]; acesso: Acesso };

type Sessao = {
  estado: Estado;
  pode: (chave: string) => boolean;
  entrar: (identificacao: string, senha: string, captcha?: string) => Promise<void>;
  confirmarMfa: (dispositivo?: string) => Promise<void>;
  desbloquear: () => Promise<boolean>;
  trocarEmpresa: (id: string) => Promise<void>;
  sair: () => Promise<void>;
  biometria: { disponivel: boolean; ligada: boolean; alternar: (ligar: boolean) => Promise<void> };
};

const Contexto = createContext<Sessao | null>(null);

const CHAVE_EMPRESA = "empresa";
const CHAVE_BIOMETRIA = "biometria";
const chaveDispositivo = (usuario: string) => `dispositivo_${usuario}`;

async function usuarioAtual() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

// Aparelho confiado antes (14 dias) libera o 2º fator sem código, como o "confiar neste navegador" do site.
async function tentarDispositivo(usuario: string) {
  const token = await lerCofre(chaveDispositivo(usuario));
  if (!token) return false;
  try {
    const r = await chamarSite<{ ok: boolean }>("/api/app/mfa", { acao: "dispositivo", token });
    if (!r.ok) await apagarCofre(chaveDispositivo(usuario));
    return r.ok;
  } catch {
    return false;
  }
}

async function mfaPendente() {
  const { data } = await supabase.rpc("mfa_pendente");
  return data === true;
}

async function carregarEmpresas(): Promise<Empresa[]> {
  const { data, error } = await supabase.from("empresas").select("id, razao_social, nome_fantasia, fuso, apontar_qualidade_agua").order("razao_social");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [bio, setBio] = useState({ disponivel: false, ligada: false });

  // Monta o estado a partir da sessão guardada: 2º fator → empresa → permissões.
  const carregar = useCallback(async () => {
    const usuario = await usuarioAtual();
    if (!usuario) return setEstado({ fase: "fora" });
    if (await mfaPendente()) {
      const liberado = (await tentarDispositivo(usuario.id)) && !(await mfaPendente());
      if (!liberado) return setEstado({ fase: "mfa", email: usuario.email ?? null });
    }
    const empresas = await carregarEmpresas();
    if (empresas.length === 0) return setEstado({ fase: "sem-empresa" });
    const escolhida = await lerCofre(CHAVE_EMPRESA);
    const empresa = empresas.find((e) => e.id === escolhida) ?? empresas[0];
    const { data } = await supabase.rpc("minhas_permissoes", { p_empresa: empresa.id });
    setEstado({ fase: "pronto", empresa, empresas, acesso: data ? (data as Acesso) : SEM_ACESSO });
  }, []);

  useEffect(() => {
    (async () => {
      const disponivel = Platform.OS !== "web" && (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      const ligada = disponivel && (await lerCofre(CHAVE_BIOMETRIA)) === "1";
      setBio({ disponivel, ligada });
      // Ao abrir o app com sessão guardada e Face ID ligado, pede o rosto ou a digital antes de mostrar dados.
      if (ligada && (await usuarioAtual())) return setEstado({ fase: "bloqueado" });
      await carregar().catch(() => setEstado({ fase: "fora" }));
    })();
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") setEstado({ fase: "fora" });
    });
    return () => data.subscription.unsubscribe();
  }, [carregar]);

  const entrar = useCallback(
    async (identificacao: string, senha: string, captcha?: string) => {
      const r = await chamarSite<{ sessao: { access_token: string; refresh_token: string } }>("/api/app/login", { identificacao, senha, captcha }, { semSessao: true });
      const { error } = await supabase.auth.setSession(r.sessao);
      if (error) throw new ErroApi("Não foi possível abrir a sessão. Tente de novo.", 500);
      await carregar();
    },
    [carregar],
  );

  const confirmarMfa = useCallback(
    async (dispositivo?: string) => {
      const usuario = await usuarioAtual();
      if (usuario && dispositivo) await gravarCofre(chaveDispositivo(usuario.id), dispositivo);
      await carregar();
    },
    [carregar],
  );

  const desbloquear = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Abrir o Balbina", cancelLabel: "Usar senha" });
    if (!r.success) return false;
    setEstado({ fase: "carregando" });
    await carregar().catch(() => setEstado({ fase: "fora" }));
    return true;
  }, [carregar]);

  const trocarEmpresa = useCallback(
    async (id: string) => {
      await gravarCofre(CHAVE_EMPRESA, id);
      await carregar();
    },
    [carregar],
  );

  const sair = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" });
    setEstado({ fase: "fora" });
  }, []);

  const alternarBiometria = useCallback(async (ligar: boolean) => {
    if (ligar) {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirmar Face ID ou digital" });
      if (!r.success) return;
      await gravarCofre(CHAVE_BIOMETRIA, "1");
    } else await apagarCofre(CHAVE_BIOMETRIA);
    setBio((b) => ({ ...b, ligada: ligar }));
  }, []);

  const valor = useMemo<Sessao>(
    () => ({
      estado,
      pode: (chave) => estado.fase === "pronto" && temPermissao(estado.acesso, chave),
      entrar,
      confirmarMfa,
      desbloquear,
      trocarEmpresa,
      sair,
      biometria: { ...bio, alternar: alternarBiometria },
    }),
    [estado, entrar, confirmarMfa, desbloquear, trocarEmpresa, sair, bio, alternarBiometria],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao() {
  const s = useContext(Contexto);
  if (!s) throw new Error("useSessao fora do ProvedorSessao");
  return s;
}
