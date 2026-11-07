"use client";

import "driver.js/dist/driver.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Driver, DriveStep } from "driver.js";
import { BookOpen, ChevronDown, CircleHelp, Compass, RotateCcw, Search, Sparkles, X } from "lucide-react";
import {
  buscarDuvidas,
  passosPermitidos,
  podeVerTutorial,
  TOUR_GERAL,
  tutorialDaTela,
  TUTORIAIS_DESLIGADOS,
  type Tutorial as TipoTutorial,
} from "@/lib/tutoriais";
import { marcarTutoriais, refazerTutoriais, tutorialAutomatico } from "@/lib/tutoriais-acoes";
import { CLASSE_CONTROLE, classeBotao } from "@/components/ui";

// Balões guiados de cada tela (Driver.js) e o botão fixo de ajuda, que tira dúvidas e refaz os tutoriais.
// O "já viu" fica no banco (por pessoa, vale em qualquer aparelho) e no navegador, para o app de campo sem sinal.

type Props = {
  usuario: string;
  vistos: string[];
  permitidas: string[];
  master?: boolean;
  // O tour de boas-vindas (menu, empresa, aparência) só faz sentido dentro do app com menu.
  comGeral?: boolean;
  // false: a tela põe o próprio botão de ajuda (o app de campo, no topo, porque o rodapé é das abas) e abre o
  // painel com alternarAjuda().
  botaoFlutuante?: boolean;
};

const EVENTO_AJUDA = "balbina:ajuda";

// Abre ou fecha o painel de ajuda a partir de um botão da própria tela.
export function alternarAjuda() {
  document.dispatchEvent(new Event(EVENTO_AJUDA));
}

const chaveLocal = (usuario: string) => `balbina-tutoriais-${usuario}`;

function lerLocal(usuario: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(chaveLocal(usuario)) ?? "[]");
  } catch {
    return [];
  }
}

function gravarLocal(usuario: string, vistos: Set<string>) {
  try {
    localStorage.setItem(chaveLocal(usuario), JSON.stringify([...vistos]));
  } catch {
    // navegador sem armazenamento: o banco ainda guarda
  }
}

function visivel(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement) || el.closest("[inert]")) return false;
  if (el.getClientRects().length === 0) return false;
  return getComputedStyle(el).visibility !== "hidden";
}

function acharAlvo(alvo: string | string[]): HTMLElement | null {
  for (const seletor of Array.isArray(alvo) ? alvo : [alvo]) {
    const achado = [...document.querySelectorAll(seletor)].find(visivel);
    if (achado) return achado;
  }
  return null;
}

// Passos com o elemento na tela agora; o que não está (outra versão, sem permissão, lista vazia) fica de fora.
function montarPassos(tutorial: TipoTutorial, permitidas: ReadonlySet<string>): DriveStep[] {
  return passosPermitidos(tutorial, permitidas).flatMap((p) => {
    const popover = { title: p.titulo, description: p.texto };
    if (!p.alvo) return [{ popover }];
    const el = acharAlvo(p.alvo);
    return el ? [{ element: el, popover }] : [];
  });
}

