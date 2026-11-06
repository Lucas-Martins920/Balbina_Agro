"use client";

import { useId, useRef, useState, useTransition, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { cadastrarRapido, type TipoRapido } from "@/app/(app)/_cadastro-rapido/actions";
import { CLASSE_CONTROLE, Selecao } from "@/components/ui";

const NOME: Record<TipoRapido, string> = { produto: "produto", deposito: "depósito", fornecedor: "fornecedor", cliente: "cliente" };

// Lista de escolha com "+ Novo": cadastra ali mesmo, sem sair do lançamento, e já deixa o novo escolhido.
// Os campos do cadastro rápido não têm `name` (não vão junto com o formulário de fora) e o Enter neles cria
// em vez de enviar o lançamento.
export function SelecaoComNovo({
  novo,
  subtipos,
  subtipoPadrao,
  nomeSugerido,
  documentoSugerido,
  aoMudar,
  defaultValue,
  children,
  ...props
}: Omit<ComponentProps<typeof Selecao>, "value" | "onChange"> & {
  novo: TipoRapido;
  // para produto e depósito: os tipos que o cadastro rápido oferece
  subtipos?: Record<string, string>;
  subtipoPadrao?: string;
  // fornecedor/cliente que ainda não tem cadastro (ex.: nome do extrato na conciliação): sugere o cadastro
  // rápido já preenchido, como o balão do NIBO
  nomeSugerido?: string;
  documentoSugerido?: string | null;
  aoMudar?: (id: string) => void;
  children: ReactNode;
}) {
  const [valor, setValorInterno] = useState(String(defaultValue ?? ""));
  const [criados, setCriados] = useState<{ id: string; nome: string }[]>([]);
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(nomeSugerido ?? "");
  const [documento, setDocumento] = useState(documentoSugerido ?? "");
  const contato = novo === "fornecedor" || novo === "cliente";
  function setValor(id: string) {
    setValorInterno(id);
    aoMudar?.(id);
  }
  const [subtipo, setSubtipo] = useState(subtipoPadrao ?? Object.keys(subtipos ?? {})[0] ?? "");
  const [erro, setErro] = useState("");
  const [criando, iniciar] = useTransition();
  const idNome = useId();
  const refNome = useRef<HTMLInputElement>(null);

  function criar() {
    setErro("");
    iniciar(async () => {
      const r = await cadastrarRapido(novo, nome, subtipo || undefined, contato ? documento : undefined);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setCriados((c) => [...c, r]);
      setValor(r.id);
      setNome("");
      setDocumento("");
      setAberto(false);
    });
  }
  function tecla(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      criar();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setAberto(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Selecao {...props} value={valor} onChange={(e) => setValor(e.target.value)}>
        {children}
        {criados.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </Selecao>
      {aberto ? (
        <div className="flex flex-col gap-2 rounded-xl border border-borda bg-elevado/80 p-3 shadow-lg">
          <label htmlFor={idNome} className="text-xs font-medium text-texto-suave">Novo {NOME[novo]}</label>
          <div className="flex flex-wrap gap-2">
            <input ref={refNome} id={idNome} value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={tecla} autoFocus
              placeholder="Nome" className={`h-9 min-w-0 flex-1 ${CLASSE_CONTROLE}`} />
            {contato && (
              <input aria-label="CPF ou CNPJ (opcional)" value={documento} onChange={(e) => setDocumento(e.target.value)} onKeyDown={tecla}
                inputMode="numeric" placeholder="CPF ou CNPJ (opcional)" className={`h-9 w-44 ${CLASSE_CONTROLE}`} />
            )}
            {subtipos && (
              <select aria-label="Tipo" value={subtipo} onChange={(e) => setSubtipo(e.target.value)} onKeyDown={tecla} className={`h-9 ${CLASSE_CONTROLE}`}>
                {Object.entries(subtipos).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            )}
          </div>
          {erro && <p role="alert" className="text-xs text-perigo">{erro}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={criar} disabled={criando || !nome.trim()}
              className="h-8 rounded-full bg-marca/90 px-3 text-xs font-medium text-marca-texto transition-transform duration-150 active:scale-[0.95] disabled:opacity-50">
              {criando ? "Criando…" : "Criar e escolher"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="h-8 rounded-full px-3 text-xs font-medium text-texto-suave hover:text-texto">Cancelar</button>
          </div>
          <p className="text-xs text-texto-suave">Só o nome agora; o resto do cadastro você completa depois.</p>
        </div>
      ) : nomeSugerido && !valor ? (
        <button type="button" onClick={() => setAberto(true)}
          className="inline-flex items-center gap-1 self-start rounded-full border border-marca/40 bg-marca-suave/60 px-2.5 py-1 text-left text-xs font-medium transition-colors duration-150 hover:bg-marca-suave">
          <Plus size={13} strokeWidth={2} aria-hidden /> {NOME[novo].charAt(0).toUpperCase() + NOME[novo].slice(1)} sem cadastro: cadastrar “{nomeSugerido}”
        </button>
      ) : (
        <button type="button" onClick={() => setAberto(true)}
          className="inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-xs font-medium text-texto-suave transition-colors duration-150 hover:bg-elevado hover:text-texto">
          <Plus size={13} strokeWidth={2} aria-hidden /> Novo {NOME[novo]}
        </button>
      )}
    </div>
  );
}
