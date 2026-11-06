"use client";

import { useActionState } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import { criarEmpresa, type EstadoOnboarding } from "./actions";

export function FormEmpresa() {
  const [estado, acao, pendente] = useActionState<EstadoOnboarding, FormData>(criarEmpresa, {});
  return (
    <form action={acao} className="flex flex-col gap-4">
      <Campo rotulo="CNPJ ou CPF do produtor rural" id="cnpj" name="cnpj" inputMode="numeric" placeholder="Só números" required />
      <Campo rotulo="Inscrição estadual (obrigatória para produtor rural)" id="inscricao_estadual" name="inscricao_estadual" />
      <Campo rotulo="Razão social ou nome do produtor" id="razao_social" name="razao_social" required />
      <Campo rotulo="Nome fantasia (opcional)" id="nome_fantasia" name="nome_fantasia" />
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <Botao type="submit" disabled={pendente}>{pendente ? "Criando…" : "Criar empresa"}</Botao>
    </form>
  );
}
