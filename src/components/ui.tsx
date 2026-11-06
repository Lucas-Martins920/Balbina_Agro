import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { RotulosCelular } from "@/components/tabela-celular";

// Primitivos visuais. Só usam as cores de token de globals.css, então o tema claro/escuro vem de graça.

type VarianteBotao = "primario" | "secundario" | "fantasma" | "perigo";

const ESTILO_BOTAO: Record<VarianteBotao, string> = {
  // Cápsulas de vidro do Liquid Glass: a principal é vidro tingido de gema, as outras são vidro claro.
  primario:
    "bg-marca/90 text-marca-texto shadow-[inset_0_1px_0_rgb(255_255_255/0.6),inset_0_-1px_0_rgb(0_0_0/0.1),0_8px_22px_-8px_var(--marca)] hover:bg-marca",
  secundario:
    "bg-elevado text-texto shadow-[inset_0_1px_0_var(--aresta),inset_0_0_0_1px_var(--brilho),0_4px_14px_-6px_rgb(0_0_0/0.18)] hover:bg-solido/70",
  fantasma: "text-texto hover:bg-elevado",
  perigo: "bg-perigo/12 text-perigo shadow-[inset_0_1px_0_var(--brilho)] hover:bg-perigo/18",
};

// `quebrar` deixa um texto longo passar para a linha de baixo (a cápsula cresce na altura) em vez de vazar no celular.
export function classeBotao(variante: VarianteBotao = "primario", tamanho: "md" | "sm" = "md", quebrar = false) {
  // O pequeno tem 32px de altura, mas a área de toque cresce para 44px (::after invisível), como pede o iOS.
  const altura =
    tamanho === "sm"
      ? `relative px-3.5 text-[13px] after:absolute after:-inset-y-1.5 after:-inset-x-1 after:content-[''] ${quebrar ? "min-h-8 py-1.5" : "h-8"}`
      : quebrar ? "min-h-10 px-5 py-2 text-sm" : "h-10 px-5 text-sm";
  const linha = quebrar ? "max-w-full text-left whitespace-normal" : "whitespace-nowrap";
  return `inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-full font-medium ${linha} transition-[background-color,transform,opacity,box-shadow] duration-200 ease-mola active:scale-[0.95] disabled:pointer-events-none disabled:opacity-50 ${altura} ${ESTILO_BOTAO[variante]}`;
}

export function Botao({
  className = "",
  variante = "primario",
  tamanho = "md",
  ...props
}: ComponentProps<"button"> & { variante?: VarianteBotao; tamanho?: "md" | "sm" }) {
  return <button className={`${classeBotao(variante, tamanho)} ${className}`} {...props} />;
}

// Link com cara de botão, para ações que levam a outra tela.
export function LinkBotao({
  className = "",
  variante = "secundario",
  tamanho = "md",
  ...props
}: ComponentProps<typeof Link> & { variante?: VarianteBotao; tamanho?: "md" | "sm" }) {
  return <Link className={`${classeBotao(variante, tamanho)} ${className}`} {...props} />;
}

// Trecho de texto clicável dentro de uma frase: cápsula pequena no lugar do link sublinhado.
export const CLASSE_BOTAO_TEXTO =
  "inline-flex items-center rounded-full bg-elevado px-2 py-px align-baseline font-medium whitespace-nowrap text-texto shadow-[inset_0_1px_0_var(--aresta),inset_0_0_0_1px_var(--brilho)] transition-colors duration-200 hover:bg-solido/70 disabled:pointer-events-none disabled:opacity-50";

export const CLASSE_CONTROLE =
  "rounded-xl border border-borda bg-elevado/70 px-3 text-sm text-texto shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-texto-suave/80 hover:bg-elevado focus:border-marca focus:bg-solido focus:ring-4 focus:ring-marca/20 disabled:opacity-60";

function Rotulo({ texto, ajuda }: { texto: string; ajuda?: string }) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="font-medium text-texto">{texto}</span>
      {ajuda && <span className="text-xs text-texto-suave">{ajuda}</span>}
    </span>
  );
}

export function Campo({ rotulo, ajuda, id, className = "", ...props }: ComponentProps<"input"> & { rotulo: string; id: string; ajuda?: string }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-sm">
      <Rotulo texto={rotulo} ajuda={ajuda} />
      <input id={id} className={`h-10 ${CLASSE_CONTROLE} ${className}`} {...props} />
    </label>
  );
}

export function Selecao({ rotulo, ajuda, id, children, className = "", ...props }: ComponentProps<"select"> & { rotulo: string; id: string; ajuda?: string }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-sm">
      <Rotulo texto={rotulo} ajuda={ajuda} />
      <select id={id} className={`h-10 pr-8 ${CLASSE_CONTROLE} ${className}`} {...props}>
        {children}
      </select>
    </label>
  );
}

export function AreaTexto({ rotulo, ajuda, id, className = "", ...props }: ComponentProps<"textarea"> & { rotulo: string; id: string; ajuda?: string }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-sm">
      <Rotulo texto={rotulo} ajuda={ajuda} />
      <textarea id={id} className={`min-h-24 py-2 font-mono ${CLASSE_CONTROLE} ${className}`} {...props} />
    </label>
  );
}

