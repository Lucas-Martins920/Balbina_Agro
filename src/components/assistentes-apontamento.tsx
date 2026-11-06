"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { contarMortesPorFoto } from "@/app/(app)/apontamentos/foto-mortes-action";
import { classeBotao } from "@/components/ui";
import { CAUSAS_MORTE } from "@/lib/causas-morte";
import { interpretarFala, resumoFala, type ViveiroFala } from "@/lib/fala-apontamento";
import { reduzirImagem } from "@/lib/imagem-cliente";
import { classeReconhecimento, mensagemErroVoz, type Reconhecimento } from "@/lib/reconhecimento-voz";

// Preenche um campo do formulário do apontamento como se a pessoa tivesse digitado (o React vê a mudança).
function preencher(form: HTMLFormElement, nome: string, valor: string | number) {
  const el = form.elements.namedItem(nome);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return false;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, String(valor));
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

const formulario = () => document.querySelector<HTMLSelectElement>("select[name=viveiro_id]")?.form ?? null;
const quadros = (n: number) => new Promise<void>((ok) => { const f = () => (n-- <= 0 ? ok() : requestAnimationFrame(f)); f(); });

const nada = () => () => {};

// A3: "Viveiro 3, quarenta quilos de ração, duas mortes por falta de oxigênio, oxigênio 2,5" vira os campos.
// O reconhecimento é o do celular; a interpretação roda aqui, sem internet.
export function FalarApontamento({ viveiros }: { viveiros: ViveiroFala[] }) {
  const [ouvindo, setOuvindo] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const suportado = useSyncExternalStore(nada, () => classeReconhecimento() !== undefined, () => false);
  const rec = useRef<Reconhecimento | null>(null);
  if (!suportado) return null;

  async function aplicar(texto: string) {
    const r = interpretarFala(texto, viveiros);
    let form = formulario();
    if (!form) return;
    if (r.viveiro_id && preencher(form, "viveiro_id", r.viveiro_id)) {
      await quadros(2); // trocar de viveiro recomeça os campos
      form = formulario();
      if (!form) return;
    }
    if (r.mortes !== undefined) preencher(form, "mortes", r.mortes);
    if (r.descartes !== undefined) preencher(form, "descartes", r.descartes);
    if (r.racao_kg !== undefined && !preencher(form, "racao_kg", String(r.racao_kg).replace(".", ","))) {
      preencher(form, "racao_kg_0", String(r.racao_kg).replace(".", ","));
    }
    if (r.causa && r.mortes) preencher(form, `causa_${r.causa}`, r.mortes);
    for (const [chave, valor] of Object.entries(r.agua ?? {})) preencher(form, `agua_${chave}`, String(valor).replace(".", ","));
    const resumo = resumoFala(r, viveiros);
    setMensagem(resumo ? `Entendi: ${resumo}. Confira antes de salvar.` : `Não entendi "${texto}". Tente: "viveiro 2, 40 quilos de ração, 3 mortes".`);
  }

  function falar() {
    if (ouvindo) { rec.current?.stop(); return; }
    const Classe = classeReconhecimento();
    if (!Classe) return;
    const r = new Classe();
    rec.current = r;
    r.lang = "pt-BR";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => { void aplicar(Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ")); };
    r.onerror = (e) => setMensagem(mensagemErroVoz(e.error));
    r.onend = () => setOuvindo(false);
    setMensagem(null);
    setOuvindo(true);
    r.start();
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={falar} className={`${classeBotao(ouvindo ? "primario" : "secundario")} self-start`} aria-pressed={ouvindo}>
        {ouvindo ? "Ouvindo… toque para parar" : "Falar o apontamento"}
      </button>
      <p role="status" className="text-xs text-texto-suave">{mensagem ?? "Ex.: \"viveiro 2, 40 quilos de ração, 3 mortes por garça, oxigênio 4,5, temperatura 29\"."}</p>
    </div>
  );
}

// A8: foto dos peixes mortos → quantidade e causa provável (IA, precisa de internet).
export function FotoMortes() {
  const [lendo, setLendo] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function aoEscolher(arquivo: File | undefined) {
    const form = ref.current?.form;
    if (!arquivo || !form) return;
    setLendo(true);
    setMensagem(null);
    const dados = new FormData();
    dados.set("foto", await reduzirImagem(arquivo, 1600));
    try {
      const { erro, resultado } = await contarMortesPorFoto(dados);
      if (erro || !resultado) { setMensagem(erro ?? "Não deu para ler a foto."); return; }
      preencher(form, "mortes", resultado.quantidade);
      const causa = CAUSAS_MORTE.find((c) => c.chave === resultado.causa);
      if (causa && resultado.quantidade > 0) preencher(form, `causa_${causa.chave}`, resultado.quantidade);
      setMensagem(`${resultado.quantidade} peixe(s) na foto${causa ? `, provável ${causa.nome.toLowerCase()}` : ""} (confiança ${resultado.confianca}). ${resultado.observacao} Confira: é uma sugestão.`);
    } catch {
      setMensagem("Sem internet: a contagem por foto precisa de conexão.");
    } finally {
      setLendo(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="col-span-full flex flex-col gap-1">
      <label className={`${classeBotao("secundario", "sm")} self-start ${lendo ? "opacity-60" : "cursor-pointer"}`}>
        {lendo ? "Contando…" : "Contar mortes por foto"}
        <input ref={ref} type="file" accept="image/*" capture="environment" className="sr-only" disabled={lendo}
          onChange={(e) => void aoEscolher(e.target.files?.[0])} />
      </label>
      {mensagem && <p role="status" className="text-xs text-texto-suave">{mensagem}</p>}
    </div>
  );
}
