"use client";

import { createPortal } from "react-dom";
import { createContext, useActionState, useCallback, useContext, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Pencil, Plus, Search, X } from "lucide-react";
import type { EstadoAcao } from "@/lib/acao";
import { semAcento } from "@/lib/formato";
import { Aviso, Botao, CLASSE_CONTROLE, Vazio } from "@/components/ui";
import { RotulosCelular } from "@/components/tabela-celular";
import { telaDeToque, useAreaVisivel } from "@/components/area-visivel";
import { alternarSelecao, alternarTodos } from "@/lib/selecao-lote";

// Telas de cadastro no jeito do NIBO: lista com busca, clique na linha abre o painel lateral para editar,
// "Novo" abre o mesmo painel vazio. O painel fecha sozinho quando a ação salva e mostra um aviso curto.

type Acao = (estado: EstadoAcao, form: FormData) => Promise<EstadoAcao>;

export const PainelContexto = createContext<{ fechar: (aviso?: string) => void }>({ fechar: () => {} });

// Fecha o painel lateral aberto pela lista, com um aviso curto opcional (para conteúdo de painel que não é FormPainel).
export function useFecharPainel() {
  return useContext(PainelContexto).fechar;
}

export type LinhaCadastro = {
  id: string;
  busca: string;
  celulas: ReactNode[];
  // linha só de leitura numa lista que edita as outras
  fixa?: boolean;
  secao?: string;
  inativa?: boolean;
  // valor de cada coluna para ordenar ao clicar no cabeçalho (mesma ordem de `colunas`); sem ele a coluna não ordena
  ordem?: (string | number | null)[];
  // com `emLote` na lista, a linha ganha caixa de seleção; false deixa a linha fora da seleção
  selecionavel?: boolean;
  // nome da linha para o leitor de tela na caixa de seleção (padrão: o texto de busca)
  rotulo?: string;
};

// Ações em várias linhas de uma vez: caixa de seleção por linha, "selecionar todos" (o que a busca e o filtro mostram)
// e uma barra no rodapé com os botões. `acoes` recebe as linhas marcadas e `concluir`, que limpa a seleção e mostra o aviso.
export type EmLote = {
  nome: [singular: string, plural: string];
  acoes: (ids: string[], concluir: (aviso?: string) => void) => ReactNode;
};

// Atalho na própria linha (ex.: Entrada, Saída): abre a gaveta direto no que importa, sem passar pelo cadastro.
export type AcaoRapida = { rotulo: string; icone: ReactNode; painel: { titulo: string; conteudo: ReactNode } };

type Aberto = { chave: string; titulo: string; conteudo: ReactNode };

