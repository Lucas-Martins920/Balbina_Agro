"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Campo, classeBotao } from "@/components/ui";
import { totaisGrupos, type GrupoBiometria } from "@/lib/biometria-grupos";
import { formatarNumero, lerDecimal } from "@/lib/formato";

type Linha = { chave: number; peixes: string; kg: string; ponto: string };

const paraLinhas = (grupos: GrupoBiometria[]): Linha[] =>
  grupos.length
    ? grupos.map((g, i) => ({ chave: i, peixes: String(g.peixes), kg: String(g.peso_kg).replace(".", ","), ponto: g.ponto_captura ?? "" }))
    : [{ chave: 0, peixes: "", kg: "", ponto: "" }];

const ler = (v: string) => { const n = lerDecimal(v); return n === null || Number.isNaN(n) ? null : n; };

// Grupos da biometria no site: cada linha é um puçá ou balde (peixes e kg). Mostra o peso médio ponderado na hora
// e manda os grupos num campo escondido "grupos" (JSON). O rascunho fica no navegador até salvar.
export function GruposBiometria({ iniciais = [], rascunho, sugestao }: { iniciais?: GrupoBiometria[]; rascunho?: string; sugestao?: number }) {
  const chave = rascunho ? `balbina-biometria:${rascunho}` : null;
  const [linhas, setLinhas] = useState<Linha[]>(() => {
    if (chave && typeof window !== "undefined") {
      try {
        const salvo = JSON.parse(localStorage.getItem(chave) ?? "null") as Linha[] | null;
        if (Array.isArray(salvo) && salvo.some((l) => l.peixes || l.kg)) return salvo;
      } catch { /* rascunho ilegível: começa do zero */ }
    }
    return paraLinhas(iniciais);
  });
  const mudar = (novas: Linha[]) => {
    setLinhas(novas);
    if (chave) try { localStorage.setItem(chave, JSON.stringify(novas)); } catch { /* sem espaço */ }
  };
  const editar = (c: number, k: keyof Linha, v: string) => mudar(linhas.map((l) => (l.chave === c ? { ...l, [k]: v } : l)));
  const preenchidas = linhas.filter((l) => l.peixes.trim() || l.kg.trim());
  const grupos = preenchidas.map((l) => ({ peixes: ler(l.peixes), peso_kg: ler(l.kg), ponto_captura: l.ponto.trim() || undefined }));
  const t = totaisGrupos(grupos);

  return (
    <fieldset className="flex flex-col gap-3" ref={(el) => {
      // ao enviar o formulário o rascunho sai do navegador (os grupos continuam na tela até a gaveta fechar)
      const form = el?.form;
      if (!form || !chave) return;
      const limpar = () => { try { localStorage.removeItem(chave); } catch { /* nada */ } };
      form.addEventListener("submit", limpar);
      return () => form.removeEventListener("submit", limpar);
    }}>
      <legend className="mb-1 text-sm font-medium">Grupos pesados{sugestao ? ` (amostra sugerida: ${formatarNumero(sugestao, 0)} peixes)` : ""}</legend>
      <input type="hidden" name="grupos" value={JSON.stringify(grupos)} />
      {linhas.map((l, i) => (
        <div key={l.chave} className="grid grid-cols-[1fr_1fr_1.4fr_auto] items-end gap-2">
          <Campo rotulo={`Grupo ${i + 1}: peixes`} id={`g_peixes_${l.chave}`} inputMode="numeric" value={l.peixes} onChange={(e) => editar(l.chave, "peixes", e.target.value)} placeholder="Ex.: 10" />
          <Campo rotulo="Peso (kg)" id={`g_kg_${l.chave}`} inputMode="decimal" value={l.kg} onChange={(e) => editar(l.chave, "kg", e.target.value)} placeholder="Ex.: 1,5" />
          <Campo rotulo="Ponto de captura" id={`g_ponto_${l.chave}`} value={l.ponto} onChange={(e) => editar(l.chave, "ponto", e.target.value)} placeholder="Opcional" />
          <button type="button" aria-label={`Tirar o grupo ${i + 1}`} disabled={linhas.length === 1}
            className={classeBotao("fantasma", "sm")} onClick={() => mudar(linhas.filter((x) => x.chave !== l.chave))}>
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={classeBotao("secundario", "sm")}
          onClick={() => mudar([...linhas, { chave: Math.max(...linhas.map((x) => x.chave)) + 1, peixes: "", kg: "", ponto: "" }])}>
          <Plus size={16} aria-hidden /> Mais um grupo
        </button>
        <p className="text-sm tabular-nums" aria-live="polite">
          {t.pesoMedioG === null ? "Peso médio: –"
            : <>Peso médio <strong>{formatarNumero(t.pesoMedioG, 1)} g</strong> · {formatarNumero(t.peixes, 0)} peixes · {formatarNumero(t.pesoTotalG / 1000, 3)} kg</>}
        </p>
      </div>
      <p className="text-xs text-texto-suave">Peso médio = peso total ÷ total de peixes (média ponderada), não a média dos grupos.</p>
    </fieldset>
  );
}
