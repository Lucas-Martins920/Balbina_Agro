"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FocusEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import {
  Fish,
  Boxes,
  BriefcaseBusiness,
  ChevronDown,
  ChevronLeft,
  ChevronsUpDown,
  Contact,
  House,
  ListChecks,
  Landmark,
  LogOut,
  Pin,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { trocarEmpresa } from "@/app/(app)/actions";
import { sair } from "@/app/login/actions";
import { ICONES } from "@/components/menu-lateral";
import { BotaoTema, InterruptorTema } from "@/components/tema";
import { ATRASO_ABRIR, ATRASO_RECOLHER, CONSULTA_MOUSE, assinarLateral, definirEspiando, definirLateral, lateralRecolhida, podeEspiar } from "@/lib/lateral";
import { buscarTelas, grupoAtivo, hrefAtivo, montarMenu, sincronizarGruposAbertos, type Grupo, type Link as ItemLink, type Secao } from "@/lib/menu";
import { useOnline } from "@/lib/online";

// Barra lateral de vidro no estilo "Glassy Sidebar": aberta (cabeçalho da empresa, busca com ⌘K, seções com rótulo,
// grupos que abrem em árvore, modo noturno e perfil) ou recolhida num trilho de ícones com dicas ao passar o mouse.
// O estado vem de <html class="lateral-recolhida"> (src/lib/lateral.ts), e o CSS escolhe o que aparece pela variante
// `recolhida:`, então a página já pinta certa antes do React carregar. No celular a mesma lista aberta vai na folha
// do botão Menu (`movel`).

// Cada grupo tem um ícone (o que aparece no trilho) e a sua cor, para achar o assunto de relance.
const GRUPO_VISUAL: Record<string, { Icone: LucideIcon; texto: string; ponto: string }> = {
  "Produção": { Icone: Fish, texto: "text-verde", ponto: "bg-verde" },
  "Financeiro": { Icone: Landmark, texto: "text-azul", ponto: "bg-azul" },
  "Comercial": { Icone: ShoppingCart, texto: "text-laranja", ponto: "bg-laranja" },
  "Estoque": { Icone: Boxes, texto: "text-amarelo", ponto: "bg-amarelo" },
  "Cadastros": { Icone: Contact, texto: "text-rosa", ponto: "bg-rosa" },
  "Gestão": { Icone: BriefcaseBusiness, texto: "text-violeta", ponto: "bg-violeta" },
  "Configurações": { Icone: Settings, texto: "text-texto-suave", ponto: "bg-texto-suave" },
};
const ICONES_PRINCIPAL: Record<string, LucideIcon> = { painel: House, pendencias: ListChecks, "configuracoes/usuarios": Settings };

const corTexto = (l: ItemLink) => (l.grupo ? GRUPO_VISUAL[l.grupo]?.texto : "text-marca") ?? "text-marca";

const semAssinatura = () => () => {};
const ehMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
const assinarMouse = (avisar: () => void) => {
  const m = matchMedia(CONSULTA_MOUSE);
  m.addEventListener("change", avisar);
  return () => m.removeEventListener("change", avisar);
};
const temMouse = () => matchMedia(CONSULTA_MOUSE).matches;

export type DadosBarra = {
  visiveis: string[];
  master: boolean;
  empresa: { atual: string; opcoes: { id: string; nome: string }[]; subtitulo: string };
  email: string;
  // Convite para os planos acima; null no plano Gestão (já tem tudo).
  plano: { nome: string; convite: string } | null;
};