export function ListaCadastro({
  colunas,
  direita = [],
  linhas,
  editar,
  novo,
  rotuloNovo = "Novo",
  buscaPlaceholder = "Buscar",
  vazio = "Nada cadastrado ainda.",
  filtros,
  rodape,
  rapidas,
  emLote,
}: {
  colunas: string[];
  direita?: string[];
  linhas: LinhaCadastro[];
  // Painel de edição da linha; sem ele (usuário sem permissão) a linha não abre nada.
  editar?: (id: string) => { titulo: string; conteudo: ReactNode } | null;
  novo?: { titulo: string; conteudo: ReactNode } | null;
  rotuloNovo?: string;
  buscaPlaceholder?: string;
  vazio?: string;
  filtros?: ReactNode;
  rodape?: ReactNode;
  rapidas?: (id: string) => AcaoRapida[];
  emLote?: EmLote;
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [aviso, setAviso] = useAvisoCurto();
  const idBusca = useId();

  const [ordem, setOrdem] = useState<{ coluna: number; sobe: boolean } | null>(null);
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());

  const termo = semAcento(busca);
  const achadas = termo ? linhas.filter((l) => semAcento(l.busca).includes(termo)) : linhas;
  const ordenadas = ordem ? ordenarLinhas(achadas, ordem.coluna, ordem.sobe) : achadas;
  const porSecao = new Map<string, number>();
  for (const l of ordenadas) if (l.secao) porSecao.set(l.secao, (porSecao.get(l.secao) ?? 0) + 1);
  const ordenavel = linhas.some((l) => l.ordem);
  const colunasExtras = (editar ? 1 : 0) + (rapidas ? 1 : 0) + (emLote ? 1 : 0);

  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const marcaveis = emLote ? achadas.filter((l) => l.selecionavel !== false).map((l) => l.id) : [];
  // só conta o que está na tela: trocar de filtro ou buscar não leva junto linha escondida
  const selecionados = marcaveis.filter((id) => selecao.has(id));
  const todosMarcados = marcaveis.length > 0 && selecionados.length === marcaveis.length;
  const concluirLote = useCallback((mensagem?: string) => {
    setSelecao(new Set());
    if (mensagem) setAviso(mensagem);
  }, [setAviso]);

  function alternarOrdem(coluna: number) {
    setOrdem((o) => (o?.coluna !== coluna ? { coluna, sobe: true } : o.sobe ? { coluna, sobe: false } : null));
  }
  function alternarSecao(secao: string) {
    setRecolhidas((r) => {
      const nova = new Set(r);
      if (nova.has(secao)) nova.delete(secao);
      else nova.add(secao);
      return nova;
    });
  }

  function abrir(chave: string, painel: { titulo: string; conteudo: ReactNode } | null | undefined) {
    if (!painel) return;
    setAberto({ chave, ...painel });
    setVisivel(true);
  }

  const fechar = useCallback((mensagem?: string) => {
    setVisivel(false);
    if (mensagem) setAviso(mensagem);
  }, [setAviso]);
  const fecharSemAviso = useCallback(() => fechar(), [fechar]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={idBusca} data-tour="busca" className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar</span>
          <Search size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-texto-suave" />
          <input
            id={idBusca}
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={buscaPlaceholder}
            className={`h-10 w-full pl-9 ${CLASSE_CONTROLE}`}
          />
        </label>
        {filtros}
        {novo && (
          <Botao type="button" data-tour="novo" onClick={() => abrir("novo", novo)} className="ml-auto">
            <Plus size={16} strokeWidth={1.75} aria-hidden /> {rotuloNovo}
          </Botao>
        )}
      </div>

      {ordenadas.length === 0 ? (
        <Vazio>{termo ? `Nada encontrado para “${busca.trim()}”.` : vazio}</Vazio>
      ) : (
        <div data-tour="lista" className="tabela-cartoes relative vidro overflow-x-auto rounded-2xl border border-borda">
          <RotulosCelular principal={emLote ? 1 : 0} />
          <table className="w-full text-sm">
            <thead className="border-b border-linha text-left text-[13px] text-texto-suave">
              <tr>
                {emLote && (
                  <th scope="col" className="w-10 pl-4">
                    <input type="checkbox" aria-label={`Selecionar todos os ${emLote.nome[1]}`} checked={todosMarcados} disabled={marcaveis.length === 0}
                      onChange={() => setSelecao((s) => alternarTodos(s, marcaveis))} className="size-4 accent-[var(--marca)]" />
                  </th>
                )}
                {colunas.map((c, i) => {
                  const ativa = ordem?.coluna === i;
                  return (
                    <th key={c} scope="col" aria-sort={ativa ? (ordem.sobe ? "ascending" : "descending") : undefined}
                      className={`h-10 whitespace-nowrap px-4 font-medium ${direita.includes(c) ? "text-right" : ""}`}>
                      {ordenavel && c ? (
                        <button type="button" onClick={() => alternarOrdem(i)}
                          className={`-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors duration-150 hover:text-texto ${ativa ? "text-texto" : ""}`}>
                          {c}
                          {ativa ? (ordem.sobe ? <ChevronUp size={13} strokeWidth={2} aria-hidden /> : <ChevronDown size={13} strokeWidth={2} aria-hidden />)
                            : <ChevronsUpDown size={13} strokeWidth={1.75} aria-hidden className="opacity-40" />}
                        </button>
                      ) : c}
                    </th>
                  );
                })}
                {rapidas && <th scope="col" className="w-0"><span className="sr-only">Atalhos</span></th>}
                {editar && <th scope="col" className="w-10"><span className="sr-only">Editar</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {ordenadas.map((l, i) => {
                const cabecalhoSecao = l.secao && l.secao !== ordenadas[i - 1]?.secao;
                const recolhida = Boolean(l.secao && recolhidas.has(l.secao));
                const atalhos = rapidas && !l.fixa ? rapidas(l.id) : [];
                const clicavel = Boolean(editar) && !l.fixa;
                const marcado = emLote ? selecao.has(l.id) : false;
                return [
                  cabecalhoSecao && <CabecalhoSecao key={`secao-${l.secao}`} secao={l.secao!} total={porSecao.get(l.secao!) ?? 0}
                    recolhida={recolhida} colunas={colunas.length + colunasExtras} aoAlternar={alternarSecao} />,
                  !recolhida && (
                  <tr
                    key={l.id}
                    onClick={clicavel ? () => abrir(l.id, editar?.(l.id)) : undefined}
                    className={`group transition-colors duration-150 ${clicavel ? "cursor-pointer hover:bg-elevado/50" : ""} ${marcado ? "bg-marca/10" : ""} ${l.inativa ? "text-texto-suave" : ""}`}
                  >
                    {emLote && (
                      <td className="pl-4" onClick={(e) => e.stopPropagation()}>
                        {l.selecionavel !== false && (
                          <input type="checkbox" aria-label={`Selecionar ${l.rotulo ?? l.busca}`} checked={marcado}
                            onChange={() => setSelecao((s) => alternarSelecao(s, l.id))} className="size-4 accent-[var(--marca)]" />
                        )}
                      </td>
                    )}
                    {l.celulas.map((c, i) => (
                      <td key={i} className={`px-4 py-2.5 ${direita.includes(colunas[i]) ? "text-right tabular-nums" : ""}`}>{c}</td>
                    ))}
                    {rapidas && (
                      <td className="px-1 py-1.5 text-right">
                        <span className="inline-flex gap-1 whitespace-nowrap transition-opacity duration-150 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                          {atalhos.map((a) => (
                            <button key={a.rotulo} type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrir(`${l.id}-${a.rotulo}`, a.painel);
                              }}
                              className="inline-flex h-8 items-center gap-1 rounded-full bg-elevado px-2.5 text-xs font-medium text-texto shadow-[inset_0_1px_0_var(--aresta),inset_0_0_0_1px_var(--brilho)] transition-[background-color,transform] duration-150 hover:bg-solido/80 active:scale-[0.95]">
                              {a.icone} {a.rotulo}
                            </button>
                          ))}
                        </span>
                      </td>
                    )}
                    {editar && (
                      <td className="px-2 py-1.5 text-right">
                        {clicavel && <button
                          type="button"
                          aria-label="Editar"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrir(l.id, editar(l.id));
                          }}
                          className="grid size-8 place-items-center rounded-md text-texto-suave transition-[background-color,transform] duration-150 hover:bg-elevado hover:text-texto active:scale-[0.94]"
                        >
                          <Pencil size={15} strokeWidth={1.75} aria-hidden />
                        </button>}
                      </td>
                    )}
                  </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-texto-suave">
        <span>{termo ? `${achadas.length} de ${linhas.length}` : `${linhas.length} ${linhas.length === 1 ? "cadastro" : "cadastros"}`}</span>
        {rodape}
      </div>

      {emLote && selecionados.length > 0 && createPortal(
        <div role="region" aria-label={`Ações nos ${emLote.nome[1]} selecionados`}
          className="popover fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-[1.75rem] border border-borda cristal bg-solido/80 px-4 py-2.5 shadow-[var(--sombra)] md:bottom-6">
          <span className="mr-auto text-sm">
            <span className="font-semibold tabular-nums">{selecionados.length}</span> {selecionados.length === 1 ? `${emLote.nome[0]} selecionado` : `${emLote.nome[1]} selecionados`}
          </span>
          {emLote.acoes(selecionados, concluirLote)}
          <button type="button" aria-label="Limpar seleção" onClick={() => setSelecao(new Set())}
            className="grid size-8 place-items-center rounded-full bg-texto/[0.06] text-texto-suave transition-[background-color,transform] duration-150 hover:bg-texto/10 hover:text-texto active:scale-[0.94]">
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>,
        document.body,
      )}

      <PainelContexto.Provider value={{ fechar }}>
        <PainelLateral aberto={visivel} titulo={aberto?.titulo ?? ""} aoFechar={fecharSemAviso}>
          {/* a chave remonta o formulário ao trocar de cadastro, sem sobrar valor do anterior */}
          {aberto && <div key={`${aberto.chave}-${visivel}`} className="flex min-h-0 flex-1 flex-col">{aberto.conteudo}</div>}
        </PainelLateral>
      </PainelContexto.Provider>

      <AvisoFlutuante aviso={aviso} />
    </div>
  );
}

// Botão da barra de ações em lote: pede confirmação na própria barra antes de rodar a ação nas linhas marcadas.
// Use `oculto` em vez de não renderizar: a resposta da ação chega junto com a lista atualizada, e um botão que sai da
// tela nesse instante não chega a avisar o fim (a seleção não seria limpa).
export function BotaoLote({ acao, campos, rotulo, confirmar, variante = "secundario", aoConcluir, oculto = false }: {
  acao: Acao;
  campos: Record<string, string | string[]>;
  rotulo: string;
  confirmar: string;
  variante?: "primario" | "secundario" | "perigo";
  aoConcluir: (aviso?: string) => void;
  oculto?: boolean;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => {
    if (estado.versao) aoConcluir(estado.ok);
  }, [estado.versao]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={enviar} hidden={oculto && !pendente} className="flex flex-wrap items-center gap-2">
      {Object.entries(campos).flatMap(([nome, valor]) =>
        (Array.isArray(valor) ? valor : [valor]).map((v, i) => <input key={`${nome}-${i}`} type="hidden" name={nome} value={v} />))}
      {estado.erro && <span role="alert" className="text-sm text-perigo">{estado.erro}</span>}
      {confirmando ? (
        <>
          <span className="text-sm">{confirmar}</span>
          <Botao type="button" variante="fantasma" tamanho="sm" onClick={() => setConfirmando(false)}>Voltar</Botao>
          <Botao type="submit" variante={variante} tamanho="sm" disabled={pendente}>
            {pendente ? "Aguarde…" : "Confirmar"}
          </Botao>
        </>
      ) : (
        <Botao type="button" variante={variante} tamanho="sm" disabled={pendente} onClick={() => setConfirmando(true)}>
          {pendente ? "Aguarde…" : rotulo}
        </Botao>
      )}
    </form>
  );
}

// Aviso curto no canto de baixo depois de salvar pelo painel.
export function AvisoFlutuante({ aviso }: { aviso: string }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60]">
      {aviso && (
        <p className="popover rounded-xl border border-borda bg-solido px-4 py-2.5 text-sm shadow-[var(--sombra)]">{aviso}</p>
      )}
    </div>
  );
}

