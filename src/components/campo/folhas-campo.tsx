"use client";

import type { ReactNode } from "react";
import { Fish } from "lucide-react";
import { useCampo, type AcaoFolha } from "./contexto";
import { DetalheTanque } from "./detalhe-tanque";
import { Folha } from "./folha";
import { FormBiometria } from "./form-biometria";
import { FormInsumo } from "./form-insumo";
import { FormAbrirLote, FormFecharLote } from "./form-lote";
import { FormRacao } from "./form-racao";
import { AvisoCampo, BotaoGrande } from "./pecas";

const TITULOS: Record<AcaoFolha["tipo"], string> = {
  tanque: "Viveiro", racao: "Ração e mortes", biometria: "Biometria", insumo: "Insumo no viveiro", abrir: "Abrir lote", fechar: "Despesca e fechamento",
};

// Uma gaveta só para o app inteiro: a ficha do viveiro e cada formulário trocam de conteúdo dentro dela
// (a ficha leva ao formulário sem fechar e abrir de novo). A versão na key começa o formulário do zero.
export function FolhasCampo({ acao, aberta, fechar }: { acao: (AcaoFolha & { versao: number }) | null; aberta: boolean; fechar: () => void }) {
  const campo = useCampo();
  const tanque = acao?.tanque ? campo.tanque(acao.tanque) : undefined;
  let titulo = acao ? TITULOS[acao.tipo] : "";
  let descricao: ReactNode = tanque ? `${tanque.rotulo}${tanque.lote ? ` · lote ${tanque.lote.codigo}` : ""}` : undefined;
  let corpo: ReactNode = null;

  if (acao && acao.tipo !== "insumo" && !tanque) {
    corpo = <AvisoCampo tom="alerta" titulo="Viveiro não encontrado" className="mt-1">Ele pode ter sido desativado. Abra o app com sinal para atualizar a lista.</AvisoCampo>;
  } else if (acao && tanque && !tanque.lote && (acao.tipo === "biometria" || acao.tipo === "fechar"
    // ração com o lote ainda na fila vale: o lote chega ao servidor antes dela
    || (acao.tipo === "racao" && !campo.pendentes(tanque.id).some((i) => i.tipo === "abrir_lote")))) {
    const para = { biometria: "para pesar", fechar: "para fechar", racao: "para receber ração" }[acao.tipo as "biometria" | "fechar" | "racao"];
    corpo = (
      <div className="flex flex-col gap-4 pt-1">
        <AvisoCampo titulo="Viveiro vazio">Não há lote neste viveiro {para}.</AvisoCampo>
        <BotaoGrande onClick={() => campo.abrir({ tipo: "abrir", tanque: tanque.id })}><Fish size={20} /> Abrir lote</BotaoGrande>
      </div>
    );
  } else if (acao) {
    switch (acao.tipo) {
      case "tanque":
        titulo = tanque!.nome;
        descricao = tanque!.setor || undefined;
        corpo = <DetalheTanque tanque={tanque!} />;
        break;
      case "racao":
        corpo = <FormRacao tanque={tanque!} aoSalvar={fechar} />;
        break;
      case "biometria":
        corpo = <FormBiometria tanque={tanque!} aoSalvar={fechar} />;
        break;
      case "insumo":
        descricao = tanque ? descricao : "Corretivo, adubo, medicamento ou outro";
        corpo = <FormInsumo tanqueId={tanque?.id ?? ""} aoSalvar={fechar} />;
        break;
      case "abrir":
        corpo = <FormAbrirLote tanque={tanque!} aoSalvar={fechar} />;
        break;
      case "fechar":
        corpo = <FormFecharLote tanque={tanque!} aoSalvar={fechar} />;
        break;
    }
  }

  return (
    <Folha aberta={aberta && acao !== null} aoFechar={fechar} titulo={titulo} descricao={descricao}>
      {acao && <div key={`${acao.tipo}-${acao.tanque}-${acao.versao}`} className="campo-entra">{corpo}</div>}
    </Folha>
  );
}
