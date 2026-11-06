"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { ArrowUp, Check, LoaderCircle, Mic, Sparkles, Trash, WifiOff, X } from "lucide-react";
import { useAreaVisivel } from "@/components/area-visivel";
import { avisosAgua, resumoAgua } from "@/lib/agua";
import { CAUSAS_MORTE } from "@/lib/causas-morte";
import { interpretarFala, normalizar, resumoFala } from "@/lib/fala-apontamento";
import { TURNOS } from "@/lib/rotulos";
import { buscarConhecimento, FONTES } from "@/lib/campo/conhecimento-tambaqui";
import { MAX_MENSAGENS, MAX_TEXTO } from "@/lib/campo/contexto-chat";
import { racaoPorTurno, sacosParaKg } from "@/lib/campo/indicadores";
import { cartaoDaFala, itemDoCartao, pendenciaDoCartao, rotuloCartao, type Cartao, type Turno } from "@/lib/campo/propostas";
import type { Tanque } from "@/lib/campo/tipos";
import { TIPOS_INSUMO, type TipoInsumo } from "@/lib/campo/validar";
import { classeReconhecimento, mensagemErroVoz, type Reconhecimento } from "@/lib/reconhecimento-voz";
import { novoId, useCampo } from "./contexto";
import { BotaoGrande, CampoNumero, Escolha, fmt, lerNumero, Passo, Selecao, useDoisToques } from "./pecas";

type CartaoChat = { id: string; cartao: Cartao; estado: "aberto" | "salvo" | "descartado" };
type Mensagem = {
  id: string; papel: "pessoa" | "assistente"; texto: string; criado_em: string;
  cartoes?: CartaoChat[];
  fonte?: "ia" | "celular";   // quem respondeu: a IA do servidor ou a base guardada no celular
  fontes?: string[];          // referências da base de conhecimento
  aviso?: string;             // por que a resposta veio do celular (sem sinal, IA fora do ar)
};
type Resposta = Omit<Mensagem, "id" | "papel" | "criado_em">;

// ---------------------------------------------------------------------------------------------------------------
// A conversa mora no celular (localStorage, com cópia em memória se o armazenamento falhar)
// ---------------------------------------------------------------------------------------------------------------
const EVENTO = "balbina-campo-chat";
const GUARDAR = 40;
const memoria = new Map<string, string>();

function lerBruto(chave: string) {
  const m = memoria.get(chave);
  if (m !== undefined) return m;
  try {
    return localStorage.getItem(chave) ?? "[]";
  } catch {
    return "[]";
  }
}

function assinar(cb: () => void) {
  const deOutraAba = (e: StorageEvent) => {
    if (e.key) memoria.delete(e.key);
    cb();
  };
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", deOutraAba);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener("storage", deOutraAba);
  };
}

function lerMensagens(bruto: string): Mensagem[] {
  try {
    const v = JSON.parse(bruto);
    return Array.isArray(v)
      ? v.filter((m): m is Mensagem => m && typeof m.id === "string" && (m.papel === "pessoa" || m.papel === "assistente") && typeof m.texto === "string")
      : [];
  } catch {
    return [];
  }
}

function useConversa(chave: string) {
  const bruto = useSyncExternalStore(assinar, () => lerBruto(chave), () => "[]");
  const mensagens = useMemo(() => lerMensagens(bruto), [bruto]);
  const mudar = useCallback((f: (m: Mensagem[]) => Mensagem[]) => {
    const valor = JSON.stringify(f(lerMensagens(lerBruto(chave))).slice(-GUARDAR));
    memoria.set(chave, valor);
    try {
      localStorage.setItem(chave, valor);
    } catch {
      /* sem espaço: a conversa fica só nesta tela */
    }
    window.dispatchEvent(new Event(EVENTO));
  }, [chave]);
  const ler = useCallback(() => lerMensagens(lerBruto(chave)), [chave]);
  return { mensagens, mudar, ler };
}

const nada = () => () => undefined;

