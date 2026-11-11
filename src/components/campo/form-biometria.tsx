"use client";

import { useId, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { totaisGrupos } from "@/lib/biometria-grupos";
import type { ItemFila } from "@/lib/campo/fila";
import { diferencaPct, pesoMedioAmostra } from "@/lib/campo/indicadores";
import { rotuloCartao } from "@/lib/campo/propostas";
import type { Tanque } from "@/lib/campo/tipos";
import { validarBiometriaCampo } from "@/lib/campo/validar";
import { amostraBiometria, PARAMETROS_PADRAO } from "@/lib/previsao-racao";
import { novoId, useCampo } from "./contexto";
import { AvisoCampo, BotaoGrande, BotaoPilula, CampoNumero, Entrada, fmt, lerNumero, Numero, Observacoes, RodapeFolha, Segmentado } from "./pecas";

type GrupoTexto = { chave: string; peixes: string; kg: string; ponto: string };
type Rascunho = { data: string; grupos: GrupoTexto[]; jejum: string; temperatura: string; oxigenio: string; observacoes: string };

const CHAVE_RASCUNHO = (viveiro: string) => `balbina-campo-biometria:${viveiro}`;
const grupoVazio = (): GrupoTexto => ({ chave: novoId(), peixes: "", kg: "", ponto: "" });

function lerRascunho(viveiro: string): Rascunho | null {
  try {
    const r = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO(viveiro)) ?? "null") as Rascunho | null;
    return r && Array.isArray(r.grupos) ? r : null;
  } catch { return null; }
}

