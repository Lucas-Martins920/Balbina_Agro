"use client";

import { useState } from "react";
import { FalarApontamento, FotoMortes } from "@/components/assistentes-apontamento";
import { Campo, classeBotao, Selecao } from "@/components/ui";
import { avisosAgua, CAMPOS_AGUA, lerMedida, type Agua } from "@/lib/agua";
import { LINHAS_RACAO } from "@/lib/apontamento-racao";
import { CAUSAS_MORTE } from "@/lib/causas-morte";
import { TURNOS } from "@/lib/rotulos";
import { lerDecimal } from "@/lib/formato";
import { foraDoEsperado, type Sugestao, type Sugestoes } from "@/lib/sugestao-apontamento";

// Ração da tabela de arraçoamento para hoje (racao_sugerida no banco), pelo peso da última biometria
export type RacaoTabela = { racaoKg: number; refeicoes: number | null; taxaPct: number | null; pesoMedioG: number | null; alerta: string | null };
export type ViveiroApontamento = { id: string; rotulo: string; fase: string; nome?: string; tabela?: RacaoTabela | null };
export type RacaoApontamento = { id: string; nome: string; saldo: number };
export type ItemChecklistTela = { id: string; nome: string; tipo: string; unidade: string | null; aplica_em: string };

type Props = {
  viveiros: ViveiroApontamento[];
  viveiroPadrao?: string;
  hoje: string;
  turnoPadrao: string;
  racoes: RacaoApontamento[];
  // a empresa pede a qualidade da água no apontamento (Configurações)
  agua?: boolean;
  checklist: ItemChecklistTela[];
  sugestoes?: Sugestoes;
  // leitura por IA ligada no servidor (contagem de mortes por foto)
  ia?: boolean;
};

// Faixa de valores para o slider de itens numéricos do checklist.
function faixaMedida(unidade: string | null): { min: number; max: number; step: number; padrao: number } {
  const u = (unidade ?? "").toLowerCase();
  if (u === "°c" || u.includes("grau") || u.includes("temp")) return { min: 15, max: 45, step: 0.5, padrao: 28 };
  if (u === "%" || u.includes("umid")) return { min: 0, max: 100, step: 1, padrao: 60 };
  if (u === "l" || u.includes("litro")) return { min: 0, max: 1000, step: 1, padrao: 0 };
  return { min: 0, max: 100, step: 0.1, padrao: 0 };
}