// Inicial da empresa num círculo da cor da marca, como o "V" do desenho.
function Cracha({ nome, tamanho = "size-10" }: { nome: string; tamanho?: string }) {
  return (
    <span
      aria-hidden
      className={`${tamanho} grid shrink-0 place-items-center rounded-xl bg-marca font-display text-base font-bold text-white`}
    >
      {nome.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Avatar({ email }: { email: string }) {
  const online = useOnline();
  return (
    <span className="relative shrink-0">
      <span aria-hidden className="grid size-9 place-items-center rounded-full bg-marca-suave text-sm font-semibold text-alerta uppercase ring-2 ring-white/20">
        {email.slice(0, 1)}
      </span>
      {/* Bolinha verde com internet; cinza sem (o app segue funcionando offline nos apontamentos). */}
      <span
        role="img"
        aria-label={online ? "Conectado" : "Sem internet"}
        title={online ? "Conectado" : "Sem internet"}
        className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-[var(--solido)] ${online ? "bg-verde" : "bg-texto-suave"}`}
      />
    </span>
  );
}

// Cabeçalho da empresa. Com mais de uma, o select nativo fica por cima, transparente: teclado e leitor de tela seguem.
function CabecalhoEmpresa({ empresa }: { empresa: DadosBarra["empresa"] }) {
  const id = useId();
  const nome = empresa.opcoes.find((o) => o.id === empresa.atual)?.nome ?? empresa.opcoes[0]?.nome ?? "";
  const conteudo = (
    <>
      <Cracha nome={nome} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-display text-[15px] font-semibold tracking-[-0.01em]">{nome}</span>
        <span className="truncate text-xs text-texto-suave">{empresa.subtitulo}</span>
      </span>
    </>
  );
  if (empresa.opcoes.length < 2) return <div className="flex items-center gap-3 px-1">{conteudo}</div>;
  return (
    <form action={trocarEmpresa} className="relative flex items-center gap-3 rounded-lg px-1 py-1 transition-colors duration-150 hover:bg-elevado/60">
      {conteudo}
      <ChevronsUpDown size={14} aria-hidden className="shrink-0 text-texto-suave" />
      <label htmlFor={id} className="sr-only">Empresa</label>
      <select
        id={id}
        name="empresa_id"
        defaultValue={empresa.atual}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {empresa.opcoes.map((o) => (
          <option key={o.id} value={o.id}>{o.nome}</option>
        ))}
      </select>
    </form>
  );
}

const CLASSE_ITEM = "group flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-[background-color,color,box-shadow] duration-150";
// Ativo: fundo suave na cor da marca, texto na cor da marca.
const CLASSE_ATIVO = "bg-marca-suave font-semibold text-marca";
const CLASSE_INATIVO = "text-texto/80 hover:bg-elevado hover:text-texto";

function ItemLinkAberto({ item, ativo }: { item: ItemLink; ativo: boolean }) {
  const Icone = ICONES[item.slug] ?? ICONES_PRINCIPAL[item.slug] ?? House;
  return (
    <Link href={item.href} aria-current={ativo ? "page" : undefined} className={`${CLASSE_ITEM} ${ativo ? CLASSE_ATIVO : CLASSE_INATIVO}`}>
      <Icone aria-hidden size={18} strokeWidth={ativo ? 2.25 : 1.75} className={`${corTexto(item)} shrink-0`} />
      <span className="truncate">{item.nome}</span>
    </Link>
  );
}

// Grupo que abre os módulos em árvore, com o conector em curva de cada filho e o ponto na cor do grupo.
function ItemGrupoAberto({ grupo, aberto, alternar, ativoHref, recolhida, abrirLateral }: { grupo: Grupo; aberto: boolean; alternar: () => void; ativoHref: string | null; recolhida: boolean; abrirLateral: () => void }) {
  const id = useId();
  const visual = GRUPO_VISUAL[grupo.nome];
  const Icone = visual?.Icone ?? House;
  const contemAtivo = grupo.filhos.some((f) => f.href === ativoHref);
  return (
    <div>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => {
          if (recolhida) abrirLateral();
          alternar();
        }}
        className={`${CLASSE_ITEM} w-full ${contemAtivo && !aberto ? CLASSE_ATIVO : CLASSE_INATIVO}`}
      >
        <Icone aria-hidden size={18} strokeWidth={contemAtivo ? 2.25 : 1.75} className={`${visual?.texto ?? ""} shrink-0`} />
        <span className={`flex-1 truncate text-left ${contemAtivo ? "font-semibold text-texto" : ""}`}>{grupo.nome}</span>
        <ChevronDown aria-hidden size={16} className={`shrink-0 text-texto-suave transition-transform duration-300 ease-out ${aberto ? "rotate-180" : ""}`} />
      </button>
      <div id={id} inert={!aberto} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${aberto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <ul className="ml-[21px] min-h-0 overflow-hidden">
          {grupo.filhos.map((f, i) => {
            const ativo = f.href === ativoHref;
            const ultimo = i === grupo.filhos.length - 1;
            return (
              <li
                key={f.href}
                className={`relative pl-5 before:absolute before:top-0 before:left-0 before:h-1/2 before:w-3 before:rounded-bl-lg before:border-b before:border-l before:border-texto/20 ${
                  ultimo ? "" : "after:absolute after:top-0 after:bottom-0 after:left-0 after:border-l after:border-texto/20"
                }`}
              >
                <Link
                  href={f.href}
                  aria-current={ativo ? "page" : undefined}
                  className={`my-0.5 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors duration-150 ${ativo ? `${CLASSE_ATIVO} text-texto` : "text-texto/75 hover:bg-elevado hover:text-texto"}`}
                >
                  <span aria-hidden className={`size-2 shrink-0 rounded-full ${visual?.ponto ?? "bg-marca"} ${ativo ? "" : "opacity-70"} shadow-[0_0_0_3px_rgb(255_255_255/0.12)]`} />
                  <span className="truncate">{f.nome}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Rotulo({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-[0.08em] text-texto-suave uppercase">{children}</p>;
}

// Menu do perfil: segurança da conta, outra empresa, planos e sair.
function MenuPerfil({ plano, fechar, className }: { plano: DadosBarra["plano"]; fechar: () => void; className: string }) {
  const classe = "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-texto/85 transition-colors duration-150 hover:bg-elevado hover:text-texto";
  return (
    <div role="menu" aria-label="Conta" onClick={(e) => (e.target as HTMLElement).closest("a") && fechar()} className={`popover z-50 rounded-2xl p-1.5 shadow-[var(--sombra-cristal)] ring-1 ring-linha ${className}`}>
      <Link role="menuitem" href="/seguranca" className={classe}>
        <ShieldCheck aria-hidden size={16} strokeWidth={1.75} /> Segurança da conta
      </Link>
      <Link role="menuitem" href="/onboarding" className={classe}>
        <Plus aria-hidden size={16} strokeWidth={1.75} /> Outra empresa
      </Link>
      {plano && (
        <Link role="menuitem" href="/assinatura" className={classe}>
          <Sparkles aria-hidden size={16} strokeWidth={1.75} className="text-marca" /> Conhecer planos
        </Link>
      )}
      <div className="my-1 border-t border-linha" />
      <form action={sair}>
        <button role="menuitem" type="submit" className={`${classe} text-perigo hover:text-perigo`}>
          <LogOut aria-hidden size={16} strokeWidth={1.75} /> Sair
        </button>
      </form>
    </div>
  );
}

// Fecha o menu do perfil com Esc ou clique fora.
function useFecharFora(aberto: boolean, definir: (aberto: boolean) => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!aberto) return;
    const fechar = () => definir(false);
    const clique = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) fechar();
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("mousedown", clique);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", clique);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto, definir, ref]);
}

export function BarraLateral({ dados, movel = false }: { dados: DadosBarra; movel?: boolean }) {
  const { visiveis, master, empresa, email, plano } = dados;
  const caminho = usePathname();
  const router = useRouter();
  const secoes: Secao[] = montarMenu(visiveis, { master, simples: movel });
  const todosHrefs = secoes.flatMap((s) => s.itens.flatMap((i) => (i.tipo === "link" ? [i.href] : i.filhos.map((f) => f.href))));
  const ativoHref = hrefAtivo(caminho, todosHrefs);
  const grupoDaTela = grupoAtivo(secoes, caminho);

  // Grupos abertos: começa com o da tela atual e abre o novo quando a tela muda (ajuste durante a renderização,
  // sem efeito, como a documentação do React recomenda).
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(grupoDaTela ? [grupoDaTela] : []));
  const [grupoAnterior, setGrupoAnterior] = useState(grupoDaTela);
  if (grupoAnterior !== grupoDaTela) {
    setGrupoAnterior(grupoDaTela);
    setAbertos((a) => sincronizarGruposAbertos(a, grupoDaTela));
  }
  const alternarGrupo = (nome: string, abrir?: boolean) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (abrir ?? !n.has(nome)) n.add(nome);
      else n.delete(nome);
      return n;
    });

  const recolhida = useSyncExternalStore(movel ? semAssinatura : assinarLateral, () => !movel && lateralRecolhida(), () => false);
  const mac = useSyncExternalStore(semAssinatura, ehMac, () => true);
  const [termo, setTermo] = useState("");
  const busca = useRef<HTMLInputElement>(null);
  const resultados = buscarTelas(termo, visiveis, master && !movel);
  const [perfil, setPerfil] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const fecharPerfil = () => setPerfil(false);
  useFecharFora(perfil, setPerfil, caixa);
  const [dica, setDica] = useState<{ texto: string; x: number; y: number } | null>(null);

  // Espiar (src/lib/lateral.ts): recolhida, o mouse sobre o trilho abre o painel por cima do conteúdo e, ao sair,
  // recolhe de novo. Os atrasos evitam abrir de passagem e piscar na borda. Não recolhe com o menu da conta aberto
  // nem com o foco dentro (digitando na busca): recolhe quando o foco ou o menu saem e o mouse já está fora.
  const telaComMouse = useSyncExternalStore(movel ? semAssinatura : assinarMouse, () => !movel && temMouse(), () => false);
  const [espiando, setEspiando] = useState(false);
  if (espiando && !recolhida) setEspiando(false);
  const espiar = espiando && recolhida;
  const dentro = useRef(false);
  const perfilAberto = useRef(perfil);
  const relogio = useRef<number | undefined>(undefined);
  const agendar = (fn: () => void, ms: number) => {
    window.clearTimeout(relogio.current);
    relogio.current = window.setTimeout(fn, ms);
  };
  const agendarRecolher = () =>
    agendar(() => {
      if (!dentro.current && !perfilAberto.current && !caixa.current?.contains(document.activeElement)) setEspiando(false);
    }, ATRASO_RECOLHER);
  useEffect(() => {
    if (movel) return;
    definirEspiando(espiar);
    return () => definirEspiando(false);
  }, [espiar, movel]);
  useEffect(() => () => window.clearTimeout(relogio.current), []);
  useEffect(() => {
    perfilAberto.current = perfil;
    if (!perfil && espiando && !dentro.current) agendarRecolher();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o menu da conta fecha
  }, [perfil]);
  const entrar = (e: PointerEvent<HTMLElement>) => {
    dentro.current = true;
    if (!podeEspiar({ recolhida, ponteiro: e.pointerType, telaComMouse, versaoCompleta: document.documentElement.classList.contains("completa") })) return;
    if (espiando) window.clearTimeout(relogio.current);
    else agendar(() => dentro.current && setEspiando(true), ATRASO_ABRIR);
  };
  const deixar = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    dentro.current = false;
    if (espiando) agendarRecolher();
    else window.clearTimeout(relogio.current);
  };

  const abrirBusca = () => {
    definirLateral(false);
    // Espera o CSS mostrar o painel aberto antes de focar.
    requestAnimationFrame(() => busca.current?.focus());
  };

  // ⌘K / Ctrl+K em qualquer tela abre a busca (só no computador).
  useEffect(() => {
    if (movel) return;
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        definirLateral(false);
        requestAnimationFrame(() => busca.current?.focus());
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [movel]);

  const mostrarDica = (e: PointerEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>("[data-dica]");
    if (!alvo) return setDica(null);
    const r = alvo.getBoundingClientRect();
    setDica({ texto: alvo.dataset.dica ?? "", x: r.right + 14, y: r.top + r.height / 2 });
  };

  const irPara = (href: string) => {
    setTermo("");
    router.push(href);
  };

  // ---- Painel aberto (computador e folha do celular) ----
  const painel = (
    <div className={`flex min-h-0 flex-col ${movel ? "" : "lateral-entra h-full recolhida:hidden"}`}>
      <div className={`flex flex-col gap-3 ${movel ? "" : "px-3 pt-4"}`}>
        <div data-tour="empresa" className={movel ? "" : "pr-6"}>
          <CabecalhoEmpresa empresa={empresa} />
        </div>
        <label className="flex h-10 items-center gap-2.5 rounded-lg bg-texto/[0.07] px-3 text-sm ring-1 ring-borda transition-shadow focus-within:ring-2 focus-within:ring-marca/60">
          <Search aria-hidden size={17} strokeWidth={1.9} className="shrink-0 text-texto-suave" />
          <span className="sr-only">Buscar telas</span>
          <input
            ref={busca}
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && resultados[0]) {
                e.preventDefault();
                irPara(resultados[0].href);
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                setTermo("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Buscar telas"
            className="min-w-0 flex-1 bg-transparent shadow-none outline-none focus:outline-none focus-visible:outline-none placeholder:text-texto-suave [&::-webkit-search-cancel-button]:hidden"
          />
          {!movel && (
            <kbd className="shrink-0 rounded-md bg-elevado px-1.5 py-0.5 font-sans text-[11px] text-texto-suave ring-1 ring-borda">{mac ? "⌘K" : "Ctrl K"}</kbd>
          )}
        </label>
      </div>

      <nav aria-label="Módulos" className={`flex flex-col ${movel ? "pt-4" : "min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-4 pb-3"}`}>
        {termo.trim() ? (
          resultados.length ? (
            <div className="flex flex-col gap-0.5">
              <Rotulo>Telas encontradas</Rotulo>
              {resultados.map((t) => {
                const Icone = ICONES[t.slug] ?? ICONES_PRINCIPAL[t.slug] ?? House;
                return (
                  <Link key={t.href} href={t.href} onClick={() => setTermo("")} className={`${CLASSE_ITEM} ${CLASSE_INATIVO}`}>
                    <Icone aria-hidden size={18} strokeWidth={1.75} className={`${GRUPO_VISUAL[t.grupo]?.texto ?? "text-marca"} shrink-0`} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{t.nome}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-texto-suave">{t.grupo}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-texto-suave">Nenhuma tela com “{termo.trim()}”.</p>
          )
        ) : (
          secoes.map((s, n) => (
            <div key={s.nome} className={`flex flex-col gap-0.5 ${n > 0 ? "mt-5" : ""}`}>
              <Rotulo>{s.nome}</Rotulo>
              {s.itens.map((i) =>
                i.tipo === "link" ? (
                  <ItemLinkAberto key={i.href} item={i} ativo={i.href === ativoHref} />
                ) : (
                  <ItemGrupoAberto key={i.nome} grupo={i} aberto={abertos.has(i.nome)} alternar={() => alternarGrupo(i.nome)} ativoHref={ativoHref} recolhida={recolhida} abrirLateral={() => definirLateral(false)} />
                ),
              )}
            </div>
          ))
        )}
      </nav>

      <div className={`flex flex-col gap-1 ${movel ? "mt-4" : "px-3 pb-3"}`}>
        {!movel && plano && (
          <Link href="/assinatura" className="mb-1 flex items-start gap-2.5 rounded-lg bg-elevado px-3 py-2.5 text-sm transition-colors duration-150 hover:bg-elevado">
            <Sparkles size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-marca" />
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">{plano.nome}</span>
              <span className="text-xs text-texto-suave">{plano.convite} Conhecer planos</span>
            </span>
          </Link>
        )}
        <div data-tour="tema">
          <InterruptorTema />
        </div>
        <div className="mx-2 my-1 border-t border-linha" />
        <div className="relative">
          {perfil && movel && <MenuPerfil plano={plano} fechar={fecharPerfil} className="absolute inset-x-0 bottom-full mb-2" />}
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={perfil}
            onClick={() => setPerfil((p) => !p)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-elevado/60"
          >
            <Avatar email={email} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{email.split("@")[0]}</span>
              <span className="truncate text-xs text-texto-suave">{email}</span>
            </span>
            <ChevronsUpDown aria-hidden size={15} className="shrink-0 text-texto-suave" />
          </button>
        </div>
      </div>
    </div>
  );

  if (movel) return <div ref={caixa}>{painel}</div>;

  // ---- Trilho recolhido ----
  const classeTrilho = (ativo: boolean) =>
    `grid size-11 shrink-0 place-items-center rounded-lg transition-[background-color,color,transform,box-shadow] duration-150 active:scale-[0.94] ${
      ativo ? "bg-marca-suave text-marca" : "text-texto/75 hover:bg-elevado hover:text-texto"
    }`;
  const nomeEmpresa = empresa.opcoes.find((o) => o.id === empresa.atual)?.nome ?? "";
  const trilho = (
    <div
      onPointerOver={mostrarDica}
      onPointerLeave={() => setDica(null)}
      onFocus={mostrarDica}
      onBlur={() => setDica(null)}
      className="lateral-entra hidden h-full flex-col items-center py-4 recolhida:flex"
    >
      <button type="button" onClick={() => definirLateral(false)} aria-label={`Abrir a barra lateral (${nomeEmpresa})`} data-dica={nomeEmpresa} className="rounded-[10px] transition-transform active:scale-[0.94]">
        <Cracha nome={nomeEmpresa} tamanho="size-11" />
      </button>
      <button type="button" onClick={abrirBusca} aria-label="Buscar telas" data-dica={`Buscar telas  ${mac ? "⌘K" : "Ctrl K"}`} className={`${classeTrilho(false)} mt-3`}>
        <Search aria-hidden size={18} strokeWidth={1.9} />
      </button>
      <span aria-hidden className="my-2 h-px w-5 shrink-0 bg-texto/20" />
      <nav aria-label="Módulos" className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto [scrollbar-width:none]">
        {secoes.map((s, n) => (
          <div key={s.nome} className="flex flex-col items-center gap-1">
            {n > 0 && <span aria-hidden className="my-1.5 h-px w-5 bg-texto/20" />}
            {s.itens.map((i) => {
              if (i.tipo === "link") {
                const Icone = ICONES[i.slug] ?? ICONES_PRINCIPAL[i.slug] ?? House;
                const ativo = i.href === ativoHref;
                return (
                  <Link key={i.href} href={i.href} aria-label={i.nome} aria-current={ativo ? "page" : undefined} data-dica={i.nome} className={classeTrilho(ativo)}>
                    <Icone aria-hidden size={19} strokeWidth={ativo ? 2.25 : 1.75} className={ativo ? corTexto(i) : ""} />
                  </Link>
                );
              }
              const visual = GRUPO_VISUAL[i.nome];
              const Icone = visual?.Icone ?? House;
              const ativo = i.nome === grupoDaTela;
              return (
                <button
                  key={i.nome}
                  type="button"
                  aria-label={`${i.nome}: abrir a barra lateral com as telas do grupo`}
                  data-dica={i.nome}
                  onClick={() => {
                    alternarGrupo(i.nome, true);
                    definirLateral(false);
                  }}
                  className={classeTrilho(ativo)}
                >
                  <Icone aria-hidden size={19} strokeWidth={ativo ? 2.25 : 1.75} className={ativo ? visual?.texto : ""} />
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <span aria-hidden className="my-2 h-px w-5 shrink-0 bg-texto/20" />
      <BotaoTema className={classeTrilho(false)} />
      <button type="button" aria-haspopup="menu" aria-expanded={perfil} aria-label={`Conta: ${email}`} data-dica={email} onClick={() => setPerfil((p) => !p)} className="mt-2 rounded-full transition-transform active:scale-[0.92]">
        <Avatar email={email} />
      </button>
    </div>
  );

  return (
    // A aside inteira (com a margem até a borda da tela) conta como "sobre a barra": encostar o mouse no canto esquerdo
    // já abre.
    <aside
      onPointerEnter={entrar}
      onPointerLeave={deixar}
      onBlur={(e) => espiando && !caixa.current?.contains(e.relatedTarget as Node | null) && agendarRecolher()}
      className="sticky top-0 z-30 hidden h-dvh md:block"
    >
      <div ref={caixa} data-tour="menu" className="lateral-caixa relative h-full">
        <div className="igapo cristal h-full">
          {trilho}
          {painel}
        </div>
        {/* Botão redondo na borda, meio para fora, como no desenho: recolhe e abre. Aberta pelo mouse, vira o alfinete
            que fixa a barra aberta (aí ela não recolhe mais ao tirar o mouse). */}
        <button
          type="button"
          onClick={() => {
            setPerfil(false);
            setEspiando(false);
            definirLateral(!recolhida);
          }}
          aria-label={espiar ? "Fixar a barra lateral aberta" : recolhida ? "Abrir a barra lateral" : "Recolher a barra lateral"}
          aria-expanded={!recolhida || espiar}
          title={espiar ? "Fixar aberta" : undefined}
          className="absolute top-6 -right-3 z-10 grid size-6 place-items-center rounded-md bg-marca text-white shadow-[0_2px_8px_rgb(0_0_0/0.25)] transition-transform duration-150 hover:scale-105 active:scale-[0.92] recolhida:top-7"
        >
          {espiar ? (
            <Pin aria-hidden size={14} strokeWidth={2.25} className="rotate-45" />
          ) : (
            <ChevronLeft aria-hidden size={16} strokeWidth={2.25} className="transition-transform duration-300 recolhida:rotate-180" />
          )}
        </button>
        {perfil && (
          <MenuPerfil
            plano={plano}
            fechar={fecharPerfil}
            className="absolute right-3 bottom-[72px] left-3 recolhida:right-auto recolhida:bottom-3 recolhida:left-[calc(100%+12px)] recolhida:w-60"
          />
        )}
      </div>
      {dica && recolhida && !espiar && (
        <span
          role="tooltip"
          style={{ left: dica.x, top: dica.y }}
          className="igapo cristal pointer-events-none fixed z-50 -translate-y-1/2 rounded-md px-2.5 py-1.5 text-[13px] font-medium whitespace-pre text-texto"
        >
          {dica.texto}
        </span>
      )}
    </aside>
  );
}