export function Cartao({
  titulo,
  descricao,
  acoes,
  children,
  className = "",
  icone,
  cor = "marca",
}: {
  titulo?: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
  icone?: LucideIcon;
  cor?: Cor;
}) {
  return (
    <section data-cartao={titulo} className={`vidro rounded-2xl border border-borda p-5 sm:p-6 ${className}`}>
      {(titulo || acoes) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {icone && <Ficha icone={icone} cor={cor} />}
            <div>
              {titulo && <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-texto">{titulo}</h2>}
              {descricao && <p className="mt-0.5 text-[13px] text-texto-suave">{descricao}</p>}
            </div>
          </div>
          {acoes}
        </header>
      )}
      {children}
    </section>
  );
}

type TipoAviso = "erro" | "info" | "sucesso" | "alerta";

const ESTILO_AVISO: Record<TipoAviso, string> = {
  erro: "bg-[var(--etiqueta-perigo)] text-[var(--etiqueta-perigo-texto)]",
  info: "bg-elevado/60 text-texto",
  sucesso: "bg-[var(--etiqueta-positivo)] text-[var(--etiqueta-positivo-texto)]",
  alerta: "bg-[var(--etiqueta-alerta)] text-[var(--etiqueta-alerta-texto)]",
};

export function Aviso({ children, tipo = "erro" }: { children: ReactNode; tipo?: TipoAviso }) {
  return (
    <p role={tipo === "erro" ? "alert" : "status"} className={`rounded-xl px-3.5 py-2.5 text-sm ${ESTILO_AVISO[tipo]}`}>
      {children}
    </p>
  );
}

export type TomEtiqueta = "neutro" | "positivo" | "perigo" | "alerta" | "info";

export function Etiqueta({ children, tom = "neutro", className = "" }: { children: ReactNode; tom?: TomEtiqueta; className?: string }) {
  return (
    <span
      className={`inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap ${className}`}
      style={{ background: `var(--etiqueta-${tom})`, color: `var(--etiqueta-${tom}-texto)` }}
    >
      {children}
    </span>
  );
}