const reduzMovimento = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Tutorial({ usuario, vistos: vistosServidor, permitidas: lista, master = false, comGeral = true, botaoFlutuante = true }: Props) {
  const caminho = usePathname();
  const permitidas = useMemo(() => new Set(lista), [lista]);
  const vistos = useRef<Set<string>>(new Set(vistosServidor));
  const [automatico, setAutomatico] = useState(!vistosServidor.includes(TUTORIAIS_DESLIGADOS));
  const [aberto, setAberto] = useState(false);
  // Muda quando a pessoa pede "refazer todos": o efeito abaixo roda de novo e mostra os tours desta tela.
  const [rodada, setRodada] = useState(0);
  const ativo = useRef<Driver | null>(null);

  const tutorialAtual = useMemo(() => {
    const tu = tutorialDaTela(caminho);
    return tu && podeVerTutorial(tu, permitidas) ? tu : undefined;
  }, [caminho, permitidas]);

  // Junta o que o navegador já sabia (lançado sem sinal) e manda ao banco o que faltava lá.
  useEffect(() => {
    const locais = lerLocal(usuario);
    const faltam = locais.filter((t) => !vistosServidor.includes(t));
    locais.forEach((t) => vistos.current.add(t));
    if (vistos.current.has(TUTORIAIS_DESLIGADOS)) setAutomatico(false);
    if (faltam.length) marcarTutoriais(faltam).catch(() => {});
  }, [usuario, vistosServidor]);

  const marcar = useCallback(
    (telas: string[]) => {
      telas.forEach((t) => vistos.current.add(t));
      gravarLocal(usuario, vistos.current);
      marcarTutoriais(telas).catch(() => {});
    },
    [usuario],
  );

  const rodar = useCallback(
    async (fila: TipoTutorial[], auto: boolean) => {
      // driver.js só é baixado quando um tour vai rodar, e não no carregamento de toda tela.
      const { driver } = await import("driver.js");
      // Um tutorial atrás do outro: o seguinte só começa se a pessoa terminou o anterior.
      const proximo = (i: number) => {
        const tutorial = fila[i];
        if (!tutorial) return;
        const resto = fila.slice(i + 1);
        const passos = montarPassos(tutorial, permitidas);
        if (passos.length === 0) {
          if (auto) marcar([tutorial.tela]);
          proximo(i + 1);
          return;
        }
        ativo.current?.destroy();
        let pulou = false;
        const d = driver({
          steps: passos,
          animate: !reduzMovimento(),
          smoothScroll: !reduzMovimento(),
          showProgress: passos.length > 1,
          progressText: "{{current}} de {{total}}",
          nextBtnText: "Próximo",
          prevBtnText: "Voltar",
          doneBtnText: resto.length ? "Continuar" : "Entendi",
          closeBtnLabel: "Fechar tutorial",
          popoverClass: "balbina-tour",
          overlayColor: "rgb(12 10 8)",
          overlayOpacity: 0.62,
          stagePadding: 6,
          stageRadius: 16,
          popoverOffset: 12,
          overlayClickBehavior: "none",
          disableActiveInteraction: true,
          onPopoverRender: (popover, { state }) => {
            // Rótulo com o nome do tour em cima do título e "Pular" no rodapé, à esquerda.
            const rotulo = document.createElement("span");
            rotulo.className = "balbina-tour-rotulo";
            rotulo.textContent = tutorial.nome;
            popover.title.before(rotulo);
            if (state.activeIndex === passos.length - 1) return;
            const pular = document.createElement("button");
            pular.type = "button";
            pular.className = "balbina-tour-pular";
            pular.textContent = "Pular";
            pular.addEventListener("click", () => {
              pulou = true;
              d.destroy();
            });
            popover.footer.prepend(pular);
          },
          onDestroyed: (_el, _passo, { reason }) => {
            if (ativo.current === d) ativo.current = null;
            // Saída pelo próprio app (troca de tela) não conta como visto.
            if ((reason === "api" && !pulou) || reason === "replaced") return;
            if (auto) marcar([tutorial.tela]);
            if (reason === "done" && resto.length) setTimeout(() => proximo(i + 1), 250);
          },
        });
        ativo.current = d;
        d.drive();
      };
      proximo(0);
    },
    [marcar, permitidas],
  );

  // Primeira vez na tela: espera a entrada da página assentar e mostra o tour dela (e o de boas-vindas antes).
  useEffect(() => {
    // Robôs de teste (Playwright) não recebem o tour automático; pela ajuda ele continua abrindo.
    if (!automatico || navigator.webdriver) return;
    const fila = [
      ...(comGeral && !vistos.current.has(TOUR_GERAL.tela) ? [TOUR_GERAL] : []),
      ...(tutorialAtual && !vistos.current.has(tutorialAtual.tela) ? [tutorialAtual] : []),
    ];
    if (fila.length === 0) return;
    const espera = setTimeout(() => {
      if (document.visibilityState === "visible" && !document.querySelector("[role=dialog][aria-modal=true]:not([inert])")) void rodar(fila, true);
    }, 900);
    return () => {
      clearTimeout(espera);
      ativo.current?.destroy();
    };
  }, [automatico, comGeral, rodar, tutorialAtual, rodada]);

  // "?" abre a ajuda de qualquer lugar, menos quando a pessoa está digitando.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (e.key !== "?" || alvo.closest("input, textarea, select, [contenteditable=true]") || ativo.current) return;
      e.preventDefault();
      setAberto((v) => !v);
    };
    const pedido = () => setAberto((v) => !v);
    document.addEventListener("keydown", tecla);
    document.addEventListener(EVENTO_AJUDA, pedido);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener(EVENTO_AJUDA, pedido);
    };
  }, []);

  const verTutorial = (tu: TipoTutorial) => {
    setAberto(false);
    setTimeout(() => void rodar([tu], false), 200);
  };

  const refazerTodos = async () => {
    vistos.current = new Set();
    gravarLocal(usuario, vistos.current);
    setAutomatico(true);
    setAberto(false);
    setRodada((n) => n + 1);
    await refazerTutoriais(null).catch(() => {});
  };

  const trocarAutomatico = (ligado: boolean) => {
    setAutomatico(ligado);
    if (ligado) vistos.current.delete(TUTORIAIS_DESLIGADOS);
    else vistos.current.add(TUTORIAIS_DESLIGADOS);
    gravarLocal(usuario, vistos.current);
    tutorialAutomatico(ligado).catch(() => {});
  };

  return (
    <>
      {botaoFlutuante && (
        <button
          type="button"
          data-tour="ajuda"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-haspopup="dialog"
          aria-label="Ajuda e tutoriais"
          title="Ajuda e tutoriais (?)"
          className="ajuda-flutuante cristal grid size-12 place-items-center rounded-full text-texto transition-transform duration-200 ease-mola active:scale-[0.92]"
        >
          {aberto ? <X size={20} strokeWidth={2} aria-hidden /> : <CircleHelp size={22} strokeWidth={1.9} aria-hidden />}
        </button>
      )}
      {aberto && (
        <PainelAjuda
          tutorial={tutorialAtual}
          permitidas={permitidas}
          master={master}
          automatico={automatico}
          comGeral={comGeral}
          aoFechar={() => setAberto(false)}
          verTutorial={verTutorial}
          refazerTodos={refazerTodos}
          trocarAutomatico={trocarAutomatico}
          doCampo={!comGeral}
        />
      )}
    </>
  );
}