// Aviso que some sozinho em 3,5 s.
export function useAvisoCurto() {
  const [aviso, setAviso] = useState("");
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 3500);
    return () => clearTimeout(t);
  }, [aviso]);
  return [aviso, setAviso] as const;
}

// Ordena as linhas pela coluna escolhida, mantendo as seções juntas (números antes de texto, vazios no fim).
function ordenarLinhas(linhas: LinhaCadastro[], coluna: number, sobe: boolean) {
  const sinal = sobe ? 1 : -1;
  return [...linhas].sort((a, b) => {
    if ((a.secao ?? "") !== (b.secao ?? "")) return 0;
    const x = a.ordem?.[coluna] ?? null;
    const y = b.ordem?.[coluna] ?? null;
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * sinal;
    return String(x).localeCompare(String(y), "pt-BR", { numeric: true }) * sinal;
  });
}

// Cabeçalho de grupo: clicar recolhe ou abre o grupo; mostra quantos itens tem.
function CabecalhoSecao({ secao, total, recolhida, colunas, aoAlternar }: { secao: string; total: number; recolhida: boolean; colunas: number; aoAlternar: (s: string) => void }) {
  return (
    <tr className="bg-elevado/40">
      <th colSpan={colunas} scope="colgroup" className="p-0 text-left text-xs font-medium text-texto-suave">
        <button type="button" aria-expanded={!recolhida} onClick={() => aoAlternar(secao)}
          className="flex w-full items-center gap-1.5 px-4 py-1.5 transition-colors duration-150 hover:text-texto">
          <ChevronDown size={14} strokeWidth={2} aria-hidden className={`transition-transform duration-150 ${recolhida ? "-rotate-90" : ""}`} />
          <span className="uppercase tracking-wide">{secao}</span>
          <span className="rounded-full bg-elevado px-1.5 tabular-nums">{total}</span>
        </button>
      </th>
    </tr>
  );
}

