"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

// Cliente do navegador (sessão nos mesmos cookies do servidor). Criado só dentro de efeitos e
// eventos: no build as páginas são pré-renderizadas sem as variáveis do Supabase.
export function clienteNavegador() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
