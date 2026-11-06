import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { BotaoLancamento } from "@/components/lancamento";
import { SelecaoComNovo } from "@/components/selecao-com-novo";
import { Rateio } from "@/components/rateio";
import { Campo, Cartao, classeBotao, Selecao, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { getPermissoes } from "@/lib/permissoes";
import { formatarData, formatarMoeda, hojeISO } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { lerTodas } from "@/lib/supabase/todas";
import { CONFIG_TITULO, FORMAS_PAGAMENTO, FREQUENCIAS, GRUPOS_CATEGORIA, type TipoTitulo } from "@/lib/titulos";
import { agendarTitulo, criarContato, criarRecorrencia, encerrarRecorrencia } from "./actions";
import { ListaTitulos, type LinhaTitulo } from "./lista";
import { ordenado } from "@/lib/ordem";
import { dispensarSugestao } from "../conciliacao/actions";

type RecorrenciaSugerida = {
  chave: string; tipo: string; descricao: string; contato_id: string | null; contato_nome: string | null; categoria_id: string | null;
  centro_custo_id: string | null; valor_cents: number; dia: number; meses: number; proximo: string;
};

type Filtros = Record<string, string | string[] | undefined>;

const ABERTAS = ["aberto", "parcial", "vencido"];
const POR_PAGINA = 200;

// Mês anterior/seguinte de "aaaa-mm" para as setas do filtro.
function mesVizinho(mes: string, passo: number) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + passo, 1)).toISOString().slice(0, 7);
}