// Gaveta que entra pela direita, por cima de um véu. Esc ou clique no véu fecham.
export function PainelLateral({ aberto, titulo, aoFechar, children }: { aberto: boolean; titulo: string; aoFechar: () => void; children: ReactNode }) {
  const idTitulo = useId();
  const ref = useRef<HTMLElement>(null);
  const area = useAreaVisivel(aberto, ref);

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    // no celular o foco vai para a gaveta, não para o primeiro campo: senão o teclado sobe e cobre o formulário.
    // Quem já entrou num campo nesses 60 ms continua nele (o foco não volta para o primeiro campo no meio da digitação).
    const t = setTimeout(() => {
      if (ref.current?.contains(document.activeElement)) return;
      (telaDeToque() ? ref.current : ref.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea"))?.focus({ preventScroll: true });
    }, 60);
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = "";
      anterior?.focus?.();
    };
  }, [aberto, aoFechar]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={idTitulo} inert={!aberto} className={`fixed inset-0 z-50 overflow-hidden ${aberto ? "" : "pointer-events-none"}`}
      style={area ? { top: area.top, height: area.height, bottom: "auto" } : undefined}>
      <div
        aria-hidden
        onClick={aoFechar}
        className={`absolute inset-0 bg-black/20 backdrop-blur-[3px] transition-opacity duration-300 ease-out ${aberto ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        ref={ref}
        tabIndex={-1}
        className={`absolute inset-y-2 outline-none right-2 flex w-[min(32rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-[2rem] border border-borda cristal bg-solido/75 transition-[transform,opacity] duration-300 ease-drawer ${
          aberto ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
        }`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-linha px-5 py-3.5">
          <h2 id={idTitulo} className="truncate text-[17px] font-semibold tracking-[-0.015em]">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="-mr-2 grid size-8 place-items-center rounded-full bg-texto/[0.06] text-texto-suave transition-[background-color,transform] duration-150 hover:bg-texto/10 hover:text-texto active:scale-[0.94]"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}

// Formulário do painel: campos rolam, rodapé fixo com salvar, cancelar e excluir com confirmação.
export function FormPainel({
  acao,
  excluir,
  children,
  botao = "Salvar",
  confirmacao = "Excluir este cadastro? Não dá para desfazer.",
  somenteLeitura = false,
}: {
  acao: Acao;
  excluir?: Acao;
  children: ReactNode;
  botao?: string;
  confirmacao?: string;
  somenteLeitura?: boolean;
}) {
  const { fechar } = useContext(PainelContexto);
  const [estado, enviar, salvando] = useActionState<EstadoAcao, FormData>(acao, {});
  const [estadoExcluir, enviarExcluir, excluindo] = useActionState<EstadoAcao, FormData>(excluir ?? (async () => ({})), {});
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (estado.versao) fechar(estado.ok);
  }, [estado.versao]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (estadoExcluir.versao) fechar(estadoExcluir.ok);
  }, [estadoExcluir.versao]); // eslint-disable-line react-hooks/exhaustive-deps

  const erro = estado.erro ?? estadoExcluir.erro;

  return (
    <form action={enviar} className="flex min-h-0 flex-1 flex-col">
      <fieldset disabled={somenteLeitura} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {children}
      </fieldset>
      <footer className="flex flex-col gap-3 border-t border-linha px-5 py-3">
        {erro && <Aviso>{erro}</Aviso>}
        {confirmando ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm">{confirmacao}</p>
            <Botao type="button" variante="fantasma" tamanho="sm" onClick={() => setConfirmando(false)}>Voltar</Botao>
            <Botao type="submit" variante="perigo" tamanho="sm" formAction={enviarExcluir} formNoValidate disabled={excluindo}>
              {excluindo ? "Excluindo…" : "Sim, excluir"}
            </Botao>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {!somenteLeitura && (
              <Botao type="submit" disabled={salvando}>{salvando ? "Salvando…" : botao}</Botao>
            )}
            <Botao type="button" variante="fantasma" onClick={() => fechar()}>{somenteLeitura ? "Fechar" : "Cancelar"}</Botao>
            {excluir && !somenteLeitura && (
              <Botao type="button" variante="perigo" tamanho="sm" className="ml-auto" onClick={() => setConfirmando(true)}>Excluir</Botao>
            )}
          </div>
        )}
      </footer>
    </form>
  );
}

// Título pequeno que separa blocos de campos dentro do painel.
export function SecaoForm({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium tracking-wide text-texto-suave uppercase">{titulo}</h3>
      {children}
    </section>
  );
}

export function Marcar({ rotulo, ajuda, ...props }: ComponentProps<"input"> & { rotulo: string; ajuda?: string }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--marca)]" {...props} />
      <span className="flex flex-col">
        <span>{rotulo}</span>
        {ajuda && <span className="text-xs text-texto-suave">{ajuda}</span>}
      </span>
    </label>
  );
}

// Abas que filtram a lista na hora, sem trocar de página (mesmo visual de Segmentos).
export function AbasFiltro<T extends string>({ opcoes, valor, aoMudar, rotulo }: { opcoes: { valor: T; nome: ReactNode }[]; valor: T; aoMudar: (v: T) => void; rotulo: string }) {
  return (
    <div role="group" aria-label={rotulo} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-elevado p-1 text-[13px] shadow-[inset_0_1px_0_var(--aresta),inset_0_0_0_1px_var(--brilho)]">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={o.valor === valor}
          onClick={() => aoMudar(o.valor)}
          className={`rounded-full px-3.5 py-1 font-medium transition-colors duration-150 ${
            o.valor === valor ? "bg-solido/90 text-texto shadow-[inset_0_1px_0_var(--aresta),0_2px_10px_-2px_rgb(0_0_0/0.18)]" : "text-texto-suave hover:text-texto"
          }`}
        >
          {o.nome}
        </button>
      ))}
    </div>
  );
}