// ---------------------------------------------------------------------------------------------------------------
// Resposta sem IA: a frase vira cartão pela leitura local e a pergunta é respondida pela base do celular
// ---------------------------------------------------------------------------------------------------------------
const PERGUNTA = /\?|^(qual|quais|quanto|quantos|quanta|quantas|como|quando|onde|por que|porque|pode|posso|devo|o que|e se)\b/;
const OUTRO_LANCAMENTO = [
  { padrao: /\b(biometria|pesei|pesagem|amostra|peso medio)\b/, texto: "Para a biometria, use a aba Biometria: lá a pesagem já vira peso médio, biomassa e ração nova." },
  { padrao: /\b(calagem|calcario|cal|adub\w*|fertiliz\w*|medicament\w*|remedio|vitamina|banho|sal grosso)\b/, texto: "Insumo no viveiro (calagem, adubo, medicamento) se lança na aba Ração, em Insumos." },
  { padrao: /\b(povoei|povoamento|alevinos?|despesca|despesquei|colheita)\b/, texto: "Abrir e fechar lote é pela ficha do viveiro, na aba Viveiros." },
];

function racaoDeHoje(tanques: Tanque[], kgSaco: number): string | null {
  const ocupados = tanques.filter((t) => t.lote?.racao);
  if (!ocupados.length) return null;
  const total = ocupados.reduce((s, t) => s + t.lote!.racao!.kg, 0);
  const linhas = ocupados.map((t) => {
    const r = t.lote!.racao!;
    const turno = racaoPorTurno(r.kg);
    return `${t.nome}: ${fmt(r.kg, 1)} kg/dia${turno !== null ? ` (uns ${fmt(turno, 1)} kg por turno)` : ""}${r.alerta ? `. Atenção: ${r.alerta}` : ""}`;
  });
  return `Ração de hoje pela tabela, pelo peso estimado de cada lote:\n${linhas.join("\n")}\nTotal: ${fmt(total, 1)} kg${kgSaco > 0 ? `, uns ${sacosParaKg(total, kgSaco)} sacos de ${fmt(kgSaco, 1)} kg` : ""}.`;
}

function respostaLocal(pergunta: string, tanques: Tanque[], kgSaco: number): Resposta {
  const t = normalizar(pergunta);
  const ehPergunta = PERGUNTA.test(t);
  const outro = OUTRO_LANCAMENTO.find((o) => o.padrao.test(t));
  const viveiros = tanques.map((x) => ({ id: x.id, rotulo: x.nome }));
  const fala = interpretarFala(pergunta, viveiros, kgSaco);
  const cartao = !outro && !ehPergunta ? cartaoDaFala(fala) : null;
  const partes: string[] = [];
  if (cartao) partes.push(`Entendi: ${resumoFala(fala, viveiros)}. Confira o cartão e confirme.`);
  if (!cartao && outro && !ehPergunta) partes.push(outro.texto);
  const sobreRacao = /\bracao\b/.test(t) && /\b(quant\w*|hoje|dar|tabela|sacos?)\b/.test(t);
  const deHoje = ehPergunta && sobreRacao ? racaoDeHoje(tanques, kgSaco) : null;
  if (deHoje) partes.push(deHoje);
  const topicos = cartao ? [] : buscarConhecimento(pergunta).filter((x) => !(deHoje && x.chave === "arracoamento"));
  for (const x of topicos) partes.push(`${x.titulo}\n${x.texto}`);
  if (!partes.length) {
    partes.push("Não entendi. Escreva como no caderno, por exemplo \"tanque 2, 2 sacos de ração, 3 mortes, oxigênio 4,5\", ou pergunte sobre oxigênio, pH, amônia, ração ou biometria.");
  }
  return {
    texto: partes.join("\n\n"),
    cartoes: cartao ? [{ id: novoId(), cartao, estado: "aberto" }] : undefined,
    fonte: "celular",
    fontes: topicos.length ? [...new Set(topicos.flatMap((x) => x.fontes.map((f) => FONTES[f])))] : undefined,
  };
}