// Slider com "não é possível medir" — substitui o campo de texto para itens numéricos do checklist.
function CampoMedida({ item }: { item: ItemChecklistTela }) {
  const faixa = faixaMedida(item.unidade);
  const [naoMedir, setNaoMedir] = useState(false);
  const [valor, setValor] = useState(faixa.padrao);

  return (
    <div className="col-span-full flex flex-col gap-2 rounded-xl border border-linha px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-texto">{item.nome}{item.unidade ? ` (${item.unidade})` : ""}</span>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-texto-suave">
          <input type="checkbox" checked={naoMedir} onChange={() => setNaoMedir(!naoMedir)}
            className="h-4 w-4 rounded border-borda accent-marca" />
          Não é possível medir
        </label>
      </div>
      {naoMedir ? (
        <input type="hidden" name={`ck_${item.id}`} value="" />
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-texto-suave">{faixa.min}</span>
          <input type="range" name={`ck_${item.id}`} min={faixa.min} max={faixa.max} step={faixa.step}
            value={valor} onChange={(e) => setValor(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-linha accent-marca [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-marca [&::-webkit-slider-thumb]:shadow-md" />
          <span className="text-xs tabular-nums text-texto-suave">{faixa.max}</span>
          <span className="min-w-16 rounded-lg bg-elevado px-2 py-1 text-center text-lg font-semibold tabular-nums text-texto shadow-[inset_0_1px_0_var(--aresta)]">
            {valor}{item.unidade ? <span className="ml-0.5 text-xs font-normal text-texto-suave">{item.unidade}</span> : null}
          </span>
        </div>
      )}
    </div>
  );
}

// Campos do lançamento que mudam com o viveiro: a ração da tabela vem do peso do lote nele, e o checklist
// mostra só os itens daquela fase (alevinagem e recria, ou engorda).
export function CamposLancamento({ viveiros, viveiroPadrao, hoje, turnoPadrao, racoes, checklist, sugestoes = {}, ia = false, agua = true }: Props) {
  const [viveiro, setViveiro] = useState(viveiroPadrao ?? viveiros[0]?.id ?? "");
  const [turno, setTurno] = useState(turnoPadrao);
  const sugestao = sugestoes[viveiro]?.[turno];
  const atual = viveiros.find((g) => g.id === viveiro);
  const fase = atual?.fase === "engorda" ? "engorda" : "alevinagem_recria";
  const itens = checklist.filter((c) => c.aplica_em === "todos" || c.aplica_em === fase);

  return (
    <>
      <FalarApontamento viveiros={viveiros.map((g) => ({ id: g.id, rotulo: g.nome ?? g.rotulo }))} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Selecao rotulo="Viveiro" id="viveiro_id" name="viveiro_id" value={viveiro} onChange={(e) => setViveiro(e.target.value)} required>
          {viveiros.map((g) => <option key={g.id} value={g.id}>{g.rotulo}</option>)}
        </Selecao>
        <Campo rotulo="Data" id="data" name="data" type="date" defaultValue={hoje} max={hoje} required />
        <Selecao rotulo="Turno" id="turno" name="turno" value={turno} onChange={(e) => setTurno(e.target.value)} required>
          {Object.entries(TURNOS).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
        </Selecao>
      </div>

      {atual?.tabela && <RacaoDaTabela tabela={atual.tabela} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Campo rotulo="Mortes" id="mortes" name="mortes" inputMode="numeric" placeholder="0" required />
        <Campo rotulo="Descartes" id="descartes" name="descartes" inputMode="numeric" placeholder="0" required />
        {racoes.length === 0 && <CampoRacaoSemTipo sugestao={sugestao} key={`k-${viveiro}-${turno}`} />}
        {ia && <FotoMortes />}
      </div>

      <details className="rounded-lg border border-linha px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Causa das mortes e descartes (opcional)</summary>
        <p className="mt-1 text-xs text-texto-suave">Quantos peixes por causa. Pode deixar em branco o que não souber; a soma não passa das baixas.</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CAUSAS_MORTE.map((c) => (
            <Campo key={c.chave} rotulo={c.nome} id={`causa_${c.chave}`} name={`causa_${c.chave}`} inputMode="numeric" placeholder="0" />
          ))}
        </div>
      </details>

      {/* key: trocar de viveiro ou turno recomeça os campos com a sugestão certa */}
      <Racao key={`r-${viveiro}-${turno}`} sugestao={sugestao} racoes={racoes} />

      {agua && <CamposAgua />}

      {itens.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Checklist do viveiro</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {itens.map((c) => c.tipo === "numero" ? (
              <CampoMedida key={c.id} item={c} />
            ) : (
              <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{c.nome}</span>
                <span className="flex gap-3">
                  <label className="flex items-center gap-1"><input type="radio" name={`ck_${c.id}`} value="ok" required /> ok</label>
                  <label className="flex items-center gap-1 text-perigo"><input type="radio" name={`ck_${c.id}`} value="nao" /> não</label>
                </span>
              </div>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}

function Aviso({ valor, sugerido, texto }: { valor: number | null; sugerido: number; texto: string }) {
  if (!foraDoEsperado(valor, sugerido)) return null;
  return <p role="status" className="col-span-full text-xs font-medium text-alerta">Fora do esperado: {texto}. Confira antes de salvar.</p>;
}

function CampoRacaoSemTipo({ sugestao }: { sugestao?: Sugestao }) {
  const inicial = sugestao?.racaoKg ? String(sugestao.racaoKg).replace(".", ",") : "";
  const [kg, setKg] = useState(inicial);
  return (
    <div className="flex flex-col gap-1">
      <Campo rotulo="Ração (kg)" id="racao_kg" name="racao_kg" inputMode="decimal" placeholder="0" required defaultValue={inicial} onChange={(e) => setKg(e.target.value)} />
      {sugestao && <Aviso valor={lerDecimal(kg)} sugerido={sugestao.racaoKg} texto={`o normal deste turno é ${sugestao.racaoKg.toLocaleString("pt-BR")} kg`} />}
    </div>
  );
}

// O que a tabela de arraçoamento pede para o lote hoje. Dois turnos: cada um leva cerca de metade.
function RacaoDaTabela({ tabela }: { tabela: RacaoTabela }) {
  const br = (n: number, casas = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${tabela.alerta ? "border-alerta bg-[var(--etiqueta-alerta)]" : "border-linha"}`}>
      <p>
        <span className="font-medium">Tabela de arraçoamento: {br(tabela.racaoKg)} kg hoje</span>
        {tabela.refeicoes ? ` em ${tabela.refeicoes} tratos` : ""} · cerca de {br(tabela.racaoKg / 2)} kg por turno
      </p>
      <p className="text-xs text-texto-suave">
        {tabela.taxaPct !== null && `${br(tabela.taxaPct, 2)}% da biomassa por dia`}
        {tabela.pesoMedioG !== null && ` · peixe de ${br(tabela.pesoMedioG, 0)} g na última biometria`}
      </p>
      {tabela.alerta && <p role="status" className="mt-1 text-xs font-medium text-alerta">{tabela.alerta}</p>}
    </div>
  );
}

// Qualidade da água medida no turno. Em branco não grava; a medida fora da faixa avisa na hora.
function CamposAgua() {
  const [valores, setValores] = useState<Agua>({});
  const avisos = avisosAgua(valores);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Qualidade da água (opcional)</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {CAMPOS_AGUA.map((c) => (
          <Campo key={c.chave} rotulo={`${c.curto}${c.unidade ? ` (${c.unidade})` : ""}`} id={`agua_${c.chave}`} name={`agua_${c.chave}`} inputMode="decimal" placeholder="—"
            title={c.ajuda} onChange={(e) => {
              const v = lerMedida(e.target.value);
              setValores((a) => { const novo = { ...a }; if (typeof v === "number") novo[c.chave] = v; else delete novo[c.chave]; return novo; });
            }} />
        ))}
      </div>
      {avisos.map((a) => (
        <p key={a.chave} role="status" className={`text-xs font-medium ${a.nivel === "critico" ? "text-perigo" : "text-alerta"}`}>{a.texto}</p>
      ))}
    </fieldset>
  );
}

// Campos não controlados: o reset do formulário depois de salvar volta para a sugestão.
// A ração já vem com a sugestão do histórico do lote (mediana dos últimos lançamentos do turno).
function Racao({ sugestao, racoes }: { sugestao?: Sugestao; racoes: RacaoApontamento[] }) {
  const linhasSug = (sugestao?.racoes ?? []).filter((r) => racoes.some((x) => x.id === r.produto_id));
  const [linhas, setLinhas] = useState(Math.max(1, linhasSug.length));
  const kgsIni = linhasSug.map((r) => String(r.kg).replace(".", ","));
  const [kgs, setKgs] = useState<string[]>(kgsIni);

  if (racoes.length === 0) return null;
  const totalKg = kgs.reduce((t, k) => t + (lerDecimal(k) ?? 0), 0);
  const sugKg = linhasSug.reduce((t, r) => t + r.kg, 0);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Ração dada (sai do estoque)</legend>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="grid grid-cols-[2fr_1fr] gap-3">
          <Selecao rotulo={i === 0 ? "Tipo de ração" : ""} aria-label={`Tipo de ração ${i + 1}`} id={`racao_produto_${i}`} name={`racao_produto_${i}`} defaultValue={linhasSug[i]?.produto_id ?? ""}>
            <option value="">—</option>
            {racoes.map((r) => <option key={r.id} value={r.id}>{r.nome} ({r.saldo.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg)</option>)}
          </Selecao>
          <Campo rotulo={i === 0 ? "kg" : ""} aria-label={`kg de ração ${i + 1}`} id={`racao_kg_${i}`} name={`racao_kg_${i}`} inputMode="decimal" placeholder="0"
            defaultValue={kgsIni[i] ?? ""} onChange={(e) => { const novo = [...kgs]; novo[i] = e.target.value; setKgs(novo); }} />
        </div>
      ))}
      {linhas < LINHAS_RACAO && (
        <button type="button" onClick={() => setLinhas(linhas + 1)} className={`${classeBotao("secundario", "sm")} self-start`}>+ outro tipo de ração</button>
      )}
      {linhasSug.length > 0 && <p className="text-xs text-texto-suave">Tipos e kg do trato normal deste turno. Mudou o trato? Corrija.</p>}
      {sugKg > 0 && <Aviso valor={totalKg} sugerido={sugKg} texto={`o normal é ${sugKg.toLocaleString("pt-BR")} kg`} />}
    </fieldset>
  );
}
