"use client";

import { createPortal } from "react-dom";
import { useActionState, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Search, X } from "lucide-react";
import { PainelLateral, SecaoForm } from "@/components/cadastro";
import { FormAcao } from "@/components/form-acao";
import { Aviso, Botao, Campo, classeBotao, CLASSE_CONTROLE, Etiqueta, Selecao, Vazio, type TomEtiqueta } from "@/components/ui";
import { RotulosCelular } from "@/components/tabela-celular";
import type { EstadoAcao } from "@/lib/acao";
import { centavosParaCampo, formatarData, formatarMoeda, semAcento } from "@/lib/formato";
import { CONFIG_TITULO, FORMAS_PAGAMENTO, type TipoTitulo } from "@/lib/titulos";
import { Rateio, type LinhaInicial } from "@/components/rateio";
import { acaoEmLote, baixarTitulo, duplicarTitulo, editarTitulo, estornarBaixa, lerRateioTitulo, ratearTitulo } from "./actions";

// Lista de contas no jeito do NIBO: busca na hora, seleção com barra de ações em lote,
// clique na linha abre o painel para editar, duplicar, estornar, marcar perda ou excluir.

export type LinhaTitulo = {
  id: string;
  vencimento: string;
  competencia: string;
  descricao: string;
  referencia: string | null;
  parcela_numero: number | null;
  parcela_total: number | null;
  recorrencia_id: string | null;
  origem: string;
  contato_id: string | null;
  contato_nome: string | null;
  categorias: string | null;
  centros_custo: string | null;
  forma_pagamento: string | null;
  valor_cents: number;
  pago_cents: number;
  saldo_cents: number;
  situacao: string;
  status: string;
};

type Opcao = { id: string; nome: string; grupo?: string };
type Acao = (estado: EstadoAcao, form: FormData) => Promise<EstadoAcao>;

const ABERTAS = ["aberto", "parcial", "vencido"];
const TOM_SITUACAO: Record<string, TomEtiqueta> = { aberto: "neutro", parcial: "info", vencido: "perigo", quitado: "positivo", perda: "alerta", cancelado: "neutro" };
const POPOVER = "popover absolute z-30 w-72 vidro rounded-2xl border border-borda p-4 shadow-[0_8px_24px_-6px_rgb(0_0_0/0.16)]";

function emAberto(t: LinhaTitulo) {
  return ABERTAS.includes(t.situacao) && Number(t.saldo_cents) > 0;
}

function OpcoesForma() {
  return (
    <>
      <option value="">Não informada</option>
      {Object.entries(FORMAS_PAGAMENTO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
    </>
  );
}

// Um botão que dispara uma server action e avisa o resultado para quem chamou.
function BotaoAcao({ acao, campos, rotulo, variante = "secundario", aoConcluir, confirmar, children }: {
  acao: Acao;
  campos: Record<string, string | string[]>;
  rotulo: string;
  variante?: "primario" | "secundario" | "fantasma" | "perigo";
  aoConcluir: (mensagem?: string) => void;
  confirmar?: string;
  children?: ReactNode;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => {
    if (estado.versao) aoConcluir(estado.ok);
  }, [estado.versao]); // eslint-disable-line react-hooks/exhaustive-deps

  const ocultos = Object.entries(campos).flatMap(([nome, valor]) =>
    (Array.isArray(valor) ? valor : [valor]).map((v, i) => <input key={`${nome}-${i}`} type="hidden" name={nome} value={v} />));

  return (
    <form action={enviar} className="flex flex-col gap-2">
      {ocultos}
      {children}
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {confirmar && confirmando ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm">{confirmar}</p>
          <Botao type="button" variante="fantasma" tamanho="sm" onClick={() => setConfirmando(false)}>Voltar</Botao>
          <Botao type="submit" variante={variante} tamanho="sm" disabled={pendente}>{pendente ? "Aguarde…" : "Confirmar"}</Botao>
        </div>
      ) : (
        <Botao type={confirmar ? "button" : "submit"} variante={variante} tamanho="sm" disabled={pendente} className="self-start"
          onClick={confirmar ? () => setConfirmando(true) : undefined}>
          {pendente ? "Aguarde…" : rotulo}
        </Botao>
      )}
    </form>
  );
}

// Popover simples que fecha com Esc ou clique fora. Na barra de seleção (`naBarra`) abre acima dela, preso à barra.
function Pop({ rotulo, children, naBarra = false, variante = "secundario" }: {
  rotulo: ReactNode; children: ReactNode; naBarra?: boolean; variante?: "primario" | "secundario" | "fantasma" | "perigo";
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    const fora = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fora);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fora);
    };
  }, [aberto]);
  return (
    <div ref={ref} className={naBarra ? "" : "relative"} onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} className={classeBotao(variante, "sm")}>{rotulo}</button>
      {aberto && <div className={`${POPOVER} ${naBarra ? "right-3 bottom-full mb-2" : "right-0 top-full mt-2"}`}>{children}</div>}
    </div>
  );
}

