"use client";

// Peças visuais das permissões: a escolha de permissões (por grupo, em cápsulas) e a matriz de quem pode o quê.
// Usadas em Usuários e cargos (configurações). Só apresentação: a regra é temPermissao,
// a mesma de app.pode() no banco.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, CircleCheck, CircleDot, Eye, Minus } from "lucide-react";
import { AbasFiltro } from "@/components/cadastro";
import { Cartao } from "@/components/ui";
import { CATALOGO, GRUPOS_CATALOGO, temPermissao, type Acesso, type ModuloPermissao } from "@/lib/permissoes-regras";

const acessoDe = (chaves: string[], total = false): Acesso => ({ master: false, perfil: "personalizado", total, chaves });

// Caixas de permissão avulsa: somam ao cargo escolhido (ou são tudo, no personalizado).
// `herdadas`: chaves que o cargo já dá; aparecem marcadas "pelo cargo" e não vão no formulário.
// `tudo`: master ou acesso total, que podem tudo; as caixas ficam guardadas, mas apagadas.
export function EscolhaPermissoes({
  marcadas = [],
  prefixo,
  titulo = "Permissões extras",
  ajuda,
  herdadas,
  tudo = false,
}: {
  marcadas?: string[];
  prefixo: string;
  titulo?: string;
  ajuda?: string;
  herdadas?: string[];
  tudo?: boolean;
}) {
  const ref = useRef<HTMLFieldSetElement>(null);
  const [marcadasAgora, setMarcadasAgora] = useState(() => new Set(marcadas));
  const contar = useCallback(() => {
    const caixas = ref.current?.querySelectorAll<HTMLInputElement>('input[name="permissoes"]:checked') ?? [];
    setMarcadasAgora(new Set([...caixas].map((c) => c.value)));
  }, []);

  // O formulário que limpa depois de salvar volta as caixas ao início: a contagem acompanha.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const aoLimpar = () => setTimeout(contar, 0);
    form.addEventListener("reset", aoLimpar);
    return () => form.removeEventListener("reset", aoLimpar);
  }, [contar]);

  const doCargo = herdadas ? acessoDe(herdadas) : null;
  const herdada = (chave: string) => Boolean(doCargo && temPermissao(doCargo, chave));
  const extras = [...marcadasAgora].filter((c) => !herdada(c)).length;

  return (
    <fieldset ref={ref} onChange={contar} className="flex min-w-0 flex-col gap-2 text-sm">
      <legend className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium">{titulo}</span>
        {!tudo && <span className="text-xs text-texto-suave tabular-nums">{extras === 0 ? "nenhuma marcada" : `${extras} marcada${extras === 1 ? "" : "s"}`}</span>}
      </legend>
      {ajuda && !tudo && <p className="-mt-1 text-xs text-texto-suave">{ajuda}</p>}
      {tudo && (
        <p className="rounded-xl bg-elevado/60 px-3 py-2 text-xs text-texto-suave">
          Este acesso já pode tudo no sistema; permissões extras não mudam nada enquanto ele estiver assim.
        </p>
      )}
      <div className={`flex flex-col gap-1.5 ${tudo ? "opacity-50" : ""}`}>
        {GRUPOS_CATALOGO.map((g) => {
          const mods = CATALOGO.filter((m) => m.grupo === g);
          const acoes = mods.flatMap((m) => m.acoes);
          const doGrupoHerdadas = acoes.filter((a) => herdada(a.chave)).length;
          const doGrupoExtras = acoes.filter((a) => !herdada(a.chave) && marcadasAgora.has(a.chave)).length;
          const resumo = [doGrupoHerdadas && `${doGrupoHerdadas} pelo cargo`, doGrupoExtras && `${doGrupoExtras} extra${doGrupoExtras === 1 ? "" : "s"}`]
            .filter(Boolean).join(" · ");
          return (
            <details key={g} className="group rounded-xl border border-linha bg-elevado/30 open:bg-elevado/50">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="font-medium">{g}</span>
                <span className="ml-auto text-xs text-texto-suave tabular-nums">{resumo || "nada"}</span>
                <ChevronDown size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-texto-suave transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="flex flex-col divide-y divide-linha border-t border-linha px-3">
                {mods.map((m) => (
                  <div key={m.slug} className="flex flex-col gap-1.5 py-2.5">
                    <span className="text-[13px] text-texto-suave">{m.nome}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {m.acoes.map((a) => (
                        <CapsulaPermissao key={a.chave} id={`${prefixo}-${a.chave}`} chave={a.chave} nome={a.nome}
                          marcada={marcadas.includes(a.chave)} herdada={herdada(a.chave)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </fieldset>
  );
}

function CapsulaPermissao({ id, chave, nome, marcada, herdada }: { id: string; chave: string; nome: string; marcada: boolean; herdada: boolean }) {
  return (
    <>
      {/* A caixa continua na página quando o cargo já dá a permissão (fica escondida e fora do formulário),
          para voltar como estava se o cargo mudar. */}
      <label htmlFor={id} className={`${herdada ? "hidden" : "inline-flex"} min-h-8 cursor-pointer items-center gap-2 rounded-full border border-borda bg-solido/40 px-3 py-1 text-[13px] transition-colors duration-150 hover:bg-elevado has-checked:border-marca has-checked:bg-marca-suave has-checked:text-marca-texto has-focus-visible:outline-2 has-focus-visible:outline-marca`}>
        <input type="checkbox" name="permissoes" value={chave} id={id} defaultChecked={marcada} disabled={herdada} className="size-3.5 accent-[var(--marca)]" />
        {nome}
      </label>
      {herdada && (
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-dashed border-borda px-3 py-1 text-[13px] text-texto-suave" title="O cargo já dá esta permissão">
          <Check size={14} strokeWidth={2} aria-hidden /> {nome} <span className="text-xs">· pelo cargo</span>
        </span>
      )}
    </>
  );
}

export type ColunaMatriz = { chave: string; nome: string; detalhe?: string; acesso: Acesso };

type Nivel = "tudo" | "parte" | "ver" | "nada";

// Resumo de um módulo para uma coluna: todas as ações, parte delas, só ver ou nada.
export function nivelDoModulo(acesso: Acesso, m: ModuloPermissao): Nivel {
  const tem = m.acoes.map((a) => temPermissao(acesso, a.chave));
  if (tem.every(Boolean)) return "tudo";
  const lanca = m.acoes.some((a, i) => tem[i] && !a.chave.endsWith(".ver"));
  if (lanca) return "parte";
  return tem.some(Boolean) ? "ver" : "nada";
}

const NIVEIS: Record<Nivel, { nome: string; icone: ReactNode }> = {
  tudo: { nome: "Pode tudo no módulo", icone: <CircleCheck size={17} strokeWidth={1.9} aria-hidden className="text-positivo" /> },
  parte: { nome: "Pode parte das ações", icone: <CircleDot size={17} strokeWidth={1.9} aria-hidden className="text-marca" /> },
  ver: { nome: "Só vê", icone: <Eye size={17} strokeWidth={1.75} aria-hidden className="text-texto-suave" /> },
  nada: { nome: "Sem acesso", icone: <Minus size={15} strokeWidth={1.75} aria-hidden className="text-texto-suave/50" /> },
};

function Legenda() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-texto-suave">
      {(Object.keys(NIVEIS) as Nivel[]).map((n) => (
        <li key={n} className="inline-flex items-center gap-1.5">{NIVEIS[n].icone}{NIVEIS[n].nome}</li>
      ))}
    </ul>
  );
}

const CELULA_FIXA = "sticky left-0 z-[1] bg-solido";

export function MatrizPermissoes({ colunas, titulo = "O que cada cargo pode fazer", explicacao }: { colunas: ColunaMatriz[]; titulo?: string; explicacao?: string }) {
  const [modo, setModo] = useState<"modulo" | "acao">("modulo");
  const total = colunas.length + 1;
  return (
    <Cartao titulo={titulo}>
      <p className="mb-4 max-w-[75ch] text-sm text-texto-suave">
        {explicacao ?? "O master e o cargo Acesso total podem tudo; só o master gerencia usuários e cargos. Permissões extras marcadas num usuário somam ao cargo dele."}
        {" "}O banco de dados aplica as mesmas regras: sem a permissão, o lançamento é recusado mesmo fora desta tela.
      </p>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <AbasFiltro rotulo="Detalhe" valor={modo} aoMudar={setModo}
          opcoes={[{ valor: "modulo", nome: "Por módulo" }, { valor: "acao", nome: "Cada ação" }]} />
        {modo === "modulo" && <Legenda />}
      </div>
      <div className="relative max-h-[70vh] overflow-auto rounded-xl border border-linha">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-[2] text-left text-[13px] text-texto-suave">
            <tr>
              <th scope="col" className={`${CELULA_FIXA} z-[3] min-w-48 border-b border-linha px-3 py-2.5 font-medium`}>Módulo</th>
              {colunas.map((col) => (
                <th key={col.chave} scope="col" className="min-w-24 border-b border-linha bg-solido px-2 py-2.5 text-center align-bottom font-medium">
                  <span className="block leading-tight text-texto">{col.nome}</span>
                  {col.detalhe && <span className="block text-xs font-normal">{col.detalhe}</span>}
                </th>
              ))}
            </tr>
          </thead>
          {GRUPOS_CATALOGO.map((g) => (
            <tbody key={g}>
              <tr>
                <th colSpan={total} scope="colgroup" className="border-b border-linha bg-elevado px-3 py-1.5 text-left text-xs font-semibold tracking-wide text-texto-suave uppercase">
                  <span className="sticky left-3">{g}</span>
                </th>
              </tr>
              {CATALOGO.filter((m) => m.grupo === g).flatMap((m) =>
                modo === "modulo" ? (
                  <tr key={m.slug} className="hover:bg-elevado/40">
                    <th scope="row" className={`${CELULA_FIXA} border-b border-linha px-3 py-2 text-left font-normal`}>{m.nome}</th>
                    {colunas.map((col) => {
                      const n = nivelDoModulo(col.acesso, m);
                      const quais = m.acoes.filter((a) => temPermissao(col.acesso, a.chave)).map((a) => a.nome).join(", ");
                      return (
                        <td key={col.chave} className="border-b border-linha px-2 py-2 text-center" title={`${col.nome} · ${m.nome}: ${quais || "sem acesso"}`}>
                          <span className="inline-grid place-items-center">{NIVEIS[n].icone}</span>
                          <span className="sr-only">{NIVEIS[n].nome}</span>
                        </td>
                      );
                    })}
                  </tr>
                ) : m.acoes.map((a, i) => (
                  <tr key={a.chave} className="hover:bg-elevado/40">
                    <th scope="row" className={`${CELULA_FIXA} border-b border-linha px-3 py-1.5 text-left font-normal`}>
                      {i === 0 ? <span>{m.nome}</span> : <span className="sr-only">{m.nome}</span>}
                      <span className={`block text-[13px] text-texto-suave ${i === 0 ? "" : "pl-0"}`}>{a.nome}</span>
                    </th>
                    {colunas.map((col) => {
                      const pode = temPermissao(col.acesso, a.chave);
                      return (
                        <td key={col.chave} className="border-b border-linha px-2 py-1.5 text-center">
                          {pode ? <Check size={16} strokeWidth={2.25} aria-label="pode" className="mx-auto text-positivo" />
                            : <Minus size={14} strokeWidth={1.75} aria-label="não pode" className="mx-auto text-texto-suave/50" />}
                        </td>
                      );
                    })}
                  </tr>
                )),
              )}
            </tbody>
          ))}
        </table>
      </div>
    </Cartao>
  );
}