// `direita` lista as colunas numéricas: o cabeçalho alinha à direita junto com os valores.
// No celular cada linha vira um cartão (ver RotulosCelular): `principal` é a coluna que dá título ao cartão e
// `ocultarNoCelular` as colunas de detalhe que ficam só na tabela. Tabelas de análise largas (semana a semana,
// viabilidade) usam `celular="rolar"` e continuam tabela, com rolagem lateral dentro da lâmina.
export function Tabela({
  cabecalho,
  children,
  total,
  vazio = "Nada por aqui ainda.",
  direita = [],
  principal,
  ocultarNoCelular = [],
  celular = "cartoes",
}: {
  cabecalho: string[];
  children: ReactNode;
  total: number;
  vazio?: string;
  direita?: string[];
  principal?: string;
  ocultarNoCelular?: string[];
  celular?: "cartoes" | "rolar";
}) {
  if (total === 0) {
    return <Vazio>{vazio}</Vazio>;
  }
  const cartoes = celular === "cartoes";
  return (
    <div data-tour="lista" className={`relative vidro overflow-x-auto rounded-2xl border border-borda ${cartoes ? "tabela-cartoes" : ""}`}>
      <table className="w-full text-sm">
        <thead className="border-b border-linha text-left text-[13px] text-texto-suave">
          <tr>{cabecalho.map((c, i) => <th key={`${c}-${i}`} scope="col" className={`h-10 whitespace-nowrap px-4 font-medium ${direita.includes(c) ? "text-right" : ""}`}>{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-linha [&_td]:px-4 [&_td]:py-2.5 [&_tr]:transition-colors [&_tr]:duration-150 [&_tr:hover]:bg-elevado/50">{children}</tbody>
      </table>
      {cartoes && (
        <RotulosCelular
          principal={Math.max(0, principal ? cabecalho.indexOf(principal) : 0)}
          ocultar={ocultarNoCelular.map((c) => cabecalho.indexOf(c)).filter((i) => i >= 0)}
        />
      )}
    </div>
  );
}

export function Vazio({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-borda px-5 py-6 text-sm text-texto-suave">
      <p>{children}</p>
      {acao}
    </div>
  );
}

export function Titulo({ children, descricao, acoes }: { children: ReactNode; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 data-tour="titulo" className="text-[30px] leading-[1.1] font-bold tracking-[-0.03em] text-balance md:text-[34px]">{children}</h1>
        {descricao && <p className="mt-1 max-w-[65ch] text-sm text-texto-suave">{descricao}</p>}
      </div>
      {acoes && <div data-tour="acoes" className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

// Bloco da tela com título e as ações que mexem nele (lançamentos, exportar) do lado direito do título.
export function Secao({ titulo, descricao, acoes, children, className = "" }: { titulo: string; descricao?: string; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section data-cartao={titulo} className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          {descricao && <p className="text-sm text-texto-suave">{descricao}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

// Filtro em abas (links): substitui os grupos de botões "rounded px-3 py-1" das telas.
export function Segmentos({ opcoes, rotulo }: { opcoes: { href: string; nome: ReactNode; ativo: boolean }[]; rotulo: string }) {
  return (
    <nav aria-label={rotulo} data-tour="filtros" className="inline-flex w-fit max-w-full gap-0.5 self-start overflow-x-auto rounded-full bg-elevado p-1 whitespace-nowrap text-[13px] shadow-[inset_0_1px_0_var(--aresta),inset_0_0_0_1px_var(--brilho)]">
      {opcoes.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          prefetch={false}
          scroll={false}
          aria-current={o.ativo ? "page" : undefined}
          className={`rounded-full px-3.5 py-1.5 font-medium transition-[background-color,color,transform] duration-200 ease-mola active:scale-[0.95] ${
            o.ativo ? "bg-solido/90 text-texto shadow-[inset_0_1px_0_var(--aresta),0_2px_10px_-2px_rgb(0_0_0/0.18)]" : "text-texto-suave hover:text-texto"
          }`}
        >
          {o.nome}
        </Link>
      ))}
    </nav>
  );
}

// Cores de apoio. Classes escritas por extenso para o Tailwind encontrar.
export type Cor = "azul" | "verde" | "laranja" | "violeta" | "rosa" | "amarelo" | "marca";
export const COR_FICHA: Record<Cor, string> = {
  azul: "bg-azul text-white",
  verde: "bg-verde text-white",
  laranja: "bg-laranja text-white",
  violeta: "bg-violeta text-white",
  rosa: "bg-rosa text-white",
  amarelo: "bg-amarelo text-white",
  marca: "bg-marca text-white",
};

// Ícone num quadrado colorido com o glifo branco, como os Ajustes do iPhone: dá a cor do assunto sem pintar o texto.
export function Ficha({ icone: Icone, cor, tamanho = 28 }: { icone: LucideIcon; cor: Cor; tamanho?: number }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] ${COR_FICHA[cor]}`}
      style={{ width: tamanho, height: tamanho, borderRadius: Math.round(tamanho * 0.28) }}
    >
      <Icone size={Math.round(tamanho * 0.57)} strokeWidth={2} />
    </span>
  );
}

// Cartão de indicador do painel: ficha colorida, número grande e, se houver, um gráfico pequeno embaixo.
export function CartaoKpi({
  rotulo, valor, detalhe, icone, cor, href, tom, children,
}: {
  rotulo: string; valor: ReactNode; detalhe?: ReactNode; icone: LucideIcon; cor: Cor; href?: string; tom?: "positivo" | "perigo"; children?: ReactNode;
}) {
  const corValor = tom === "perigo" ? "text-perigo" : tom === "positivo" ? "text-positivo" : "text-texto";
  const corpo = (
    <>
      <div className="relative flex items-center gap-2.5">
        <Ficha icone={icone} cor={cor} />
        <p className="text-[13px] font-medium text-texto-suave">{rotulo}</p>
      </div>
      <p className={`relative mt-3 text-[28px] leading-tight font-semibold tracking-[-0.025em] tabular-nums ${corValor}`}>{valor}</p>
      {detalhe && <p className="relative mt-1 text-xs text-texto-suave">{detalhe}</p>}
      {children && <div className="relative mt-3">{children}</div>}
    </>
  );
  const classe = "vidro relative block overflow-hidden rounded-2xl border border-borda p-5";
  return href ? (
    <Link href={href} className={`${classe} transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5`}>{corpo}</Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}

// Número de destaque: tipo, não ladrilho. Fica dentro de um Cartao ou de uma Faixa.
export function Indicador({
  rotulo,
  valor,
  detalhe,
  href,
  tom,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  href?: string;
  tom?: "positivo" | "perigo";
}) {
  const cor = tom === "perigo" ? "text-perigo" : tom === "positivo" ? "text-positivo" : "text-texto";
  const conteudo = (
    <>
      <p className="text-[13px] text-texto-suave">{rotulo}</p>
      <p className={`mt-1 text-[28px] leading-tight font-semibold tracking-[-0.025em] tabular-nums ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-texto-suave">{detalhe}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block border-t border-l border-linha p-4 transition-colors duration-150 hover:bg-elevado/50">
      {conteudo}
    </Link>
  ) : (
    <div className="border-t border-l border-linha p-4">{conteudo}</div>
  );
}

// Uma linha de indicadores separados por fios, num só cartão.
export function Faixa({ children, colunas = 4 }: { children: ReactNode; colunas?: 2 | 3 | 4 | 5 }) {
  const grade = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5" }[colunas];
    // Cada item desenha o fio de cima e o da esquerda; a margem negativa esconde os fios da borda externa.
  return (
    <div data-tour="indicadores" className="vidro overflow-hidden rounded-2xl border border-borda">
      <div className={`-mt-px -ml-px grid grid-cols-1 ${grade}`}>{children}</div>
    </div>
  );
}