function PainelAjuda({
  tutorial,
  permitidas,
  master,
  automatico,
  comGeral,
  doCampo,
  aoFechar,
  verTutorial,
  refazerTodos,
  trocarAutomatico,
}: {
  tutorial?: TipoTutorial;
  permitidas: ReadonlySet<string>;
  master: boolean;
  automatico: boolean;
  comGeral: boolean;
  doCampo: boolean;
  aoFechar: () => void;
  verTutorial: (tu: TipoTutorial) => void;
  refazerTodos: () => void;
  trocarAutomatico: (ligado: boolean) => void;
}) {
  const [busca, setBusca] = useState("");
  const idTitulo = useId();
  const idBusca = useId();
  const ref = useRef<HTMLDivElement>(null);
  const encontradas = useMemo(() => buscarDuvidas(busca, permitidas), [busca, permitidas]);
  const duvidas = [...(tutorial?.duvidas ?? []), ...(comGeral ? TOUR_GERAL.duvidas ?? [] : [])];

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input")?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    const fora = (e: PointerEvent) => {
      const alvo = e.target as HTMLElement;
      if (!ref.current?.contains(alvo) && !alvo.closest("[data-tour=ajuda]")) aoFechar();
    };
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fora);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fora);
      anterior?.focus?.();
    };
  }, [aoFechar]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={idTitulo}
      className={`ajuda-painel popover flex flex-col overflow-hidden rounded-3xl border border-borda shadow-[var(--sombra)] ${doCampo ? "ajuda-campo" : ""}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-linha px-5 pt-4 pb-3">
        <div className="min-w-0">
          <p id={idTitulo} className="text-[17px] font-semibold tracking-[-0.015em]">Ajuda</p>
          <p className="truncate text-[13px] text-texto-suave">{tutorial ? tutorial.nome : "Dúvidas e tutoriais"}</p>
        </div>
        <button type="button" onClick={aoFechar} aria-label="Fechar ajuda" className="grid size-9 shrink-0 place-items-center rounded-full bg-texto/[0.06] transition-transform duration-150 active:scale-[0.92]">
          <X size={17} strokeWidth={2} aria-hidden />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-4">
        <label htmlFor={idBusca} className="relative">
          <span className="sr-only">Buscar dúvida</span>
          <Search size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-texto-suave" />
          <input id={idBusca} type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Qual a sua dúvida?" className={`h-10 w-full pl-9 ${CLASSE_CONTROLE}`} />
        </label>

        {busca.trim().length > 1 ? (
          <section aria-label="Resultados" className="flex flex-col gap-2">
            {encontradas.length === 0 ? (
              <p className="text-sm text-texto-suave">Nada encontrado. Tente outra palavra ou peça ajuda ao usuário master da empresa.</p>
            ) : (
              encontradas.map((d) => (
                <Duvida key={`${d.tela}-${d.pergunta}`} pergunta={d.pergunta} resposta={d.resposta} tela={d.tela === TOUR_GERAL.tela || d.tela === tutorial?.tela ? undefined : d} aoNavegar={aoFechar} />
              ))
            )}
          </section>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {tutorial && (
                <button type="button" onClick={() => verTutorial(tutorial)} className={`${classeBotao("primario")} w-full`}>
                  <Compass size={16} strokeWidth={1.9} aria-hidden /> Ver o tutorial desta tela
                </button>
              )}
              {comGeral && (
                <button type="button" onClick={() => verTutorial(TOUR_GERAL)} className={`${classeBotao("secundario")} w-full`}>
                  <Sparkles size={16} strokeWidth={1.9} aria-hidden /> Tour de boas-vindas
                </button>
              )}
            </div>

            {duvidas.length > 0 && (
              <section aria-label="Dúvidas frequentes" className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-texto-suave">Dúvidas frequentes</p>
                {duvidas.map((d) => <Duvida key={d.pergunta} pergunta={d.pergunta} resposta={d.resposta} />)}
              </section>
            )}

            {master && comGeral && (
              <Link href="/primeiros-passos" onClick={aoFechar} className="flex items-center gap-2.5 rounded-2xl bg-elevado/60 px-3.5 py-3 text-sm transition-colors duration-150 hover:bg-elevado">
                <BookOpen size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-marca" />
                <span className="flex flex-col">
                  <span className="font-medium">Assistente de primeiros passos</span>
                  <span className="text-xs text-texto-suave">O que falta para a piscicultura ficar pronta.</span>
                </span>
              </Link>
            )}
          </>
        )}
      </div>

      <footer className="flex flex-col gap-2 border-t border-linha px-5 py-3">
        <label className="flex items-center justify-between gap-3 text-[13px]">
          Mostrar o tutorial nas telas novas
          <input type="checkbox" checked={automatico} onChange={(e) => trocarAutomatico(e.target.checked)} className="size-4 accent-[var(--marca)]" />
        </label>
        <button type="button" onClick={refazerTodos} className={`${classeBotao("fantasma", "sm")} self-start`}>
          <RotateCcw size={14} strokeWidth={1.9} aria-hidden /> Refazer todos os tutoriais
        </button>
      </footer>
    </div>
  );
}

function Duvida({ pergunta, resposta, tela, aoNavegar }: { pergunta: string; resposta: string; tela?: { tela: string; nome: string }; aoNavegar?: () => void }) {
  return (
    <details className="group rounded-2xl bg-elevado/50 px-3.5 py-2.5 text-sm open:bg-elevado/80">
      <summary className="flex items-start justify-between gap-2 font-medium">
        {pergunta}
        <ChevronDown size={16} strokeWidth={1.9} aria-hidden className="mt-0.5 shrink-0 text-texto-suave transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <p className="mt-2 text-[13px] leading-relaxed text-texto-suave">{resposta}</p>
      {tela && !tela.tela.includes("[") && (
        <Link href={tela.tela} onClick={aoNavegar} className={`${classeBotao("secundario", "sm")} mt-2`}>
          Abrir {tela.nome}
        </Link>
      )}
    </details>
  );
}
