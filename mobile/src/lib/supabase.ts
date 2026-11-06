import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { CONFIG } from "@/config";
import { armazenamentoSessao } from "./cofre";

// Mesmo banco do site, com o login do próprio usuário: o RLS e as funções do banco aplicam as regras
// (permissões por cargo, plano, estoque, faturamento) exatamente como no site.
export const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: { storage: armazenamentoSessao, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Só renova o token com o app aberto (recomendação do Supabase para React Native)
AppState.addEventListener("change", (estado) => {
  if (estado === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
