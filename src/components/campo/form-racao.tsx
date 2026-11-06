"use client";

import { useId, useState, type FormEvent } from "react";
import { ChevronDown, Droplets } from "lucide-react";
import { CAMPOS_AGUA, avisosAgua, validarAgua, type ChaveAgua } from "@/lib/agua";
import { CAUSAS_MORTE } from "@/lib/causas-morte";
import { TURNOS } from "@/lib/rotulos";
import { foraDoEsperado } from "@/lib/sugestao-apontamento";
import type { RespostaChecklist } from "@/lib/apontamento-racao";
import { apontamentoDoTurno, type ItemFila } from "@/lib/campo/fila";
import { racaoPorTurno } from "@/lib/campo/indicadores";
import { rotuloCartao, type CartaoApontamento, type Turno } from "@/lib/campo/propostas";
import type { Tanque } from "@/lib/campo/tipos";
import { novoId, useCampo, type ItemChecklistCampo } from "./contexto";
import { usePreferencia } from "./fila-cliente";
import {
  AvisoCampo, BotaoGrande, BotaoPilula, CampoNumero, Entrada, Escolha, fmt, lerNumero, Observacoes, Passo, RodapeFolha, Segmentado, Selecao,
} from "./pecas";

const arredondar = (n: number) => Math.round(n * 1000) / 1000;

// Item sim/não do checklist do turno: em branco fica de fora do envio
function SimNao({ item, valor, mudar }: { item: ItemChecklistCampo; valor: string; mudar: (v: string) => void }) {
  const opcao = (v: "ok" | "nao", nome: string) => (
    <button type="button" aria-pressed={valor === v} onClick={() => mudar(valor === v ? "" : v)}
      className={`h-10 min-w-16 rounded-full px-3 text-sm font-semibold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.95] ${
        valor === v ? (v === "ok" ? "bg-positivo text-white" : "bg-perigo text-white") : "bg-elevado text-texto-suave"}`}>
      {nome}
    </button>
  );
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0 text-[15px]">{item.nome}</span>
      <div role="group" aria-label={item.nome} className="flex shrink-0 gap-1.5">{opcao("ok", "Sim")}{opcao("nao", "Não")}</div>
    </div>
  );
}