// Biometria por amostragem. Em grupos (padrão): cada puçá ou balde pesado vira uma linha com peixes e kg; o peso
// médio é o peso total ÷ os peixes (média ponderada). O rascunho fica guardado no celular (sem sinal também) até
// "Concluir biometria", que põe na fila; o reenvio não duplica (client_id). Também dá para lançar só o total.
export function FormBiometria({ tanque, aoSalvar }: { tanque: Tanque; aoSalvar: () => void }) {
  const campo = useCampo();
  const idForm = useId();
  const lote = tanque.lote!;
  const [modo, setModo] = useState<"grupos" | "total" | "medio">("grupos");
  // rascunho guardado no aparelho: volta ao abrir de novo a biometria deste viveiro (a folha só abre no toque,
  // então o localStorage já existe aqui)
  const [guardado] = useState(() => (typeof window === "undefined" ? null : lerRascunho(tanque.id)));
  const recuperado = !!guardado && guardado.grupos.some((g) => g.peixes || g.kg);
  const [rascunho, setRascunho] = useState<Rascunho>(() => (recuperado ? guardado! : {
    data: campo.hoje, grupos: [grupoVazio()], jejum: "", temperatura: "", oxigenio: "", observacoes: "",
  }));
  const [peixesTexto, setPeixesTexto] = useState("");
  const [totalTexto, setTotalTexto] = useState("");
  const [medioTexto, setMedioTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [conferir, setConferir] = useState(false);

  const mudar = (r: Rascunho) => {
    setRascunho(r);
    setConferir(false);
    try { localStorage.setItem(CHAVE_RASCUNHO(tanque.id), JSON.stringify(r)); } catch { /* sem espaço: segue só na tela */ }
  };
  const mudarGrupo = (chave: string, campoGrupo: keyof GrupoTexto, valor: string) =>
    mudar({ ...rascunho, grupos: rascunho.grupos.map((g) => (g.chave === chave ? { ...g, [campoGrupo]: valor } : g)) });

  const totais = totaisGrupos(rascunho.grupos.map((g) => ({ peixes: lerNumero(g.peixes), peso_kg: lerNumero(g.kg) })));
  const peixes = modo === "grupos" ? totais.peixes : lerNumero(peixesTexto);
  const medio = modo === "grupos" ? totais.pesoMedioG : modo === "total" ? pesoMedioAmostra(lerNumero(totalTexto), peixes) : lerNumero(medioTexto);
  const diferenca = diferencaPct(medio, lote.peso_g);
  const muitoDiferente = diferenca !== null && Math.abs(diferenca) > 40;
  const amostra = amostraBiometria(lote.peixes, campo.dados.painel.amostra ?? PARAMETROS_PADRAO);

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const client_id = novoId();
    const preenchidos = rascunho.grupos.filter((g) => g.peixes.trim() || g.kg.trim());
    const corpo = modo === "grupos"
      ? {
        client_id, viveiro_id: tanque.id, lote_id: lote.id, data: rascunho.data, observacoes: rascunho.observacoes.trim(),
        grupos: preenchidos.map((g) => ({ peixes: lerNumero(g.peixes), peso_kg: lerNumero(g.kg), ponto_captura: g.ponto.trim() || undefined })),
        jejum_horas: lerNumero(rascunho.jejum), temperatura_c: lerNumero(rascunho.temperatura), oxigenio_mg_l: lerNumero(rascunho.oxigenio),
      }
      : {
        client_id, viveiro_id: tanque.id, lote_id: lote.id, data: rascunho.data, peixes,
        peso_total_g: modo === "total" && lerNumero(totalTexto) !== null ? Math.round(lerNumero(totalTexto)! * 1000 * 10) / 10 : null,
        peso_medio_g: modo === "medio" ? lerNumero(medioTexto) : null,
        observacoes: rascunho.observacoes.trim(),
      };
    const v = validarBiometriaCampo(corpo, campo.hoje);
    if ("erro" in v) return setErro(v.erro);
    if (muitoDiferente && !conferir) return setConferir(true);
    const item: ItemFila = {
      client_id, tipo: "biometria", criado_em: new Date().toISOString(), corpo,
      rotulo: rotuloCartao({ tipo: "biometria", viveiro_id: tanque.id, peixes: v.ok.peixes, peso_total_g: v.ok.peso_total_g, peso_medio_g: v.ok.peso_medio_g, observacoes: "" }, campo.cartoes)
        + (v.ok.grupos ? ` · ${v.ok.grupos.length} ${v.ok.grupos.length === 1 ? "grupo" : "grupos"}` : ""),
    };
    if (campo.salvar(item)) {
      try { localStorage.removeItem(CHAVE_RASCUNHO(tanque.id)); } catch { /* nada a limpar */ }
      aoSalvar();
    } else setErro("O celular está sem espaço para guardar. Libere espaço ou lance com sinal.");
  }

  return (
    <form id={idForm} onSubmit={salvar} noValidate className="flex flex-col gap-5 pt-1">
      <p className="px-1 text-sm text-texto-suave">
        Pese uns {fmt(amostra, 0)} peixes{lote.peixes > 0 ? ` dos ${fmt(lote.peixes, 0)} do viveiro` : ""}, em grupos, de pontos diferentes do viveiro.
      </p>
      <Segmentado rotulo="Como pesar" valor={modo} mudar={(v) => { setModo(v); setConferir(false); }}
        opcoes={[{ valor: "grupos", nome: "Em grupos" }, { valor: "total", nome: "Peso total" }, { valor: "medio", nome: "Peso médio" }]} />

      {recuperado && modo === "grupos" && (
        <AvisoCampo tom="info" titulo="Rascunho recuperado">Os grupos que você já tinha pesado neste viveiro voltaram. Conclua quando terminar.</AvisoCampo>
      )}

      {modo === "grupos" ? (
        <div className="flex flex-col gap-3">
          {rascunho.grupos.map((g, i) => {
            const p = lerNumero(g.peixes), k = lerNumero(g.kg);
            return (
              <fieldset key={g.chave} className="rounded-2xl bg-elevado/60 p-3 shadow-[inset_0_0_0_1px_var(--brilho)]">
                <legend className="sr-only">Grupo {i + 1}</legend>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">Grupo {i + 1}</span>
                  <span className="text-xs text-texto-suave tabular-nums">{p && k ? `${fmt((k * 1000) / p, 0)} g por peixe` : ""}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CampoNumero rotulo="Peixes" inputMode="numeric" value={g.peixes} onChange={(e) => mudarGrupo(g.chave, "peixes", e.target.value)} placeholder="0" />
                  <CampoNumero rotulo="Peso" unidade="kg" value={g.kg} onChange={(e) => mudarGrupo(g.chave, "kg", e.target.value)} placeholder="0,0" />
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <Entrada rotulo="Ponto de captura" className="flex-1" value={g.ponto} onChange={(e) => mudarGrupo(g.chave, "ponto", e.target.value)} placeholder="Ex.: perto do monge" />
                  {rascunho.grupos.length > 1 && (
                    <BotaoPilula variante="perigo" aria-label={`Tirar o grupo ${i + 1}`} onClick={() => mudar({ ...rascunho, grupos: rascunho.grupos.filter((x) => x.chave !== g.chave) })}>
                      <Trash2 size={16} aria-hidden />
                    </BotaoPilula>
                  )}
                </div>
              </fieldset>
            );
          })}
          <BotaoPilula onClick={() => mudar({ ...rascunho, grupos: [...rascunho.grupos, grupoVazio()] })}>
            <Plus size={16} aria-hidden /> Mais um grupo
          </BotaoPilula>
        </div>
      ) : (
        <>
          <CampoNumero rotulo="Peixes pesados" inputMode="numeric" value={peixesTexto} onChange={(e) => { setPeixesTexto(e.target.value); setConferir(false); }} placeholder="0" />
          {modo === "total"
            ? <CampoNumero rotulo="Peso total da amostra" unidade="kg" value={totalTexto} onChange={(e) => { setTotalTexto(e.target.value); setConferir(false); }} placeholder="0,0" />
            : <CampoNumero rotulo="Peso médio por peixe" unidade="g" value={medioTexto} onChange={(e) => { setMedioTexto(e.target.value); setConferir(false); }} placeholder="0" />}
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Numero titulo="Peso médio medido" valor={medio !== null ? `${fmt(medio, 0)} g` : "—"} tom={muitoDiferente ? "alerta" : undefined}
          detalhe={modo === "grupos" && totais.peixes ? `${fmt(totais.peixes, 0)} peixes · ${fmt(totais.pesoTotalG / 1000, 2)} kg` : medio !== null ? `biomassa ≈ ${fmt((medio * lote.peixes) / 1000, 0)} kg` : undefined} />
        <Numero titulo="Estimado hoje" valor={lote.peso_g !== null ? `${fmt(lote.peso_g, 0)} g` : "—"}
          detalhe={diferenca !== null ? `${diferenca >= 0 ? "+" : ""}${fmt(diferenca, 0)}% na pesagem` : "pela curva do lote"} />
      </div>
      {conferir && (
        <AvisoCampo tom="alerta" titulo="Peso muito diferente do estimado">
          Confira o número de peixes e o peso (kg ou g). Se estiver certo, toque em Concluir de novo.
        </AvisoCampo>
      )}

      {modo === "grupos" && (
        <div className="grid grid-cols-3 gap-2">
          <CampoNumero rotulo="Jejum" unidade="h" value={rascunho.jejum} onChange={(e) => mudar({ ...rascunho, jejum: e.target.value })} placeholder="—" />
          <CampoNumero rotulo="Água" unidade="°C" value={rascunho.temperatura} onChange={(e) => mudar({ ...rascunho, temperatura: e.target.value })} placeholder="—" />
          <CampoNumero rotulo="O₂" unidade="mg/L" value={rascunho.oxigenio} onChange={(e) => mudar({ ...rascunho, oxigenio: e.target.value })} placeholder="—" />
        </div>
      )}
      <Observacoes valor={rascunho.observacoes} mudar={(v) => mudar({ ...rascunho, observacoes: v })} ajuda="Opcional: uniformidade, sinais de doença." />
      <Entrada rotulo="Data" type="date" value={rascunho.data} max={campo.hoje} onChange={(e) => mudar({ ...rascunho, data: e.target.value })} />
      {erro && <AvisoCampo tom="perigo">{erro}</AvisoCampo>}
      <RodapeFolha>
        <BotaoGrande type="submit" form={idForm}>{conferir ? "Está certo, concluir" : "Concluir biometria"}</BotaoGrande>
      </RodapeFolha>
    </form>
  );
}
