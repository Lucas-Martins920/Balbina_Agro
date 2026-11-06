"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type Announcements, type DragEndEvent, type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical } from "lucide-react";
import { Aviso, Botao } from "@/components/ui";
import { compararOrdem, moverPara, type ItemOrdenavel } from "@/lib/ordem";

// Reordenar arrastando, como no NIBO: cada item tem uma alça; ele só troca de lugar com os irmãos
// (subcategoria dentro da principal, centro dentro do pai). Pelo teclado: Espaço pega, setas movem, Espaço solta.
// Cada soltura grava na hora; se o banco recusar, a lista volta como estava.

type Secao = { chave: string; nome: string };

const INSTRUCOES: ScreenReaderInstructions = {
  draggable: "Para mover, aperte Espaço ou Enter. Use as setas para cima e para baixo e aperte Espaço de novo para soltar, ou Esc para cancelar.",
};

function anuncios(nome: (id: string) => string, posicao: (id: string) => number): Announcements {
  return {
    onDragStart: ({ active }) => `${nome(String(active.id))} pego.`,
    onDragOver: ({ active, over }) => (over ? `${nome(String(active.id))} na posição ${posicao(String(over.id))}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${nome(String(active.id))} solto na posição ${posicao(String(over.id))}.` : `${nome(String(active.id))} solto.`),
    onDragCancel: ({ active }) => `Movimento cancelado. ${nome(String(active.id))} voltou ao lugar.`,
  };
}

export function ArvoreOrdenavel<T extends ItemOrdenavel>({
  itens,
  secoes,
  secaoDe,
  render,
  salvar,
  aoConcluir,
  dica,
}: {
  itens: T[];
  // Seções fixas para os itens da raiz (categorias: grupo do DRE). Sem elas, uma lista só.
  secoes?: Secao[];
  secaoDe?: (item: T) => string;
  render: (item: T) => ReactNode;
  salvar: (ids: string[]) => Promise<{ erro?: string }>;
  aoConcluir: () => void;
  dica?: string;
}) {
  const [ordem, setOrdem] = useState<Record<string, number>>({});
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState("");
  const [salvando, iniciar] = useTransition();
  const idBase = useId();

  const ids = new Set(itens.map((i) => i.id));
  const comOrdem = itens.map((i) => (i.id in ordem ? { ...i, ordem: ordem[i.id] } : i));
  const porId = new Map(comOrdem.map((i) => [i.id, i]));
  const paiDe = (i: T) => (i.parent_id && ids.has(i.parent_id) ? i.parent_id : null);
  const filhosDe = (pai: string | null, secao?: string) =>
    comOrdem.filter((i) => paiDe(i) === pai && (pai !== null || !secaoDe || secao === undefined || secaoDe(i) === secao)).sort(compararOrdem);

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function soltar(irmaos: T[], e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const de = irmaos.findIndex((i) => i.id === active.id);
    const para = irmaos.findIndex((i) => i.id === over.id);
    if (de < 0 || para < 0) return;
    const novos = moverPara(irmaos.map((i) => i.id), de, para);
    const anterior = ordem;
    setOrdem({ ...ordem, ...Object.fromEntries(novos.map((id, n) => [id, n + 1])) });
    setErro("");
    setSalvo("");
    iniciar(async () => {
      const r = await salvar(novos);
      if (r.erro) {
        setOrdem(anterior);
        setErro(r.erro);
      } else {
        setSalvo("Ordem salva.");
      }
    });
  }

  const arvore: Arvore<T> = { filhosDe: (pai) => filhosDe(pai), soltar, sensores, render, nome: (id) => porId.get(id)?.nome ?? "" };
  const blocos = secoes && secaoDe ? secoes : [{ chave: "", nome: "" }];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-texto-suave">
          {dica ?? "Arraste pela alça para mudar a ordem."} A nova ordem vale nas listas de escolha e nos relatórios e é salva na hora.
        </p>
        <span aria-live="polite" className="text-xs text-texto-suave">{salvando ? "Salvando…" : salvo}</span>
        <Botao type="button" onClick={aoConcluir} className="ml-auto">
          <Check size={16} strokeWidth={1.75} aria-hidden /> Concluir
        </Botao>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {blocos.map((s) => {
        const raiz = filhosDe(null, s.chave || undefined);
        if (raiz.length === 0) return null;
        return (
          <section key={s.chave || "todos"} className="vidro rounded-2xl border border-borda p-2 sm:p-3">
            {s.nome && <h3 className="px-2 pt-1 pb-2 text-xs font-medium text-texto-suave">{s.nome}</h3>}
            <Grupo irmaos={raiz} nivel={0} chave={`${idBase}-${s.chave || "raiz"}`} arvore={arvore} />
          </section>
        );
      })}
    </div>
  );
}

type Arvore<T extends ItemOrdenavel> = {
  filhosDe: (pai: string) => T[];
  soltar: (irmaos: T[], e: DragEndEvent) => void;
  sensores: ReturnType<typeof useSensors>;
  render: (item: T) => ReactNode;
  nome: (id: string) => string;
};

// Um grupo de irmãos: contexto de arrastar próprio, então nada sai do nível.
function Grupo<T extends ItemOrdenavel>({ irmaos, nivel, chave, arvore }: { irmaos: T[]; nivel: number; chave: string; arvore: Arvore<T> }) {
  if (irmaos.length === 0) return null;
  const posicao = (id: string) => irmaos.findIndex((i) => i.id === id) + 1;
  return (
    <DndContext
      id={chave}
      sensors={arvore.sensores}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={(e) => arvore.soltar(irmaos, e)}
      accessibility={{ announcements: anuncios(arvore.nome, posicao), screenReaderInstructions: INSTRUCOES }}
    >
      <SortableContext items={irmaos.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className={`flex flex-col gap-1 ${nivel > 0 ? "mt-1 ml-5 border-l border-linha pl-2 sm:ml-7" : ""}`}>
          {irmaos.map((i) => (
            <ItemArrastavel key={i.id} id={i.id} nome={i.nome} conteudo={arvore.render(i)}>
              <Grupo irmaos={arvore.filhosDe(i.id)} nivel={nivel + 1} chave={`${chave}-${i.id}`} arvore={arvore} />
            </ItemArrastavel>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function ItemArrastavel({ id, nome, conteudo, children }: { id: string; nome: string; conteudo: ReactNode; children?: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative ${isDragging ? "z-10" : ""}`}
    >
      <div
        className={`flex min-h-11 items-center gap-1.5 rounded-xl pr-3 text-sm transition-[background-color,box-shadow] duration-150 ${
          isDragging ? "bg-solido shadow-[var(--sombra)]" : "hover:bg-elevado/60"
        }`}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Mover ${nome}`}
          className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-texto-suave transition-[background-color,transform] duration-150 hover:bg-elevado hover:text-texto active:scale-[0.94] active:cursor-grabbing"
        >
          <GripVertical size={16} strokeWidth={1.75} aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">{conteudo}</div>
      </div>
      {children}
    </li>
  );
}
