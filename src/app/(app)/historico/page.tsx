import Link from "next/link";
import { Botao, Campo, CLASSE_CONTROLE, CLASSE_BOTAO_TEXTO, Etiqueta, LinkBotao, Segmentos, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { somarDias } from "@/lib/formato";
import {
  ACOES, OPCOES_TABELA, detalhesAlteracao, formatarDataHora, formatarValorCampo, inicioDoDia, nomeCampo, nomeTabela, type Acao, type Registro,
} from "@/lib/historico";
import { exigirAcesso } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

const POR_PAGINA = 50;

type Linha = Registro & { id: number; user_id: string | null; usuario: string | null; tabela: string; resumo: string | null; created_at: string };

const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");
const dataValida = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

function Quem({ r }: { r: Linha }) {
  if (r.user_id) return <>{r.usuario ?? "Usuário removido"}</>;
  // sem usuário: rotina do sistema ou integração pela API ("API: <nome da chave>")
  return <span className="text-texto-suave">{r.usuario ?? "Sistema"}</span>;
}

function Detalhes({ r }: { r: Linha }) {
  const linhas = detalhesAlteracao(r);
  if (linhas.length === 0) return <span className="text-texto-suave">–</span>;
  const resumo = r.acao === "update" ? linhas.map((l) => nomeCampo(l.campo)).join(", ") : `${linhas.length} campos`;
  return (
    <details className="max-w-md">
      <summary className="cursor-pointer list-none text-texto-suave hover:text-texto">
        <span className={CLASSE_BOTAO_TEXTO}>{resumo}</span>
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        {linhas.map((l) => (
          <div key={l.campo} className="contents">
            <dt className="text-texto-suave">{nomeCampo(l.campo)}</dt>
            <dd className="min-w-0 break-words">
              {r.acao === "update" ? (
                <>
                  <span className="text-texto-suave line-through">{formatarValorCampo(l.campo, l.antes)}</span>
                  {" → "}
                  <span className="font-medium">{formatarValorCampo(l.campo, l.depois)}</span>
                </>
              ) : (
                formatarValorCampo(l.campo, r.acao === "insert" ? l.depois : l.antes)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export default async function PaginaHistorico({ searchParams }: PageProps<"/historico">) {
  await exigirAcesso("historico");
  const filtros = await searchParams;
  const acao = (["insert", "update", "delete"] as const).find((a) => a === filtros.acao);
  const usuario = texto(filtros.usuario);
  const tabela = OPCOES_TABELA.some((t) => t.valor === filtros.tabela) ? texto(filtros.tabela) : "";
  const de = dataValida(texto(filtros.de));
  const ate = dataValida(texto(filtros.ate));
  const busca = texto(filtros.q);
  const pagina = Math.max(1, Math.floor(Number(texto(filtros.pagina))) || 1);

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();

  // Uma linha a mais só para saber se existe a próxima página
  let consulta = supabase.from("audit_log")
    .select("id, user_id, usuario, tabela, acao, resumo, campos, antes, depois, created_at")
    .eq("empresa_id", atual.id)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  if (acao) consulta = consulta.eq("acao", acao);
  if (usuario === "sistema") consulta = consulta.is("user_id", null);
  else if (usuario) consulta = consulta.eq("user_id", usuario);
  if (tabela) consulta = consulta.eq("tabela", tabela);
  if (de) consulta = consulta.gte("created_at", inicioDoDia(de, atual.fuso));
  if (ate) consulta = consulta.lt("created_at", inicioDoDia(somarDias(ate, 1), atual.fuso));
  if (busca) consulta = consulta.ilike("resumo", `%${busca.replace(/[%_\\]/g, "\\$&")}%`);

  const [{ data, error }, { data: membros }] = await Promise.all([
    consulta.returns<Linha[]>(),
    supabase.from("usuarios_empresa").select("user_id, email").eq("empresa_id", atual.id).order("email"),
  ]);
  const lista = (data ?? []).slice(0, POR_PAGINA);
  const temProxima = (data ?? []).length > POR_PAGINA;

  const link = (mudar: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    const todos = { acao, usuario, tabela, de, ate, q: busca, pagina: undefined as number | undefined, ...mudar };
    for (const [k, v] of Object.entries(todos)) if (v) q.set(k, String(v));
    return `/historico${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <Titulo descricao="Toda inclusão, edição e exclusão fica registrada aqui com quem fez e quando. Ninguém consegue apagar ou mudar este histórico.">
        Histórico de alterações
      </Titulo>

      <Segmentos
        rotulo="Tipo de alteração"
        opcoes={[
          { href: link({ acao: undefined }), nome: "Tudo", ativo: !acao },
          ...(Object.keys(ACOES) as Acao[]).map((a) => ({ href: link({ acao: a }), nome: ACOES[a].filtro, ativo: acao === a })),
        ]}
      />

      <form action="/historico" className="vidro grid gap-3 rounded-2xl border border-borda p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_minmax(0,1fr)_auto] lg:items-end">
        {acao && <input type="hidden" name="acao" value={acao} />}
        <Selecao id="usuario" name="usuario" rotulo="Quem" defaultValue={usuario}>
          <option value="">Todos</option>
          {(membros ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{m.email ?? m.user_id}</option>)}
          <option value="sistema">Sistema (automático)</option>
        </Selecao>
        <Selecao id="tabela" name="tabela" rotulo="Onde" defaultValue={tabela}>
          <option value="">Todas as telas</option>
          {OPCOES_TABELA.map((t) => <option key={t.valor} value={t.valor}>{t.nome}</option>)}
        </Selecao>
        <Campo id="de" name="de" type="date" rotulo="De" defaultValue={de} />
        <Campo id="ate" name="ate" type="date" rotulo="Até" defaultValue={ate} />
        <label htmlFor="q" className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-texto">Registro</span>
          <input id="q" name="q" type="search" defaultValue={busca} placeholder="Nome, descrição, número…" className={`h-10 ${CLASSE_CONTROLE}`} />
        </label>
        <div className="flex gap-2">
          <Botao type="submit" variante="secundario">Filtrar</Botao>
          {(usuario || tabela || de || ate || busca) && <LinkBotao href={link({ usuario: undefined, tabela: undefined, de: undefined, ate: undefined, q: undefined })} variante="fantasma">Limpar</LinkBotao>}
        </div>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-perigo">Não foi possível carregar o histórico.</p>
      ) : (
        <>
          {/* No celular, um cartão por alteração; a tabela fica para telas largas */}
          {lista.length > 0 && (
            <ul className="flex flex-col gap-2 md:hidden">
              {lista.map((r) => (
                <li key={r.id} className="vidro flex flex-col gap-1.5 rounded-2xl border border-borda p-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Etiqueta tom={ACOES[r.acao].tom}>{ACOES[r.acao].nome}</Etiqueta>
                    <span className="text-xs text-texto-suave tabular-nums">{formatarDataHora(r.created_at, atual.fuso)}</span>
                  </div>
                  <p className="font-medium">
                    {nomeTabela(r.tabela)}
                    {r.resumo && <span className="font-normal text-texto-suave"> · {r.resumo}</span>}
                  </p>
                  <p className="truncate text-[13px]"><Quem r={r} /></p>
                  <Detalhes r={r} />
                </li>
              ))}
            </ul>
          )}
          <div className={lista.length > 0 ? "hidden md:block" : ""}>
            <Tabela cabecalho={["Quando", "Quem", "O quê", "Onde", "Registro", "Detalhes"]} total={lista.length} vazio="Nenhuma alteração encontrada com esses filtros.">
              {lista.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap tabular-nums">{formatarDataHora(r.created_at, atual.fuso)}</td>
                  <td className="max-w-48 truncate"><Quem r={r} /></td>
                  <td><Etiqueta tom={ACOES[r.acao].tom}>{ACOES[r.acao].nome}</Etiqueta></td>
                  <td className="whitespace-nowrap">
                    <Link href={link({ tabela: r.tabela })} className="hover:underline">{nomeTabela(r.tabela)}</Link>
                  </td>
                  <td className="max-w-56 truncate">{r.resumo ?? <span className="text-texto-suave">–</span>}</td>
                  <td><Detalhes r={r} /></td>
                </tr>
              ))}
            </Tabela>
          </div>
        </>
      )}

      {(pagina > 1 || temProxima) && (
        <nav aria-label="Páginas" className="flex items-center gap-3 text-sm">
          {pagina > 1 && <LinkBotao href={link({ pagina: pagina > 2 ? pagina - 1 : undefined })} tamanho="sm">Mais recentes</LinkBotao>}
          <span className="text-texto-suave">Página {pagina}</span>
          {temProxima && <LinkBotao href={link({ pagina: pagina + 1 })} tamanho="sm">Mais antigas</LinkBotao>}
        </nav>
      )}
    </div>
  );
}