function OpcoesForma() {
  return (
    <>
      <option value="">Não informada</option>
      {Object.entries(FORMAS_PAGAMENTO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
    </>
  );
}

// Tela única de títulos: a rota só diz se é a pagar ou a receber.
export async function PaginaTitulos({ tipo, filtros }: { tipo: TipoTitulo; filtros: Filtros }) {
  const config = CONFIG_TITULO[tipo];
  const situacao = typeof filtros.situacao === "string" ? filtros.situacao : "abertas";
  const mes = typeof filtros.mes === "string" && /^\d{4}-\d{2}$/.test(filtros.mes) ? filtros.mes : "";
  const pagina = Math.max(1, Math.floor(Number(filtros.pagina)) || 1);

  const [{ atual }, { pode }] = await Promise.all([getEmpresaAtual(), getPermissoes()]);
  const supabase = await createClient();

  // O horizonte das recorrências é renovado todo dia pelo pg_cron (migration 20261030220000_recorrencias_no_cron.sql)
  let consulta = supabase.from("titulos").select("*", { count: "exact" }).eq("empresa_id", atual.id).eq("tipo", tipo);
  if (situacao === "abertas") consulta = consulta.in("situacao", ABERTAS);
  else if (situacao === "todas") consulta = consulta.neq("status", "cancelado");
  else consulta = consulta.eq("situacao", situacao);
  if (mes) {
    const [a, m] = mes.split("-").map(Number);
    const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
    consulta = consulta.gte("vencimento", `${mes}-01`).lt("vencimento", fim);
  }

  const [{ data: titulos, count }, { data: categorias }, { data: centros }, { data: contatos }, { data: contas }, { data: abertos }, { data: recorrencias }, { data: sugeridasTodas }] = await Promise.all([
    consulta.order("vencimento").order("id").range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
    supabase.from("categorias").select("id, nome, grupo, parent_id, ordem").eq("empresa_id", atual.id).eq("sentido", config.sentido).eq("ativa", true).order("ordem").order("nome").then(ordenado),
    supabase.from("centros_custo").select("id, nome, parent_id, ordem").eq("empresa_id", atual.id).eq("ativo", true).order("ordem").order("nome").then(ordenado),
    supabase.from("contatos").select("id, nome").eq("empresa_id", atual.id).contains("tipos", [config.tipoContato]).eq("arquivado", false).order("nome"),
    supabase.from("contas_financeiras").select("id, nome").eq("empresa_id", atual.id).eq("arquivada", false).order("nome"),
    lerTodas(() => supabase.from("titulos").select("situacao, saldo_cents").eq("empresa_id", atual.id).eq("tipo", tipo).in("situacao", ABERTAS).order("id")),
    supabase.from("recorrencias").select("id, descricao, valor_cents, frequencia, inicio, termino, contatos(nome)")
      .eq("empresa_id", atual.id).eq("tipo", tipo).eq("status", "ativa").order("descricao"),
    supabase.rpc("recorrencias_sugeridas", { p_empresa: atual.id }),
  ]);
  const sugeridas = ((sugeridasTodas ?? []) as RecorrenciaSugerida[]).filter((r) => r.tipo === tipo);

  // Categoria pai com filhas não recebe lançamento direto
  const pais = new Set((categorias ?? []).map((c) => c.parent_id).filter(Boolean));
  const opcoesCategoria = (categorias ?? []).filter((c) => !pais.has(c.id)).map((c) => ({ id: c.id, nome: c.nome, grupo: GRUPOS_CATEGORIA[c.grupo] ?? c.grupo }));
  const totalAberto = (abertos ?? []).reduce((s, t) => s + Number(t.saldo_cents), 0);
  const totalVencido = (abertos ?? []).filter((t) => t.situacao === "vencido").reduce((s, t) => s + Number(t.saldo_cents), 0);
  const hoje = hojeISO(atual.fuso);
  const proximoMes = (() => {
    const [a, m] = hoje.split("-").map(Number);
    return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
  })();

  const situacoes = [
    { valor: "abertas", nome: "Em aberto" },
    { valor: "vencido", nome: "Vencidas" },
    { valor: "quitado", nome: config.quitadas },
    ...(tipo === "receber" ? [{ valor: "perda", nome: "Perdas" }] : []),
    { valor: "todas", nome: "Todas" },
    { valor: "cancelado", nome: "Excluídas" },
  ];

  const link = (valor: string, mesLink = mes) => {
    const p = new URLSearchParams();
    if (valor !== "abertas") p.set("situacao", valor);
    if (mesLink) p.set("mes", mesLink);
    return `${config.rota}${p.size ? `?${p}` : ""}`;
  };
  const total = count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const linkPagina = (n: number) => {
    const base = link(situacao);
    return n <= 1 ? base : `${base}${base.includes("?") ? "&" : "?"}pagina=${n}`;
  };

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo
        descricao={`Em aberto: ${formatarMoeda(totalAberto)} · vencido: ${formatarMoeda(totalVencido)}`}
        acoes={
          <>
            {tipo === "receber" && <Link href="/contas-a-receber/regua" className={classeBotao("secundario", "sm")}>Régua de cobrança</Link>}
            {tipo === "pagar" && <Link href="/contas-a-pagar/documentos" className={classeBotao("secundario", "sm")}>Boletos e notas por foto</Link>}
            {tipo === "pagar" && <Link href="/contas-a-pagar/pagamentos" className={classeBotao("secundario", "sm")}>Pagar pelo Asaas</Link>}
            <BotaoLancamento rotulo={config.contato} titulo={`Novo ${config.contato.toLowerCase()}`} acao={criarContato} botao="Cadastrar" variante="secundario" tamanho="sm">
            <input type="hidden" name="tipo" value={tipo} />
            <Campo rotulo="Nome" id="contato_nome" name="nome" required />
            <Campo rotulo="CPF ou CNPJ (opcional)" id="cpf_cnpj" name="cpf_cnpj" inputMode="numeric" />
          </BotaoLancamento>
            <BotaoLancamento rotulo="Recorrência" titulo="Nova recorrência" acao={criarRecorrencia} botao="Criar recorrência" variante="secundario" tamanho="sm"
              descricao="O que se repete (energia, folha, aluguel, contrato de venda de peixe): os próximos 12 meses entram sozinhos.">
            <input type="hidden" name="tipo" value={tipo} />
            <Campo rotulo="Descrição" id="rec_descricao" name="descricao" required />
            <Campo rotulo="Valor (R$)" id="rec_valor" name="valor" inputMode="decimal" placeholder="0,00" required />
            <Selecao rotulo="Frequência" id="rec_frequencia" name="frequencia" defaultValue="mensal">
              {Object.entries(FREQUENCIAS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </Selecao>
            <Campo rotulo="1º vencimento" id="rec_inicio" name="inicio" type="date" defaultValue={hoje} required />
            <Campo rotulo="Término (opcional)" id="rec_termino" name="termino" type="date" />
            <Selecao rotulo="Categoria" id="rec_categoria" name="categoria_id" required defaultValue="">
              <option value="" disabled>Escolha…</option>
              {opcoesCategoria.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
            <Selecao rotulo="Centro de custo" id="rec_cc" name="centro_custo_id" defaultValue="">
              <option value="">Nenhum</option>
              {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
            <Selecao rotulo={config.contato} id="rec_contato" name="contato_id" defaultValue="">
              <option value="">Sem {config.contato.toLowerCase()}</option>
              {(contatos ?? []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </Selecao>
            <Selecao rotulo="Forma de pagamento" id="rec_forma" name="forma_pagamento" defaultValue="">
              <OpcoesForma />
            </Selecao>
          </BotaoLancamento>
            <BotaoLancamento rotulo={`Nova ${config.singular}`} acao={agendarTitulo} botao="Agendar">
            <input type="hidden" name="tipo" value={tipo} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Descrição" id="descricao" name="descricao" placeholder={config.exemplo} required />
              <SelecaoComNovo novo={config.tipoContato} rotulo={config.contato} id="contato_id" name="contato_id" defaultValue="">
                <option value="">Sem {config.contato.toLowerCase()}</option>
                {(contatos ?? []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </SelecaoComNovo>
              <Campo rotulo="Valor total (R$)" id="valor" name="valor" inputMode="decimal" placeholder="0,00" required />
              <Campo rotulo="Parcelas" id="parcelas" name="parcelas" type="number" min={1} max={120} defaultValue={1} />
              <Campo rotulo="1º vencimento" id="vencimento" name="vencimento" type="date" defaultValue={hoje} required />
              <Campo rotulo={config.competencia} id="competencia" name="competencia" type="month" defaultValue={hoje.slice(0, 7)} />
              <Campo rotulo="Nº do documento (opcional)" id="referencia" name="referencia" placeholder="NF, boleto…" />
              <Selecao rotulo="Forma de pagamento" id="forma_pagamento" name="forma_pagamento" defaultValue="">
                <OpcoesForma />
              </Selecao>
            </div>
            <Rateio categorias={opcoesCategoria} centros={centros ?? []} campoTotal="valor" />
            <p className="text-xs text-texto-suave">
              {config.dicaRateio} Parcelas vencem mês a mês a partir do 1º vencimento e mantêm a competência informada.
            </p>
          </BotaoLancamento>
          </>
        }
      >
        {config.titulo}
      </Titulo>

      <div className="flex flex-wrap items-end gap-3">
        <nav aria-label="Situação" data-tour="filtros" className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-elevado/70 p-0.5 text-[13px] whitespace-nowrap">
          {situacoes.map((s) => (
            <Link key={s.valor} href={link(s.valor)} aria-current={situacao === s.valor ? "page" : undefined}
              className={`rounded-md px-3 py-1 font-medium transition-colors duration-150 ${situacao === s.valor ? "bg-superficie text-texto shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-texto-suave hover:text-texto"}`}>
              {s.nome}
            </Link>
          ))}
        </nav>
        <form data-tour="periodo" className="flex flex-wrap items-end gap-2">
          <Link href={link(situacao, mesVizinho(mes || hoje.slice(0, 7), -1))} aria-label="Mês anterior" className={classeBotao("secundario")}>‹</Link>
          {situacao !== "abertas" && <input type="hidden" name="situacao" value={situacao} />}
          <Campo rotulo="Mês de vencimento" id="mes" name="mes" type="month" defaultValue={mes} />
          <Link href={link(situacao, mesVizinho(mes || hoje.slice(0, 7), 1))} aria-label="Próximo mês" className={classeBotao("secundario")}>›</Link>
          <button type="submit" className={classeBotao("secundario")}>Filtrar</button>
          {mes !== hoje.slice(0, 7) && <Link href={link(situacao, hoje.slice(0, 7))} className={classeBotao("fantasma")}>Este mês</Link>}
          {mes && <Link href={link(situacao)} className={classeBotao("fantasma")}>Limpar</Link>}
        </form>
      </div>

      <ListaTitulos tipo={tipo} titulos={(titulos ?? []) as LinhaTitulo[]} contas={contas ?? []} contatos={contatos ?? []}
        categorias={opcoesCategoria} centros={centros ?? []} hoje={hoje} situacao={situacao} podeEditar={pode(`${config.rota.slice(1)}.editar`)} />

      {paginas > 1 && (
        <nav aria-label="Páginas" className="flex flex-wrap items-center gap-2 text-sm text-texto-suave">
          {pagina > 1 && <Link href={linkPagina(pagina - 1)} className={classeBotao("secundario", "sm")}>‹ Anterior</Link>}
          <span>Página {pagina} de {paginas} · {total} títulos</span>
          {pagina < paginas && <Link href={linkPagina(pagina + 1)} className={classeBotao("secundario", "sm")}>Próxima ›</Link>}
        </nav>
      )}

      {sugeridas.length > 0 && (
        <Cartao titulo="Parece recorrência" descricao="Contas que apareceram todo mês, com valor parecido, e ainda não são recorrência. Criando, os próximos 12 meses entram sozinhos.">
          <ul className="flex flex-col divide-y divide-linha text-sm">
            {sugeridas.map((r) => (
              <li key={r.chave} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{r.descricao}</span>
                  {r.contato_nome && <span className="text-texto-suave"> · {r.contato_nome}</span>}
                  <span className="block text-xs text-texto-suave">
                    {r.meses} meses seguidos · cerca de {formatarMoeda(r.valor_cents)} · todo dia {r.dia} · próximo {formatarData(r.proximo)}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {r.categoria_id && (
                    <FormAcao acao={criarRecorrencia} botao="Criar recorrência">
                      <input type="hidden" name="tipo" value={tipo} />
                      <input type="hidden" name="descricao" value={r.descricao} />
                      <input type="hidden" name="valor" value={(r.valor_cents / 100).toFixed(2).replace(".", ",")} />
                      <input type="hidden" name="frequencia" value="mensal" />
                      <input type="hidden" name="inicio" value={r.proximo} />
                      <input type="hidden" name="categoria_id" value={r.categoria_id} />
                      <input type="hidden" name="centro_custo_id" value={r.centro_custo_id ?? ""} />
                      <input type="hidden" name="contato_id" value={r.contato_id ?? ""} />
                    </FormAcao>
                  )}
                  <FormAcao acao={dispensarSugestao} botao="Não é" variante="secundario">
                    <input type="hidden" name="tipo" value="recorrencia" />
                    <input type="hidden" name="chave" value={r.chave} />
                  </FormAcao>
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Cartao titulo="Recorrências ativas">
          {(recorrencias ?? []).length === 0 ? (
            <p className="text-sm text-texto-suave">Nenhuma. Use o botão Recorrência no alto para o que se repete: energia, folha, aluguel, contrato de venda de peixe.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-linha text-sm">
              {(recorrencias ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{r.descricao}</span>
                    {r.contatos && <span className="text-texto-suave"> · {(r.contatos as unknown as { nome: string }).nome}</span>}
                    <span className="block text-xs text-texto-suave">
                      {FREQUENCIAS[r.frequencia]} · {formatarMoeda(r.valor_cents)} · desde {formatarData(r.inicio)}
                      {r.termino && ` até ${formatarData(r.termino)}`}
                    </span>
                  </span>
                  <details className="relative">
                    <summary className={classeBotao("fantasma", "sm")}>Encerrar</summary>
                    <div className="popover absolute right-0 z-10 mt-2 w-64 vidro rounded-2xl border border-borda p-4 shadow-[0_8px_24px_-6px_rgb(0_0_0/0.16)]">
                      <FormAcao acao={encerrarRecorrencia} botao="Encerrar recorrência">
                        <input type="hidden" name="tipo" value={tipo} />
                        <input type="hidden" name="recorrencia_id" value={r.id} />
                        <Campo rotulo="Cancelar títulos a partir de" id={`a_partir_${r.id}`} name="a_partir" type="date" defaultValue={proximoMes} required />
                      </FormAcao>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
      </Cartao>

    </div>
  );
}
