"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Barcode,
  Boxes,
  CalendarRange,
  ChartColumn,
  ChartLine,
  ClipboardList,
  CreditCard,
  Fish,
  HandCoins,
  House,
  Landmark,
  Menu,
  ReceiptText,
  Settings,
  ShoppingCart,
  Syringe,
  Wheat,
  X,
  FileText,
  Contact,
  Package,
  PackageOpen,
  BadgeDollarSign,
  Tags,
  FolderTree,
  History,
  Pill,
  Smartphone,
  Store,
  Radar,
  Scale,
  Waves,
  Anchor,
  type LucideIcon,
} from "lucide-react";
import { encontrarModulo } from "@/lib/modulos";
import { estaAtivo } from "@/lib/menu";
import { SeletorVersao } from "@/components/versao";

export const ICONES: Record<string, LucideIcon> = {
  piscicultura: Waves,
  lotes: Fish,
  apontamentos: ClipboardList,
  despescas: Anchor,
  sanidade: Syringe,
  "contas-a-pagar": ReceiptText,
  "contas-a-receber": HandCoins,
  contas: Landmark,
  cobrancas: Barcode,
  cartoes: CreditCard,
  conciliacao: ArrowLeftRight,
  "fluxo-de-caixa": ChartLine,
  relatorios: ChartColumn,
  estoque: Boxes,
  "pontos-de-venda": Store,
  racao: Wheat,
  notas: FileText,
  vendas: ShoppingCart,
  vendedor: Smartphone,
  contatos: Contact,
  produtos: Package,
  insumos: PackageOpen,
  medicamentos: Pill,
  "tabelas-de-preco": BadgeDollarSign,
  categorias: Tags,
  "centros-de-custo": FolderTree,
  planejamento: CalendarRange,
  previsoes: Radar,
  "custo-do-kg": Scale,
  configuracoes: Settings,
  historico: History,
};

// Abas fixas da barra de baixo no celular, na ordem de preferência; entram as três primeiras que o usuário pode ver.
const ABAS_CELULAR = ["apontamentos", "lotes", "vendas", "contas-a-pagar", "planejamento", "estoque"];

// No celular: uma barra fina de vidro no alto com o nome da tela e, embaixo, a barra de abas de vidro do iOS
// (Painel, três módulos e Menu, que abre a lista inteira).
export function NavegacaoMovel({ marca, visiveis, children }: { marca: ReactNode; visiveis: string[]; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const caminho = usePathname();
  const slug = caminho.split("/")[1] ?? "";
  const nomeTela = slug === "painel" ? "Painel" : encontrarModulo(slug)?.nome ?? "";
  const abas = [
    { href: "/painel", nome: "Painel", Icone: House },
    ...ABAS_CELULAR.filter((s) => visiveis.includes(s)).slice(0, 3).map((s) => ({ href: `/${s}`, nome: encontrarModulo(s)?.nome.split(" ")[0] ?? s, Icone: ICONES[s] ?? House })),
  ];

  return (
    <div className="md:hidden">
      <div className="cristal sticky top-0 z-30 flex h-12 items-center justify-between gap-3 rounded-none px-4">
        <Link href="/painel" aria-label="Painel">{marca}</Link>
        <span className="truncate text-sm font-semibold">{nomeTela}</span>
        {/* Celular × versão completa, como o seletor dia/noite. */}
        <SeletorVersao />
      </div>

      <nav aria-label="Atalhos" data-tour="abas" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30">
        <div className="cristal flex items-stretch justify-between rounded-full p-1">
          {abas.map(({ href, nome, Icone }) => {
            const ativo = estaAtivo(caminho, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={ativo ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[10px] font-medium transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.92] ${
                  ativo ? "bg-texto/[0.08] text-marca" : "text-texto/75"
                }`}
              >
                <Icone aria-hidden size={20} strokeWidth={ativo ? 2.25 : 1.75} />
                <span className="max-w-full truncate px-1">{nome}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setAberto(true)}
            aria-label="Abrir menu"
            aria-expanded={aberto}
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[10px] font-medium text-texto/75 transition-transform duration-200 ease-out active:scale-[0.92]"
          >
            <Menu aria-hidden size={20} strokeWidth={1.75} />
            Menu
          </button>
        </div>
      </nav>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!aberto}
        // Fecha ao tocar num link: a navegação acontece e o menu sai do caminho.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setAberto(false);
        }}
        className={`fixed inset-0 z-40 flex flex-col justify-end bg-black/15 transition-opacity duration-300 ease-out ${aberto ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        {/* Cabeçalho fora da rolagem: antes ficava grudado (sticky) e transparente, e a lista passava por baixo
            da marca (o título "Estoque" aparecia atrás do logo). */}
        <div
          className={`cristal mx-2 mb-2 flex max-h-[85dvh] flex-col overflow-hidden rounded-[2rem] transition-transform duration-500 ease-drawer ${
            aberto ? "translate-y-0" : "translate-y-[105%]"
          }`}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-linha px-4">
            {marca}
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar menu"
              className="grid size-9 place-items-center rounded-full bg-texto/[0.08] transition-transform duration-150 active:scale-[0.92]"
            >
              <X size={18} strokeWidth={2} aria-hidden />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-4 pb-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