// O que a IA recebe da conversa: o texto de cada mensagem e, nas respostas, os cartões e o que a pessoa fez com eles
function paraIa(m: Mensagem, ctx: Parameters<typeof rotuloCartao>[1]) {
  if (!m.cartoes?.length) return { papel: m.papel, texto: m.texto };
  const estados = { aberto: "esperando a pessoa confirmar", salvo: "confirmado e salvo", descartado: "descartado pela pessoa" };
  const cartoes = m.cartoes.map((c) => `[cartão: ${rotuloCartao(c.cartao, ctx)} · ${estados[c.estado]}]`).join("\n");
  return { papel: m.papel, texto: `${m.texto}\n${cartoes}`.slice(0, MAX_TEXTO) };
}

type Pedido = { resposta: string; cartoes: Cartao[] } | { erro: string; sessao?: boolean; semIa?: boolean };

async function perguntarIa(mensagens: { papel: string; texto: string }[], kgSaco: number): Promise<Pedido> {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 58_000);
  try {
    const resp = await fetch("/api/chat/manejo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagens: mensagens.slice(-MAX_MENSAGENS), kg_saco: kgSaco }),
      signal: controle.signal,
      redirect: "manual",
    });
    if (resp.type === "opaqueredirect" || resp.status === 401) return { erro: "sessão expirada", sessao: true };
    const corpo = (await resp.json().catch(() => ({}))) as { resposta?: unknown; cartoes?: unknown; erro?: string; sem_ia?: boolean };
    if (!resp.ok) return { erro: corpo.erro ?? `erro ${resp.status}`, semIa: corpo.sem_ia === true };
    return { resposta: typeof corpo.resposta === "string" ? corpo.resposta : "", cartoes: Array.isArray(corpo.cartoes) ? (corpo.cartoes as Cartao[]) : [] };
  } catch {
    return { erro: "sem resposta" };
  } finally {
    clearTimeout(limite);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Cartão de confirmação: a pessoa confere, corrige e confirma. Só então o lançamento entra na fila.
// ---------------------------------------------------------------------------------------------------------------
const NOMES_INSUMO: Record<TipoInsumo, string> = {
  calagem: "Calagem", adubacao: "Adubação", medicamento: "Medicamento", banho: "Banho", limpeza: "Limpeza", outro: "Outro",
};
const TITULO_CARTAO = { apontamento: "Lançamento do viveiro", biometria: "Biometria", insumo: "Insumo no viveiro" };

function CartaoProposta({ c, mudar, confirmar, descartar }: {
  c: CartaoChat; mudar: (cartao: Cartao) => void; confirmar: () => void; descartar: () => void;
}) {
  const campo = useCampo();
  const { dados, cartoes: ctx } = campo;
  const k = c.cartao;
  const [kgTexto, setKgTexto] = useState(() => (k.tipo === "apontamento" && k.racao_kg !== null ? fmt(k.racao_kg, 3) : ""));
  const [peixesTexto, setPeixesTexto] = useState(() => (k.tipo === "biometria" && k.peixes ? String(k.peixes) : ""));
  const [pesoTexto, setPesoTexto] = useState(() =>
    k.tipo === "biometria" ? (k.peso_total_g !== null ? fmt(k.peso_total_g / 1000, 3) : k.peso_medio_g !== null ? fmt(k.peso_medio_g, 1) : "") : "");
  const [qtdTexto, setQtdTexto] = useState(() => (k.tipo === "insumo" && k.quantidade !== null ? fmt(k.quantidade, 3) : ""));

  if (c.estado !== "aberto") {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl bg-elevado/60 px-3.5 py-2.5 text-sm">
        {c.estado === "salvo" ? <Check aria-hidden size={16} className="shrink-0 text-positivo" /> : <X aria-hidden size={16} className="shrink-0 text-texto-suave" />}
        <span className={`min-w-0 flex-1 truncate ${c.estado === "descartado" ? "text-texto-suave line-through" : ""}`}>{rotuloCartao(k, ctx)}</span>
        <span className="shrink-0 text-xs text-texto-suave">{c.estado === "salvo" ? "salvo" : "descartado"}</span>
      </div>
    );
  }

  const pendencia = pendenciaDoCartao(k, ctx);
  const tanques = dados.painel.tanques;
  const viveiro = (
    <Selecao rotulo="Viveiro" value={k.viveiro_id ?? ""} onChange={(e) => mudar({ ...k, viveiro_id: e.target.value || null })}>
      <option value="">Escolha o viveiro</option>
      {tanques.map((t) => <option key={t.id} value={t.id}>{t.rotulo}{t.lote ? "" : " · vazio"}</option>)}
    </Selecao>
  );

  let campos: ReactNode = null;
  if (k.tipo === "apontamento") {
    const porSaco = k.sacos !== null && k.racao_kg !== null && k.sacos > 0 ? k.racao_kg / k.sacos : campo.kgSaco;
    const avisos = avisosAgua(k.agua);
    campos = (
      <>
        <Escolha rotulo="Turno" valor={k.turno ?? campo.turno} mudar={(v) => mudar({ ...k, turno: v })}
          opcoes={(Object.keys(TURNOS) as Turno[]).map((t) => ({ valor: t, nome: TURNOS[t] }))} />
        {k.sacos !== null ? (
          <Passo rotulo="Sacos de ração" valor={k.sacos} passo={0.5} unidade={`${fmt(porSaco, 1)} kg`}
            ajuda={k.racao_kg !== null ? `= ${fmt(k.racao_kg, 1)} kg de ração` : undefined}
            mudar={(v) => mudar({ ...k, sacos: v, racao_kg: v > 0 ? Math.round(v * porSaco * 1000) / 1000 : null })} />
        ) : (
          <CampoNumero rotulo="Ração" unidade="kg" value={kgTexto} placeholder="0"
            onChange={(e) => { setKgTexto(e.target.value); mudar({ ...k, racao_kg: lerNumero(e.target.value), sacos: null }); }} />
        )}
        {dados.racoes.length > 0 && (k.racao_kg ?? 0) > 0 && (
          <Selecao rotulo="Ração usada" value={k.racao_produto_id ?? ""} onChange={(e) => mudar({ ...k, racao_produto_id: e.target.value || null })}>
            <option value="">Sem tipo (não baixa do estoque)</option>
            {dados.racoes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </Selecao>
        )}
        <Passo rotulo="Peixes mortos" valor={k.mortes ?? 0} mudar={(v) => mudar({ ...k, mortes: Math.round(v) })} />
        {(k.mortes ?? 0) > 0 && (
          <Selecao rotulo="Causa provável" value={k.causa ?? ""} onChange={(e) => mudar({ ...k, causa: e.target.value || null })}>
            <option value="">Não sei</option>
            {CAUSAS_MORTE.map((x) => <option key={x.chave} value={x.chave}>{x.nome}</option>)}
          </Selecao>
        )}
        {k.agua && <p className="rounded-xl bg-elevado/60 px-3 py-2 text-sm">Água: {resumoAgua(k.agua)}</p>}
        {avisos.map((a) => <p key={a.chave} className={`text-sm font-medium ${a.nivel === "critico" ? "text-perigo" : "text-alerta"}`}>{a.texto}</p>)}
      </>
    );
  } else if (k.tipo === "biometria") {
    const peixes = lerNumero(peixesTexto);
    const medio = k.peso_medio_g ?? (k.peso_total_g !== null && peixes ? k.peso_total_g / peixes : null);
    campos = (
      <>
        <CampoNumero rotulo="Peixes pesados" inputMode="numeric" value={peixesTexto} placeholder="0"
          onChange={(e) => { setPeixesTexto(e.target.value); const n = lerNumero(e.target.value); mudar({ ...k, peixes: n !== null && Number.isInteger(n) && n > 0 ? n : null }); }} />
        {k.peso_medio_g !== null && k.peso_total_g === null ? (
          <CampoNumero rotulo="Peso médio" unidade="g" value={pesoTexto}
            onChange={(e) => { setPesoTexto(e.target.value); mudar({ ...k, peso_medio_g: lerNumero(e.target.value) }); }} />
        ) : (
          <CampoNumero rotulo="Peso total da amostra" unidade="kg" value={pesoTexto}
            onChange={(e) => { setPesoTexto(e.target.value); const kg = lerNumero(e.target.value); mudar({ ...k, peso_total_g: kg !== null && kg > 0 ? Math.round(kg * 10_000) / 10 : null }); }} />
        )}
        {medio !== null && <p className="px-1 text-sm">Peso médio: <span className="font-semibold tabular-nums">{fmt(medio, 0)} g</span></p>}
      </>
    );
  } else {
    const produto = dados.painel.insumos.find((i) => i.id === k.produto_id);
    campos = (
      <>
        <Escolha rotulo="O que foi aplicado" valor={k.insumo_tipo} colunas={3}
          mudar={(v) => mudar({ ...k, insumo_tipo: v, medicamento_id: v === "medicamento" ? k.medicamento_id : null, produto_id: v === "medicamento" ? null : k.produto_id })}
          opcoes={(Object.keys(TIPOS_INSUMO) as TipoInsumo[]).map((t) => ({ valor: t, nome: NOMES_INSUMO[t] }))} />
        {k.insumo_tipo === "medicamento" ? (
          <Selecao rotulo="Medicamento ou vitamina" value={k.medicamento_id ?? ""} onChange={(e) => mudar({ ...k, medicamento_id: e.target.value || null })}>
            <option value="">Escolha</option>
            {dados.medicamentos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </Selecao>
        ) : (
          <>
            <Selecao rotulo="Produto" value={k.produto_id ?? ""} onChange={(e) => mudar({ ...k, produto_id: e.target.value || null })}>
              <option value="">Sem produto</option>
              {dados.painel.insumos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </Selecao>
            {produto && (
              <CampoNumero rotulo="Quantidade" unidade={produto.unidade} value={qtdTexto}
                onChange={(e) => { setQtdTexto(e.target.value); mudar({ ...k, quantidade: lerNumero(e.target.value) }); }} />
            )}
          </>
        )}
      </>
    );
  }

  return (
    <div className="vidro campo-entra flex flex-col gap-3.5 rounded-[1.375rem] p-4">
      <p className="text-xs font-semibold tracking-[0.06em] text-texto-suave uppercase">{TITULO_CARTAO[k.tipo]} · hoje</p>
      {viveiro}
      {campos}
      {pendencia && <p className="text-sm font-medium text-alerta">{pendencia}</p>}
      <div className="flex gap-2">
        <BotaoGrande disabled={pendencia !== null} onClick={confirmar} className="flex-1"><Check size={20} /> Confirmar</BotaoGrande>
        <button type="button" onClick={descartar} aria-label="Descartar este lançamento"
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-elevado text-texto-suave shadow-[inset_0_1px_0_var(--aresta),inset_0_0_0_1px_var(--brilho)] transition-transform duration-150 ease-out active:scale-[0.94]">
          <X size={22} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Aba Chat: texto ou voz vira lançamento (cartão para confirmar) e as dúvidas de manejo são respondidas pela IA
// com a base de conhecimento do tambaqui. Sem sinal (ou sem IA), responde pela base guardada no celular.
// ---------------------------------------------------------------------------------------------------------------
export function ChatCampo({ ativo }: { ativo: boolean }) {
  const campo = useCampo();
  const { dados, online, kgSaco } = campo;
  const { mensagens, mudar, ler } = useConversa(`balbina:campo:chat:${dados.empresa.id}`);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [avisoVoz, setAvisoVoz] = useState<string | null>(null);
  const [limparArmado, tocarLimpar] = useDoisToques();
  const voz = useSyncExternalStore(nada, () => classeReconhecimento() !== undefined, () => false);
  const rec = useRef<Reconhecimento | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const compositor = useRef<HTMLFormElement>(null);
  const area = useAreaVisivel(ativo, compositor);

  useEffect(() => {
    if (!ativo) return;
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fim.current?.scrollIntoView({ block: "end", behavior: reduzido ? "auto" : "smooth" });
  }, [ativo, mensagens.length, pensando]);
  useEffect(() => {
    const ouvinte = rec;
    return () => ouvinte.current?.stop(); // saiu da tela: para de ouvir
  }, []);

  const responder = useCallback((r: Resposta) => {
    mudar((lista) => [...lista, { id: novoId(), papel: "assistente", criado_em: new Date().toISOString(), ...r }]);
  }, [mudar]);

  const enviar = useCallback(async (bruto: string) => {
    const t = bruto.trim().slice(0, MAX_TEXTO);
    if (!t) return;
    setTexto("");
    const minha: Mensagem = { id: novoId(), papel: "pessoa", texto: t, criado_em: new Date().toISOString() };
    const historico = [...ler(), minha];
    mudar((lista) => [...lista, minha]);
    const tanques = dados.painel.tanques;
    if (!dados.ia || !navigator.onLine) {
      responder({ ...respostaLocal(t, tanques, kgSaco), aviso: dados.ia ? "Sem sinal: respondi pela base guardada no celular." : undefined });
      return;
    }
    setPensando(true);
    const r = await perguntarIa(historico.map((m) => paraIa(m, campo.cartoes)), kgSaco);
    setPensando(false);
    if ("resposta" in r) {
      responder({ texto: r.resposta || "Confira os lançamentos abaixo.", fonte: "ia", cartoes: r.cartoes.map((cartao) => ({ id: novoId(), cartao, estado: "aberto" as const })) });
    } else {
      responder({
        ...respostaLocal(t, tanques, kgSaco),
        aviso: r.sessao ? "Sua sessão expirou: entre de novo para usar a IA. Respondi pela base do celular."
          : r.semIa ? undefined : `A IA não respondeu (${r.erro}). Respondi pela base do celular.`,
      });
    }
  }, [campo.cartoes, dados.ia, dados.painel.tanques, kgSaco, ler, mudar, responder]);

  function enviarForm(e: FormEvent) {
    e.preventDefault();
    if (!pensando) void enviar(texto);
  }

  function falar() {
    if (ouvindo) {
      rec.current?.stop();
      return;
    }
    const Classe = classeReconhecimento();
    if (!Classe) return;
    const r = new Classe();
    rec.current = r;
    r.lang = "pt-BR";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const dito = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim();
      if (dito) void enviar(dito);
    };
    r.onerror = (e) => setAvisoVoz(mensagemErroVoz(e.error));
    r.onend = () => setOuvindo(false);
    setAvisoVoz(null);
    setOuvindo(true);
    r.start();
  }

  function mudarCartao(msg: string, cartao: string, f: (c: CartaoChat) => CartaoChat) {
    mudar((lista) => lista.map((m) => (m.id === msg ? { ...m, cartoes: m.cartoes?.map((c) => (c.id === cartao ? f(c) : c)) } : m)));
  }

  function confirmar(msg: string, c: CartaoChat) {
    const item = itemDoCartao(c.cartao, campo.cartoes, { client_id: novoId(), data: campo.hoje, turno: campo.turno, agora: new Date().toISOString() });
    if (campo.salvar(item)) mudarCartao(msg, c.id, (x) => ({ ...x, estado: "salvo" }));
  }

  const exemplo = dados.painel.tanques.find((t) => t.lote)?.nome.toLowerCase() ?? "tanque 1";
  const sugestoes = [
    `Coloquei 2 sacos de ração no ${exemplo}`,
    "Quanto de ração dar hoje?",
    `${exemplo[0].toUpperCase()}${exemplo.slice(1)}: 3 mortes, oxigênio 3,8`,
    "O que fazer com oxigênio baixo de manhã?",
  ];
  const estiloCompositor = area ? { top: area.top + area.height - 8, bottom: "auto", transform: "translateY(-100%)" } : undefined;

  return (
    <div className="flex flex-col gap-4">
      {mensagens.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 pt-6 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-marca-suave text-marca"><Sparkles size={26} /></span>
          <p className="text-lg font-semibold">Conte o que fez no viveiro</p>
          <p className="text-sm text-texto-suave">
            Escreva ou fale. Eu preparo o lançamento e você confirma. Também respondo dúvidas de manejo do tambaqui{dados.ia ? "" : " pela base guardada no celular"}.
          </p>
          <div className="mt-3 flex w-full flex-col gap-2">
            {sugestoes.map((s) => (
              <button key={s} type="button" onClick={() => void enviar(s)}
                className="vidro rounded-2xl px-4 py-3 text-left text-[15px] transition-transform duration-150 ease-out active:scale-[0.98]">
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button type="button" onClick={() => tocarLimpar(() => mudar(() => []))}
            className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${limparArmado ? "bg-perigo/12 text-perigo" : "text-texto-suave"}`}>
            <Trash aria-hidden size={14} /> {limparArmado ? "Toque de novo para limpar" : "Limpar conversa"}
          </button>
        </div>
      )}

      <ol className="flex flex-col gap-3" aria-live="polite">
        {mensagens.map((m) => m.papel === "pessoa" ? (
          <li key={m.id} className="campo-entra max-w-[85%] self-end rounded-[1.25rem] rounded-br-md bg-marca px-4 py-2.5 text-[15px] whitespace-pre-line text-marca-texto">
            {m.texto}
          </li>
        ) : (
          <li key={m.id} className="campo-entra flex flex-col gap-2.5">
            <div className="max-w-[92%] self-start rounded-[1.25rem] rounded-bl-md bg-elevado px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line shadow-[inset_0_0_0_1px_var(--brilho)]">
              {m.texto}
              {m.fontes && <p className="mt-2 text-xs text-texto-suave">Fonte: {m.fontes.join("; ")}.</p>}
              {m.fonte === "celular" && !m.aviso && <p className="mt-2 text-xs text-texto-suave">Resposta da base guardada no celular.</p>}
            </div>
            {m.aviso && <p className="flex items-start gap-1.5 px-1 text-xs text-texto-suave"><WifiOff aria-hidden size={13} className="mt-0.5 shrink-0" />{m.aviso}</p>}
            {m.cartoes?.map((c) => (
              <CartaoProposta key={c.id} c={c}
                mudar={(cartao) => mudarCartao(m.id, c.id, (x) => ({ ...x, cartao }))}
                confirmar={() => confirmar(m.id, c)}
                descartar={() => mudarCartao(m.id, c.id, (x) => ({ ...x, estado: "descartado" }))} />
            ))}
          </li>
        ))}
        {pensando && (
          <li className="flex items-center gap-2 self-start rounded-[1.25rem] rounded-bl-md bg-elevado px-4 py-3 text-sm text-texto-suave">
            <LoaderCircle aria-hidden size={16} className="animate-spin" /> Pensando…
          </li>
        )}
      </ol>
      <div ref={fim} className="h-20" aria-hidden />

      <form ref={compositor} onSubmit={enviarForm} style={estiloCompositor} data-tour="chat"
        className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-lg px-3">
        {(avisoVoz || ouvindo) && (
          <p role="status" className="mx-2 mb-1.5 rounded-xl bg-solido/95 px-3 py-1.5 text-center text-xs text-texto-suave shadow-[var(--sombra-cristal)]">
            {ouvindo ? "Ouvindo… fale o que fez e toque no microfone para parar." : avisoVoz}
          </p>
        )}
        <div className="cristal flex items-end gap-1.5 rounded-[1.6rem] p-1.5 has-[textarea:focus-visible]:outline-[3px] has-[textarea:focus-visible]:outline-marca/30">
          {voz && (
            <button type="button" onClick={falar} aria-pressed={ouvindo} aria-label={ouvindo ? "Parar de ouvir" : "Falar a mensagem"}
              className={`relative grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.92] ${ouvindo ? "bg-perigo text-white" : "bg-elevado text-texto"}`}>
              {ouvindo && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-perigo/40 motion-reduce:hidden" />}
              <Mic size={20} />
            </button>
          )}
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={1} maxLength={MAX_TEXTO} aria-label="Mensagem"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!pensando) void enviar(texto); } }}
            placeholder={online ? "Escreva o que fez ou pergunte" : "Sem sinal: escreva o lançamento"}
            className="field-sizing-content max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-[16px] leading-snug outline-none! placeholder:text-texto-suave/80" />
          <button type="submit" disabled={!texto.trim() || pensando} aria-label="Enviar"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-marca text-marca-texto transition-[transform,opacity] duration-150 ease-out active:scale-[0.92] disabled:opacity-40">
            {pensando ? <LoaderCircle size={20} className="animate-spin" /> : <ArrowUp size={20} strokeWidth={2.4} />}
          </button>
        </div>
      </form>
    </div>
  );
}
