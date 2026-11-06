"use client";

import { useId, useState, type FormEvent } from "react";
import type { ItemFila } from "@/lib/campo/fila";
import { diferencaPct, pesoMedioAmostra } from "@/lib/campo/indicadores";
import { rotuloCartao } from "@/lib/campo/propostas";
import type { Tanque } from "@/lib/campo/tipos";
import { validarBiometriaCampo } from "@/lib/campo/validar";
import { novoId, useCampo } from "./contexto";
import { AvisoCampo, BotaoGrande, CampoNumero, Entrada, fmt, lerNumero, Numero, Observacoes, RodapeFolha, Segmentado } from "./pecas";

// Biometria por amostragem: quantos peixes foram pesados e o peso total que a balança mostrou (ou o peso médio).
// A tela já mostra o peso médio e quanto ele difere do estimado, para pegar erro de digitação na hora.
export function FormBiometria({ tanque, aoSalvar }: { tanque: Tanque; aoSalvar: () => void }) {
  const campo = useCampo();
  const idForm = useId();
  const lote = tanque.lote!;
  const [data, setData] = useState(campo.hoje);
  const [modo, setModo] = useState<"total" | "medio">("total");
  const [peixesTexto, setPeixesTexto] = useState("");
  const [totalTexto, setTotalTexto] = useState("");
  const [medioTexto, setMedioTexto] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [conferir, setConferir] = useState(false);

  const peixes = lerNumero(peixesTexto);
  const totalKg = lerNumero(totalTexto);
  const medio = modo === "total" ? pesoMedioAmostra(totalKg, peixes) : lerNumero(medioTexto);
  const diferenca = diferencaPct(medio, lote.peso_g);
  const muitoDiferente = diferenca !== null && Math.abs(diferenca) > 40;
  const amostra = Math.max(1, Math.round(lote.peixes * 0.1));

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const client_id = novoId();
    const corpo = {
      client_id, viveiro_id: tanque.id, lote_id: lote.id, data, peixes,
      peso_total_g: modo === "total" && totalKg !== null ? Math.round(totalKg * 1000 * 10) / 10 : null,
      peso_medio_g: modo === "medio" ? lerNumero(medioTexto) : null,
      observacoes: observacoes.trim(),
    };
    const v = validarBiometriaCampo(corpo, campo.hoje);
    if ("erro" in v) return setErro(v.erro);
    if (muitoDiferente && !conferir) return setConferir(true);
    const item: ItemFila = {
      client_id, tipo: "biometria", criado_em: new Date().toISOString(), corpo,
      rotulo: rotuloCartao({ tipo: "biometria", viveiro_id: tanque.id, peixes: v.ok.peixes, peso_total_g: v.ok.peso_total_g, peso_medio_g: v.ok.peso_medio_g, observacoes: "" }, campo.cartoes),
    };
    if (campo.salvar(item)) aoSalvar();
    else setErro("O celular está sem espaço para guardar. Libere espaço ou lance com sinal.");
  }

  return (
    <form id={idForm} onSubmit={salvar} noValidate className="flex flex-col gap-5 pt-1">
      <p className="px-1 text-sm text-texto-suave">
        Pese uma amostra de cerca de 10% dos peixes{lote.peixes > 0 ? ` (uns ${fmt(amostra, 0)})` : ""}, de pontos diferentes do viveiro.
      </p>
      <CampoNumero rotulo="Peixes pesados" inputMode="numeric" value={peixesTexto} onChange={(e) => { setPeixesTexto(e.target.value); setConferir(false); }} placeholder="0" />
      <Segmentado rotulo="O que a balança mostrou" valor={modo} mudar={(v) => { setModo(v); setConferir(false); }}
        opcoes={[{ valor: "total", nome: "Peso total" }, { valor: "medio", nome: "Peso médio" }]} />
      {modo === "total"
        ? <CampoNumero rotulo="Peso total da amostra" unidade="kg" value={totalTexto} onChange={(e) => { setTotalTexto(e.target.value); setConferir(false); }} placeholder="0,0" />
        : <CampoNumero rotulo="Peso médio por peixe" unidade="g" value={medioTexto} onChange={(e) => { setMedioTexto(e.target.value); setConferir(false); }} placeholder="0" />}

      <div className="grid grid-cols-2 gap-2">
        <Numero titulo="Peso médio medido" valor={medio !== null ? `${fmt(medio, 0)} g` : "—"} tom={muitoDiferente ? "alerta" : undefined}
          detalhe={medio !== null ? `biomassa ≈ ${fmt((medio * lote.peixes) / 1000, 0)} kg` : undefined} />
        <Numero titulo="Estimado hoje" valor={lote.peso_g !== null ? `${fmt(lote.peso_g, 0)} g` : "—"}
          detalhe={diferenca !== null ? `${diferenca >= 0 ? "+" : ""}${fmt(diferenca, 0)}% na pesagem` : "pela curva do lote"} />
      </div>
      {conferir && (
        <AvisoCampo tom="alerta" titulo="Peso muito diferente do estimado">
          Confira o número de peixes e o peso (kg ou g). Se estiver certo, toque em Salvar de novo.
        </AvisoCampo>
      )}

      <Observacoes valor={observacoes} mudar={setObservacoes} ajuda="Opcional: uniformidade, sinais de doença." />
      <Entrada rotulo="Data" type="date" value={data} max={campo.hoje} onChange={(e) => setData(e.target.value)} />
      {erro && <AvisoCampo tom="perigo">{erro}</AvisoCampo>}
      <RodapeFolha>
        <BotaoGrande type="submit" form={idForm}>{conferir ? "Está certo, salvar" : "Salvar biometria"}</BotaoGrande>
      </RodapeFolha>
    </form>
  );
}
