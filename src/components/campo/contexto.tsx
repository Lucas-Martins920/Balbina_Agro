"use client";

import { createContext, useContext } from "react";
import type { Sugestoes } from "@/lib/sugestao-apontamento";
import type { ContextoCartoes, Turno } from "@/lib/campo/propostas";
import type { ItemFila } from "@/lib/campo/fila";
import type { MedicamentoOpcao, Opcao, PainelCampo, Tanque } from "@/lib/campo/tipos";
import type { EstadoFila } from "./fila-cliente";

export type ItemChecklistCampo = { id: string; nome: string; tipo: string; unidade: string | null; aplica_em: string };

// O que a página /campo traz do servidor (fica no cache do celular para abrir sem sinal)
export type DadosCampo = {
  empresa: { id: string; nome: string; fuso: string };
  hoje: string;
  agua: boolean;          // a empresa pede a qualidade da água no apontamento
  ia: boolean;            // chat com IA ligado no servidor
  chavePush?: string;
  painel: PainelCampo;
  medicamentos: MedicamentoOpcao[];
  racoes: Opcao[];
  checklist: ItemChecklistCampo[];
  sugestoes: Sugestoes;   // ração normal de cada viveiro e turno pelo histórico do lote
};

export type Aba = "chat" | "viveiros" | "racao" | "biometria" | "envios";
export type AcaoFolha = { tipo: "tanque" | "racao" | "biometria" | "insumo" | "abrir" | "fechar"; tanque: string };

export type Campo = {
  dados: DadosCampo;
  hoje: string;
  turno: Turno;
  online: boolean;
  kgSaco: number;
  mudarKgSaco: (kg: number) => void;
  fila: EstadoFila;
  cartoes: ContextoCartoes;
  tanque: (id: string | null | undefined) => Tanque | undefined;
  pendentes: (viveiro: string) => ItemFila[];
  salvar: (item: ItemFila) => boolean;
  abrir: (acao: AcaoFolha) => void;
  irPara: (aba: Aba) => void;
  avisar: (texto: string, tom?: "ok" | "erro") => void;
};

const ContextoCampo = createContext<Campo | null>(null);
export const ProvedorCampo = ContextoCampo.Provider;

export function useCampo(): Campo {
  const c = useContext(ContextoCampo);
  if (!c) throw new Error("useCampo fora do app de campo");
  return c;
}

// Identificador do envio, gerado no celular (o servidor usa para não duplicar no reenvio)
export const novoId = () => crypto.randomUUID();