export function ListaTitulos({ tipo, titulos, contas, contatos, categorias, centros, hoje, situacao, podeEditar }: {
  tipo: TipoTitulo;
  categorias: Opcao[];
  centros: Opcao[];
  titulos: LinhaTitulo[];
  contas: Opcao[];
  contatos: Opcao[];
  hoje: string;
  situacao: string;
  podeEditar: boolean;
}) {
  const config = CONFIG_TITULO[tipo];
  const [busca, setBusca] = useState("");
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<LinhaTitulo | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [aviso, setAviso] = useState("");
  const idBusca = useId();

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const termo = semAcento(busca);
  const filtrados = useMemo(() => termo
    ? titulos.filter((t) => semAcento([t.descricao, t.contato_nome, t.referencia, t.categorias, t.centros_custo, centavosParaCampo(Number(t.valor_cents))].join(" ")).includes(termo))
    : titulos, [titulos, termo]);

  const selecionados = filtrados.filter((t) => selecao.has(t.id));
  const todosMarcados = filtrados.length > 0 && selecionados.length === filtrados.length;
  const somaSelecao = selecionados.reduce((s, t) => s + Number(t.saldo_cents), 0);
  const ids = selecionados.map((t) => t.id);
  const lixeira = situacao === "cancelado";

  function alternar(id: string) {
    setSelecao((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function abrir(t: LinhaTitulo) {
    setAberto(t);
    setVisivel(true);
  }

  const fechar = useCallback((mensagem?: string) => {
    setVisivel(false);
    if (mensagem) setAviso(mensagem);
  }, []);
  const fecharSemAviso = useCallback(() => fechar(), [fechar]);
  const concluirLote = useCallback((mensagem?: string) => {
    setSelecao(new Set());
    if (mensagem) setAviso(mensagem);
  }, []);

  // Excel com o visual do Balbina; a biblioteca só carrega no clique
  async function exportar() {
    const { abaTitulos, planilhaXlsx } = await import("@/lib/planilha");
    const aba = abaTitulos(tipo, filtrados, {
      titulo: `Balbina · ${config.titulo}`,
      subtitulo: `${filtrados.length} ${filtrados.length === 1 ? "conta" : "contas"}${busca ? ` · busca "${busca}"` : ""} · valores em R$`,
      nota: `Gerado pelo Balbina em ${formatarData(hoje)}`,
    });
    const blob = new Blob([await planilhaXlsx([aba], config.titulo)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.rota.slice(1)}-${hoje}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const rotuloSituacao: Record<string, string> = {
    aberto: "Em aberto", parcial: "Parcial", vencido: config.vencida, quitado: config.quitada, perda: "Perda", cancelado: "Excluída",
  };
  const totalValor = filtrados.reduce((s, t) => s + Number(t.valor_cents), 0);
  const totalSaldo = filtrados.reduce((s, t) => s + (["cancelado", "perda"].includes(t.status) ? 0 : Number(t.saldo_cents)), 0);
  const colunas = 10 + (podeEditar ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={idBusca} data-tour="busca" className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar</span>
          <Search size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-texto-suave" />
          <input id={idBusca} type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder={`Buscar descrição, ${config.contato.toLowerCase()}, documento ou valor`} className={`h-10 w-full pl-9 ${CLASSE_CONTROLE}`} />
        </label>
        <Botao type="button" variante="secundario" tamanho="sm" onClick={exportar} disabled={filtrados.length === 0} className="ml-auto">
          <Download size={15} strokeWidth={1.75} aria-hidden /> Exportar Excel
        </Botao>
      </div>

      {filtrados.length === 0 ? (
        <Vazio>{termo ? `Nada encontrado para “${busca.trim()}”.` : lixeira ? "A lixeira está vazia." : "Nenhuma conta com esse filtro."}</Vazio>
      ) : (
        <div data-tour="lista" className="tabela-cartoes relative vidro overflow-x-auto rounded-2xl border border-borda">
          {/* No celular: cartão com a descrição no título; categoria, centro de custo e valor original ficam na tabela. */}
          <RotulosCelular principal={(podeEditar ? 1 : 0) + 1} ocultar={[3, 4, 5].map((i) => i + (podeEditar ? 1 : 0))} />
          <table className="w-full text-sm">
            <thead className="border-b border-linha text-left text-[13px] text-texto-suave">
              <tr>
                {podeEditar && (
                  <th scope="col" className="w-10 pl-4">
                    <input type="checkbox" aria-label="Selecionar todas" checked={todosMarcados} className="size-4 accent-[var(--marca)]"
                      onChange={() => setSelecao(todosMarcados ? new Set() : new Set(filtrados.map((t) => t.id)))} />
                  </th>
                )}
                {["Vencimento", "Descrição", config.contato, "Categoria", "Centro de custo", "Valor", "Saldo", "Situação"].map((c) => (
                  <th key={c} scope="col" className={`h-10 whitespace-nowrap px-4 font-medium ${c === "Valor" || c === "Saldo" ? "text-right" : ""}`}>{c}</th>
                ))}
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {filtrados.map((t) => {
                const marcado = selecao.has(t.id);
                const venceHoje = t.vencimento === hoje && emAberto(t);
                return (
                  <tr key={t.id} onClick={() => abrir(t)}
                    className={`cursor-pointer transition-colors duration-150 hover:bg-elevado/50 ${marcado ? "bg-marca/10" : ""} ${t.status === "cancelado" ? "text-texto-suave" : ""}`}>
                    {podeEditar && (
                      <td className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Selecionar ${t.descricao}`} checked={marcado} onChange={() => alternar(t.id)} className="size-4 accent-[var(--marca)]" />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                      {formatarData(t.vencimento)}
                      {venceHoje && <Etiqueta tom="alerta" className="ml-1.5">Hoje</Etiqueta>}
                    </td>
                    <td className="px-4 py-2.5">
                      {t.descricao}
                      {t.parcela_total && <span className="text-texto-suave"> ({t.parcela_numero}/{t.parcela_total})</span>}
                      {t.recorrencia_id && <span className="text-texto-suave" title="Recorrente"> ↻</span>}
                      {t.referencia && <span className="block text-xs text-texto-suave">{t.referencia}</span>}
                    </td>
                    <td className="px-4 py-2.5">{t.contato_nome ?? "–"}</td>
                    <td className="px-4 py-2.5 text-[13px] text-texto-suave">{t.categorias}</td>
                    <td className="px-4 py-2.5 text-[13px] text-texto-suave">{t.centros_custo ?? "–"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-texto-suave">{formatarMoeda(t.valor_cents)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums">{formatarMoeda(t.saldo_cents)}</td>
                    <td className="px-4 py-2.5"><Etiqueta tom={TOM_SITUACAO[t.situacao] ?? "neutro"}>{rotuloSituacao[t.situacao] ?? t.situacao}</Etiqueta></td>
                    <td className="px-4 py-1.5 text-right">
                      {podeEditar && emAberto(t) && (
                        <Pop rotulo={config.baixa}>
                          <FormAcao acao={baixarTitulo} botao={config.registrarBaixa}>
                            <input type="hidden" name="tipo" value={tipo} />
                            <input type="hidden" name="agendamento_id" value={t.id} />
                            <Selecao rotulo="Conta" id={`conta_${t.id}`} name="conta_id" required>
                              {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                            </Selecao>
                            <Campo rotulo="Data" id={`data_${t.id}`} name="data" type="date" defaultValue={hoje} required />
                            <Campo rotulo="Valor (R$)" id={`valor_${t.id}`} name="valor" inputMode="decimal" defaultValue={centavosParaCampo(Number(t.saldo_cents))} required />
                            <Campo rotulo="Juros e multa (R$)" id={`juros_${t.id}`} name="juros" inputMode="decimal" placeholder="0,00" />
                            <Campo rotulo="Desconto (R$)" id={`desconto_${t.id}`} name="desconto" inputMode="decimal" placeholder="0,00" />
                          </FormAcao>
                        </Pop>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-linha text-[13px]">
              <tr>
                <td colSpan={colunas - 4} className="px-4 py-2.5 text-texto-suave">
                  {termo ? `${filtrados.length} de ${titulos.length} contas` : `${filtrados.length} ${filtrados.length === 1 ? "conta" : "contas"}`}
                  {titulos.length >= 500 && " (mostrando as 500 primeiras; use o filtro de mês)"}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-texto-suave">{formatarMoeda(totalValor)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">{formatarMoeda(totalSaldo)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Barra de ações em lote: aparece quando há contas marcadas */}
      {podeEditar && selecionados.length > 0 && createPortal(
        <div role="region" aria-label="Ações nas contas selecionadas"
          className="popover fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-[1.75rem] border border-borda cristal bg-solido/80 px-4 py-2.5 shadow-[var(--sombra)] md:bottom-6">
          <span className="mr-auto text-sm">
            <span className="font-semibold">{selecionados.length}</span> {selecionados.length === 1 ? "selecionada" : "selecionadas"}
            <span className="text-texto-suave"> · saldo {formatarMoeda(somaSelecao)}</span>
          </span>
          {lixeira ? (
            <BotaoAcao acao={acaoEmLote} campos={{ tipo, acao: "restaurar", ids }} rotulo="Restaurar" variante="primario" aoConcluir={concluirLote} />
          ) : (
            <>
              <Pop rotulo={config.baixa} variante="primario" naBarra>
                <BotaoAcao acao={acaoEmLote} campos={{ tipo, acao: "baixar", ids }} rotulo={`${config.registrarBaixa} total`} variante="primario" aoConcluir={concluirLote}>
                  <Selecao rotulo="Conta" id="lote_conta" name="conta_id" required>
                    {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </Selecao>
                  <Campo rotulo="Data" id="lote_data" name="data" type="date" defaultValue={hoje} required />
                  <p className="text-xs text-texto-suave">Cada conta recebe a baixa do saldo inteiro. Para juros ou desconto, baixe uma a uma.</p>
                </BotaoAcao>
              </Pop>
              <Pop rotulo="Novo vencimento" naBarra>
                <BotaoAcao acao={acaoEmLote} campos={{ tipo, acao: "reprogramar", ids }} rotulo="Alterar vencimento" aoConcluir={concluirLote}>
                  <Campo rotulo="Vencimento" id="lote_vencimento" name="vencimento" type="date" defaultValue={hoje} required />
                </BotaoAcao>
              </Pop>
              {tipo === "receber" && (
                <Pop rotulo="Perda" naBarra>
                  <BotaoAcao acao={acaoEmLote} campos={{ tipo, acao: "perda", ids }} rotulo="Marcar como perda" variante="perigo" aoConcluir={concluirLote}
                    confirmar="Tirar do em aberto?">
                    <p className="text-sm text-texto-suave">O valor que falta sai do contas a receber sem virar caixa. Dá para desfazer no filtro Perdas.</p>
                  </BotaoAcao>
                </Pop>
              )}
              <Pop rotulo="Excluir" variante="perigo" naBarra>
                <BotaoAcao acao={acaoEmLote} campos={{ tipo, acao: "excluir", ids }} rotulo={`Excluir ${selecionados.length}`} variante="perigo" aoConcluir={concluirLote}>
                  <p className="text-sm text-texto-suave">As contas vão para a lixeira (filtro Excluídas), de onde dá para restaurar.</p>
                </BotaoAcao>
              </Pop>
            </>
          )}
          <button type="button" aria-label="Limpar seleção" onClick={() => setSelecao(new Set())}
            className="grid size-8 place-items-center rounded-full bg-texto/[0.06] text-texto-suave transition-[background-color,transform] duration-150 hover:bg-texto/10 hover:text-texto active:scale-[0.94]">
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>,
        document.body,
      )}

      {/* Fora da árvore da página: a animação de entrada (.cascata) prende "fixed" dentro do bloco. */}
      {aberto && createPortal(
        <PainelLateral aberto={visivel} titulo={aberto.descricao} aoFechar={fecharSemAviso}>
          <PainelTitulo key={`${aberto.id}-${visivel}`} t={aberto} tipo={tipo} contatos={contatos} categorias={categorias} centros={centros} hoje={hoje} podeEditar={podeEditar}
            rotuloSituacao={rotuloSituacao[aberto.situacao] ?? aberto.situacao} aoConcluir={fechar} />
        </PainelLateral>,
        document.body,
      )}

      {aviso && createPortal(
        <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] md:bottom-24">
          <p className="popover rounded-xl border border-borda bg-solido px-4 py-2.5 text-sm shadow-[var(--sombra)]">{aviso}</p>
        </div>,
        document.body,
      )}
    </div>
  );
}

// Painel lateral de uma conta: editar e as ações que valem para a situação dela.
function PainelTitulo({ t, tipo, contatos, categorias, centros, hoje, podeEditar, rotuloSituacao, aoConcluir }: {
  t: LinhaTitulo;
  tipo: TipoTitulo;
  contatos: Opcao[];
  categorias: Opcao[];
  centros: Opcao[];
  hoje: string;
  podeEditar: boolean;
  rotuloSituacao: string;
  aoConcluir: (mensagem?: string) => void;
}) {
  const config = CONFIG_TITULO[tipo];
  const [estado, enviar, salvando] = useActionState(editarTitulo, {});
  const idForm = useId();
  useEffect(() => {
    if (estado.versao) aoConcluir(estado.ok);
  }, [estado.versao]); // eslint-disable-line react-hooks/exhaustive-deps

  const inativo = t.status === "cancelado" || t.status === "perda";
  const editavel = podeEditar && !inativo;
  const pago = Number(t.pago_cents) > 0;
  const deVenda = t.origem === "pedido_venda";
  const proximoMes = (() => {
    const [a, m, d] = t.vencimento.split("-").map(Number);
    const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(a, m, Math.min(d, ultimo))).toISOString().slice(0, 10);
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Etiqueta tom={TOM_SITUACAO[t.situacao] ?? "neutro"}>{rotuloSituacao}</Etiqueta>
          <span className="text-texto-suave">Valor {formatarMoeda(t.valor_cents)} · {tipo === "pagar" ? "pago" : "recebido"} {formatarMoeda(t.pago_cents)} · saldo {formatarMoeda(t.saldo_cents)}</span>
        </div>

        <form id={idForm} action={enviar} className="contents">
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="id" value={t.id} />
          <fieldset disabled={!editavel} className="flex min-w-0 flex-col gap-3">
            <Campo rotulo="Descrição" id="ed_descricao" name="descricao" defaultValue={t.descricao} required />
            <Selecao rotulo={config.contato} id="ed_contato" name="contato_id" defaultValue={t.contato_id ?? ""}>
              <option value="">Sem {config.contato.toLowerCase()}</option>
              {contatos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo rotulo="Vencimento" id="ed_vencimento" name="vencimento" type="date" defaultValue={t.vencimento} required />
              <Campo rotulo="Competência" id="ed_competencia" name="competencia" type="month" defaultValue={t.competencia.slice(0, 7)} />
              <Campo rotulo="Valor (R$)" id="ed_valor" name="valor" inputMode="decimal" defaultValue={centavosParaCampo(Number(t.valor_cents))}
                disabled={pago || deVenda} ajuda={pago ? "estorne para mudar" : undefined} />
              <Selecao rotulo="Forma de pagamento" id="ed_forma" name="forma_pagamento" defaultValue={t.forma_pagamento ?? ""}>
                <OpcoesForma />
              </Selecao>
            </div>
            <Campo rotulo="Nº do documento" id="ed_referencia" name="referencia" defaultValue={t.referencia ?? ""} placeholder="NF, boleto…" />
            <p className="text-xs text-texto-suave">Categoria: {t.categorias ?? "–"}{t.centros_custo ? ` · centro de custo: ${t.centros_custo}` : ""}</p>
          </fieldset>
        </form>

        {podeEditar && (
          <SecaoForm titulo="Mais ações">
            {!inativo && <TrocarRateio t={t} tipo={tipo} categorias={categorias} centros={centros} aoConcluir={aoConcluir} />}
            {!inativo && (
              <BotaoAcao acao={duplicarTitulo} campos={{ tipo, id: t.id }} rotulo="Duplicar" aoConcluir={aoConcluir}>
                <Campo rotulo="Vencimento da cópia" id="dup_vencimento" name="vencimento_copia" type="date" defaultValue={proximoMes} required />
              </BotaoAcao>
            )}
            {pago && !inativo && (
              <BotaoAcao acao={estornarBaixa} campos={{ tipo, id: t.id }} rotulo={tipo === "pagar" ? "Estornar pagamento" : "Estornar recebimento"}
                aoConcluir={aoConcluir} confirmar="Apagar as baixas desta conta?" variante="perigo" />
            )}
            {tipo === "receber" && emAberto(t) && (
              <BotaoAcao acao={acaoEmLote} campos={{ tipo, acao: "perda", ids: [t.id] }} rotulo="Marcar como perda" variante="perigo"
                aoConcluir={aoConcluir} confirmar="Tirar o saldo do em aberto?" />
            )}
            {inativo && !deVenda && (
              <BotaoAcao acao={acaoEmLote} campos={{ tipo, acao: "restaurar", ids: [t.id] }} rotulo="Restaurar" variante="primario" aoConcluir={aoConcluir} />
            )}
            {!inativo && !pago && !deVenda && (
              <BotaoAcao acao={acaoEmLote} campos={{ tipo, acao: "excluir", ids: [t.id] }} rotulo="Excluir" variante="perigo"
                aoConcluir={aoConcluir} confirmar="Mandar para a lixeira?" />
            )}
            {deVenda && <p className="text-xs text-texto-suave">Conta gerada por uma venda: para cancelar, cancele a venda em Vendas.</p>}
          </SecaoForm>
        )}
        {t.vencimento < hoje && emAberto(t) && (
          <p className="text-xs text-texto-suave">Vencida há {Math.round((Date.parse(hoje) - Date.parse(t.vencimento)) / 864e5)} dia(s).</p>
        )}
      </div>
      <footer className="flex flex-col gap-3 border-t border-linha px-5 py-3">
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        <div className="flex items-center gap-2">
          {editavel && <Botao type="submit" form={idForm} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Botao>}
          <Botao type="button" variante="fantasma" onClick={() => aoConcluir()}>{editavel ? "Cancelar" : "Fechar"}</Botao>
        </div>
      </footer>
    </div>
  );
}

// Troca as categorias e centros de custo do título, dividindo o valor em várias linhas se quiser.
// Vale mesmo pago ou conciliado: o caixa não muda, só a classificação no DRE e no custo do kg.
function TrocarRateio({ t, tipo, categorias, centros, aoConcluir }: {
  t: LinhaTitulo; tipo: TipoTitulo; categorias: Opcao[]; centros: Opcao[]; aoConcluir: (mensagem?: string) => void;
}) {
  const [linhas, setLinhas] = useState<LinhaInicial[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  if (!linhas) {
    return (
      <Botao type="button" variante="secundario" tamanho="sm" className="self-start" disabled={carregando}
        onClick={async () => { setCarregando(true); setLinhas(await lerRateioTitulo(t.id)); setCarregando(false); }}>
        {carregando ? "Abrindo…" : "Mudar categorias ou dividir o valor"}
      </Botao>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-borda bg-elevado/40 p-3">
      <p className="text-xs text-texto-suave">O total de {formatarMoeda(t.valor_cents)} continua o mesmo; muda só como ele aparece no DRE e no custo do kg.</p>
      <BotaoAcao acao={ratearTitulo} campos={{ tipo, id: t.id }} rotulo="Salvar rateio" variante="primario" aoConcluir={aoConcluir}>
        <Rateio prefixo={`tr_${t.id}`} categorias={categorias} centros={centros} total={Number(t.valor_cents)} inicial={linhas} />
      </BotaoAcao>
      <Botao type="button" variante="fantasma" tamanho="sm" className="self-start" onClick={() => setLinhas(null)}>Cancelar</Botao>
    </div>
  );
}