// Ração, mortes, água e checklist do viveiro no turno: o lançamento de todo dia, no menor número de toques.
// Vem preenchido com a ração normal do turno (histórico do lote); a tabela de arraçoamento fica de referência.
export function FormRacao({ tanque, aoSalvar }: { tanque: Tanque; aoSalvar: () => void }) {
  const campo = useCampo();
  const idForm = useId();
  const { dados, kgSaco } = campo;
  const lote = tanque.lote;
  const loteNaFila = campo.pendentes(tanque.id).find((i) => i.tipo === "abrir_lote");
  const peixes = lote?.peixes ?? (typeof loteNaFila?.corpo.quantidade === "number" ? loteNaFila.corpo.quantidade : null);
  const fase = (lote?.fase ?? "alevinagem") === "engorda" ? "engorda" : "alevinagem_recria";
  const itensChecklist = dados.checklist.filter((c) => c.aplica_em === "todos" || c.aplica_em === fase);

  const [turno, setTurno] = useState<Turno>(campo.turno);
  const [data, setData] = useState(campo.hoje);
  const [modoSalvo, setModo] = usePreferencia<string>(`balbina:campo:modo-racao:${dados.empresa.id}`, "sacos");
  const porSaco = modoSalvo !== "kg";
  const sugestao = dados.sugestoes[tanque.id]?.[turno];
  const normal = sugestao && sugestao.racaoKg > 0 ? sugestao.racaoKg : null;
  const [sacos, setSacos] = useState(() => (normal && kgSaco > 0 ? Math.round((normal / kgSaco) * 2) / 2 : 0));
  const [kgTexto, setKgTexto] = useState(() => (normal ? fmt(normal, 3) : ""));
  const [kgSacoTexto, setKgSacoTexto] = useState(() => fmt(kgSaco, 1));
  const [produto, setProduto] = useState(() => sugestao?.racoes.find((r) => dados.racoes.some((x) => x.id === r.produto_id))?.produto_id ?? "");
  const [mortes, setMortes] = useState(0);
  const [causa, setCausa] = useState("");
  const [aguaAberta, setAguaAberta] = useState(campo.turno === "manha");
  const [agua, setAgua] = useState<Partial<Record<ChaveAgua, string>>>({});
  const [checklist, setChecklist] = useState<Record<string, string>>({});
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [somar, setSomar] = useState(false);

  const kgDigitado = lerNumero(kgTexto);
  const racaoKg = porSaco ? arredondar(sacos * kgSaco) : (kgDigitado ?? 0);
  const tabelaTurno = racaoPorTurno(lote?.racao?.kg);
  const lidaAgua = validarAgua(agua);
  const avisos = "ok" in lidaAgua ? avisosAgua(lidaAgua.ok) : [];
  const jaLancado = apontamentoDoTurno(tanque.id, data, turno, campo.fila.fila, campo.fila.enviados);

  function usar(kg: number) {
    if (porSaco && kgSaco > 0 && Number.isInteger((kg / kgSaco) * 2)) setSacos(kg / kgSaco);
    else {
      setModo("kg");
      setKgTexto(fmt(kg, 3));
    }
  }

  function mudarKgSaco(texto: string) {
    setKgSacoTexto(texto);
    const n = lerNumero(texto);
    if (n !== null && n > 0 && n <= 100) campo.mudarKgSaco(n);
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!lote && !loteNaFila) return setErro("Este viveiro está vazio: abra o lote antes de lançar ração.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > campo.hoje) return setErro("Data inválida: use hoje ou um dia que já passou.");
    if (!porSaco && kgTexto.trim() && (kgDigitado === null || kgDigitado < 0)) return setErro("Ração: informe os kg em número (ex.: 12,5).");
    if (peixes !== null && mortes > peixes) return setErro(`As mortes passam dos ${fmt(peixes, 0)} peixes do viveiro.`);
    if ("erro" in lidaAgua) return setErro(lidaAgua.erro);
    const respostas: RespostaChecklist[] = [];
    for (const item of itensChecklist) {
      const v = (checklist[item.id] ?? "").trim();
      if (!v) continue;
      if (item.tipo === "numero") {
        const n = lerNumero(v);
        if (n === null) return setErro(`${item.nome}: informe um número.`);
        respostas.push({ item_id: item.id, valor: n });
      } else respostas.push({ item_id: item.id, ok: v === "ok" });
    }
    if (racaoKg === 0 && mortes === 0 && !lidaAgua.ok && !respostas.length && !observacoes.trim()) {
      return setErro("Informe a ração, as mortes ou a água.");
    }
    if (jaLancado && !somar) return setSomar(true);

    const cartao: CartaoApontamento = {
      tipo: "apontamento", viveiro_id: tanque.id, turno, racao_kg: racaoKg, sacos: porSaco && sacos > 0 ? sacos : null,
      racao_produto_id: produto || null, mortes: mortes || null, causa: causa || null, agua: lidaAgua.ok, observacoes: observacoes.trim(),
    };
    const client_id = novoId();
    const item: ItemFila = {
      client_id, tipo: "apontamento", rotulo: rotuloCartao(cartao, campo.cartoes), criado_em: new Date().toISOString(),
      corpo: {
        client_id, viveiro_id: tanque.id, data, turno, mortes, descartes: 0, racao_kg: racaoKg,
        racoes: produto && racaoKg > 0 ? [{ produto_id: produto, kg: racaoKg }] : [],
        agua: lidaAgua.ok, checklist: respostas, observacoes: observacoes.trim(),
        causas: causa && mortes ? { [causa]: mortes } : undefined,
        forcar: jaLancado ? true : undefined,
      },
    };
    if (campo.salvar(item)) aoSalvar();
    else setErro("O celular está sem espaço para guardar. Libere espaço ou lance com sinal.");
  }

  return (
    <form id={idForm} onSubmit={salvar} noValidate className="flex flex-col gap-5 pt-1">
      <Escolha rotulo="Turno" valor={turno} mudar={(v) => { setTurno(v); setSomar(false); }}
        opcoes={(Object.keys(TURNOS) as Turno[]).map((t) => ({ valor: t, nome: TURNOS[t] }))} />

      {(tabelaTurno !== null || normal !== null) && (
        <div className="flex flex-col gap-2 rounded-2xl bg-marca-suave/70 px-4 py-3">
          {tabelaTurno !== null && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm leading-snug">
                <span className="font-semibold">Tabela: {fmt(lote!.racao!.kg, 1)} kg/dia</span>
                <span className="block text-texto-suave">cerca de {fmt(tabelaTurno, 1)} kg neste turno{lote!.racao!.granulo ? ` · ${lote!.racao!.granulo}` : ""}</span>
              </p>
              <BotaoPilula onClick={() => usar(tabelaTurno)}>Usar</BotaoPilula>
            </div>
          )}
          {normal !== null && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm leading-snug">
                <span className="font-semibold">Normal deste turno: {fmt(normal, 1)} kg</span>
                <span className="block text-texto-suave">média dos últimos lançamentos do lote</span>
              </p>
              <BotaoPilula onClick={() => usar(normal)}>Repetir</BotaoPilula>
            </div>
          )}
        </div>
      )}
      {lote?.racao?.alerta && <AvisoCampo tom="perigo">{lote.racao.alerta}</AvisoCampo>}

      <section className="flex flex-col gap-3">
        <Segmentado rotulo="Como contar a ração" valor={porSaco ? "sacos" : "kg"} mudar={setModo}
          opcoes={[{ valor: "sacos", nome: "Sacos" }, { valor: "kg", nome: "Quilos" }]} />
        {porSaco ? (
          <>
            <Passo rotulo="Sacos de ração" valor={sacos} mudar={setSacos} passo={0.5} />
            <div className="flex items-center justify-between gap-3 px-1 text-sm">
              <label className="flex items-center gap-2 text-texto-suave">
                1 saco =
                <input value={kgSacoTexto} onChange={(e) => mudarKgSaco(e.target.value)} inputMode="decimal" aria-label="Quilos em cada saco"
                  className="h-9 w-16 rounded-xl border border-borda bg-elevado/80 text-center text-[15px] text-texto tabular-nums outline-none! focus:border-marca focus:ring-4 focus:ring-marca/20" />
                kg
              </label>
              <span className="font-semibold tabular-nums">{fmt(racaoKg, 1)} kg</span>
            </div>
          </>
        ) : (
          <CampoNumero rotulo="Ração dada" unidade="kg" value={kgTexto} onChange={(e) => setKgTexto(e.target.value)} placeholder="0" />
        )}
        {normal !== null && racaoKg > 0 && foraDoEsperado(racaoKg, normal) && (
          <p className="px-1 text-xs text-alerta">Bem diferente do normal deste turno ({fmt(normal, 1)} kg). Confira antes de salvar.</p>
        )}
        {dados.racoes.length > 0 && (
          <Selecao rotulo="Ração usada" value={produto} onChange={(e) => setProduto(e.target.value)}
            ajuda={produto ? "Sai do estoque desta ração." : "Sem o tipo, os kg não saem do estoque."}>
            <option value="">Sem tipo</option>
            {dados.racoes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </Selecao>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <Passo rotulo="Peixes mortos" valor={mortes} mudar={(v) => setMortes(Math.round(v))} />
        {mortes > 0 && (
          <Selecao rotulo="Causa provável" value={causa} onChange={(e) => setCausa(e.target.value)} ajuda="Opcional. Ajuda o painel a mostrar o que mais mata.">
            <option value="">Não sei</option>
            {CAUSAS_MORTE.map((c) => <option key={c.chave} value={c.chave}>{c.nome}</option>)}
          </Selecao>
        )}
      </section>

      {dados.agua && (
        <section className="rounded-2xl bg-elevado/60">
          <button type="button" onClick={() => setAguaAberta(!aguaAberta)} aria-expanded={aguaAberta}
            className="flex h-14 w-full items-center gap-2.5 px-4 text-left text-[15px] font-semibold">
            <Droplets aria-hidden size={18} className="text-marca" />
            <span className="flex-1">Qualidade da água</span>
            <ChevronDown aria-hidden size={18} className={`text-texto-suave transition-transform duration-200 ${aguaAberta ? "rotate-180" : ""}`} />
          </button>
          {aguaAberta && (
            <div className="campo-entra grid grid-cols-2 gap-3 px-4 pb-4">
              {CAMPOS_AGUA.map((c) => (
                <CampoNumero key={c.chave} rotulo={c.curto} unidade={c.unidade || undefined} value={agua[c.chave] ?? ""}
                  onChange={(e) => setAgua({ ...agua, [c.chave]: e.target.value })} className={c.chave === "oxigenio_mg_l" ? "col-span-2" : undefined}
                  ajuda={c.chave === "oxigenio_mg_l" ? c.ajuda : undefined} />
              ))}
            </div>
          )}
        </section>
      )}
      {avisos.map((a) => <AvisoCampo key={a.chave} tom={a.nivel === "critico" ? "perigo" : "alerta"}>{a.texto}</AvisoCampo>)}

      {itensChecklist.length > 0 && (
        <section className="rounded-2xl bg-elevado/60 px-4 py-2">
          <p className="pt-1 pb-1 text-[15px] font-semibold">Checklist do turno</p>
          <div className="divide-y divide-linha">
            {itensChecklist.map((item) => item.tipo === "numero" ? (
              <div key={item.id} className="py-2">
                <CampoNumero rotulo={item.nome} unidade={item.unidade ?? undefined} value={checklist[item.id] ?? ""}
                  onChange={(e) => setChecklist({ ...checklist, [item.id]: e.target.value })} />
              </div>
            ) : (
              <SimNao key={item.id} item={item} valor={checklist[item.id] ?? ""} mudar={(v) => setChecklist({ ...checklist, [item.id]: v })} />
            ))}
          </div>
        </section>
      )}

      <Observacoes valor={observacoes} mudar={setObservacoes} />
      <Entrada rotulo="Data" type="date" value={data} max={campo.hoje} onChange={(e) => { setData(e.target.value); setSomar(false); }} />

      {somar && (
        <AvisoCampo tom="alerta" titulo={`Já tem ${TURNOS[turno].toLowerCase()} lançada neste viveiro`}>
          {jaLancado === "fila" ? "Ela ainda está na fila deste celular." : "Ela já foi enviada deste celular."} Toque em Somar para lançar este também, ou corrija o turno.
        </AvisoCampo>
      )}
      {erro && <AvisoCampo tom="perigo">{erro}</AvisoCampo>}
      <RodapeFolha>
        <BotaoGrande type="submit" form={idForm}>{somar ? "Somar ao que já tem" : racaoKg > 0 ? `Salvar ${fmt(racaoKg, 1)} kg` : "Salvar"}</BotaoGrande>
      </RodapeFolha>
    </form>
  );
}
