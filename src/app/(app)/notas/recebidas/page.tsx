import Link from "next/link";
import { AcaoConfirmada } from "@/components/acao-confirmada";
import { AreaTexto, Aviso, Campo, Cartao, CLASSE_BOTAO_TEXTO, Etiqueta, Segmentos, Selecao, Titulo, type TomEtiqueta } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, formatarMoeda, hojeISO, somarDias } from "@/lib/formato";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { ordenado } from "@/lib/ordem";
import { createClient } from "@/lib/supabase/server";
import { lancarNfeRecebida, manifestarNfe, mudarSituacaoNfe } from "./actions";

const ABAS = [
  { valor: "nova", nome: "Para lançar" },
  { valor: "lancada", nome: "Lançadas" },
  { valor: "ignorada", nome: "Ignoradas" },
];
const MANIFESTACAO: Record<string, { nome: string; tom: TomEtiqueta }> = {
  nulo: { nome: "Sem manifestação", tom: "neutro" },
  ciencia: { nome: "Ciência", tom: "info" },
  confirmacao: { nome: "Confirmada", tom: "positivo" },
  desconhecimento: { nome: "Desconhecida", tom: "perigo" },
  nao_realizada: { nome: "Não realizada", tom: "alerta" },
};
const PRAZO_PADRAO = 30;
const numeroDaChave = (chave: string) => String(Number(chave.slice(25, 34)));

// B1: NF-e de compra que a SEFAZ registrou contra o CNPJ da piscicultura (docs/automacoes.md).
export default async function PaginaNotasRecebidas({ searchParams }: PageProps<"/notas/recebidas">) {
  await exigirAcesso("notas");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const filtros = await searchParams;
  const status = ABAS.find((a) => a.valor === filtros.status)?.valor ?? "nova";
  const supabase = await createClient();
  const [{ data: notas }, { data: cfg }, { data: categorias }, { data: centros }] = await Promise.all([
    supabase.from("nfes_recebidas")
      .select("id, chave, emitente_nome, emitente_documento, valor_cents, emissao, situacao, manifestacao, completa, contato_id, agendamento_id")
      .eq("empresa_id", atual.id).eq("status", status).order("emissao", { ascending: false }).limit(200),
    supabase.from("automacoes_empresa").select("mde_ligado, mde_consultado_em").eq("empresa_id", atual.id).maybeSingle(),
    supabase.from("categorias").select("id, nome, grupo, sentido, parent_id, ordem").eq("empresa_id", atual.id).eq("ativa", true).eq("sentido", "saida")
      .order("ordem").order("nome").then(ordenado),
    supabase.from("centros_custo").select("id, nome").eq("empresa_id", atual.id).eq("ativo", true).order("nome"),
  ]);
  const lista = notas ?? [];
  const podeLancar = pode("contas-a-pagar.editar");
  const podeManifestar = pode("notas.editar");
  // categoria de costume de cada fornecedor (último título a pagar dele)
  const fornecedores = [...new Set(lista.filter((n) => status === "nova" && n.contato_id).map((n) => n.contato_id!))];
  const habitual = new Map<string, { categoria_id: string | null; centro_custo_id: string | null }>();
  await Promise.all(fornecedores.map(async (c) => {
    const { data } = await supabase.rpc("custeio_habitual", { p_contato: c });
    if (data?.[0]) habitual.set(c, data[0]);
  }));
  const nomeCategoria = new Map((categorias ?? []).map((c) => [c.id, c.nome]));
  const hoje = hojeISO(atual.fuso);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Titulo descricao="Notas de compra que os fornecedores emitiram para o CNPJ da piscicultura, buscadas na SEFAZ pela Focus NFe a cada hora. Lance como conta a pagar com um clique; a manifestação na SEFAZ é sempre escolha sua.">
        Notas de compra
      </Titulo>
      {!cfg?.mde_ligado && (
        <Aviso tipo="info">
          A busca na SEFAZ está desligada. Quem configura a empresa liga em <Link href="/configuracoes/automacoes" className={CLASSE_BOTAO_TEXTO}>Configurações › Automações</Link>.
        </Aviso>
      )}
      {cfg?.mde_consultado_em && <p className="text-xs text-texto-suave">Última busca: {new Date(cfg.mde_consultado_em).toLocaleString("pt-BR", { timeZone: atual.fuso })}.</p>}
      <Segmentos rotulo="Situação" opcoes={ABAS.map((a) => ({ href: `/notas/recebidas?status=${a.valor}`, nome: a.nome, ativo: a.valor === status }))} />

      {lista.length === 0 && <p className="text-sm text-texto-suave">Nenhuma nota aqui.</p>}
      {lista.map((n) => {
        const sugestao = n.contato_id ? habitual.get(n.contato_id) : undefined;
        const emissao = n.emissao ? n.emissao.slice(0, 10) : hoje;
        const m = MANIFESTACAO[n.manifestacao] ?? MANIFESTACAO.nulo;
        return (
          <Cartao key={n.id} titulo={`${n.emitente_nome} · NF-e ${numeroDaChave(n.chave)}`}
            descricao={`${n.emitente_documento ?? "sem CNPJ/CPF"} · emitida em ${formatarData(emissao)} · ${formatarMoeda(Number(n.valor_cents))}`}>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {n.situacao !== "autorizada" && <Etiqueta tom="perigo">{n.situacao === "cancelada" ? "Cancelada pelo fornecedor" : "Denegada"}</Etiqueta>}
                <Etiqueta tom={m.tom}>{m.nome}</Etiqueta>
                {!n.contato_id && status === "nova" && <Etiqueta tom="alerta">Fornecedor novo: cadastra ao lançar</Etiqueta>}
                {n.agendamento_id && <Link href="/contas-a-pagar" className={CLASSE_BOTAO_TEXTO}>Ver em contas a pagar</Link>}
                {n.completa && pode("notas.ver") && <a href={`/notas/recebidas/${n.id}/xml`} className={CLASSE_BOTAO_TEXTO}>XML</a>}
                <span className="font-mono text-xs text-texto-suave">{n.chave}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {status === "nova" && podeLancar && n.situacao === "autorizada" && (
                  <AcaoConfirmada acao={lancarNfeRecebida} botao="Lançar como conta a pagar" confirmar="Lançar"
                    pergunta={`Cria a conta a pagar de ${formatarMoeda(Number(n.valor_cents))} para ${n.emitente_nome}${sugestao?.categoria_id ? `, em ${nomeCategoria.get(sugestao.categoria_id) ?? "categoria de costume"} como da última vez` : ""}.`}>
                    <input type="hidden" name="id" value={n.id} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Campo rotulo="Vencimento" id={`v_${n.id}`} name="vencimento" type="date" required
                        defaultValue={somarDias(emissao, PRAZO_PADRAO) < hoje ? hoje : somarDias(emissao, PRAZO_PADRAO)} ajuda="confira no boleto ou na nota" />
                      <Selecao rotulo="Categoria" id={`c_${n.id}`} name="categoria_id" required defaultValue={sugestao?.categoria_id ?? ""}>
                        <option value="" disabled>Escolha…</option>
                        {(categorias ?? []).map((c) => <option key={c.id} value={c.id}>{c.parent_id ? `${nomeCategoria.get(c.parent_id) ?? ""} › ${c.nome}` : c.nome}</option>)}
                      </Selecao>
                      <Selecao rotulo="Centro de custo" id={`cc_${n.id}`} name="centro_custo_id" defaultValue={sugestao?.centro_custo_id ?? ""}>
                        <option value="">Nenhum</option>
                        {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </Selecao>
                    </div>
                  </AcaoConfirmada>
                )}
                {status !== "lancada" && podeLancar && (
                  <AcaoConfirmada acao={mudarSituacaoNfe} botao={status === "nova" ? "Ignorar" : "Voltar para lançar"}
                    pergunta={status === "nova" ? "A nota sai da lista sem virar conta (ex.: já lançada à mão, bonificação)." : "A nota volta para a lista de lançar."}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="status" value={status === "nova" ? "ignorada" : "nova"} />
                  </AcaoConfirmada>
                )}
                {podeManifestar && n.situacao === "autorizada" && n.manifestacao === "nulo" && (
                  <AcaoConfirmada acao={manifestarNfe} botao="Dar ciência" pergunta="Registra na SEFAZ que a piscicultura viu a nota (libera o XML completo). Ainda dá para confirmar ou desconhecer depois.">
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="tipo" value="ciencia" />
                  </AcaoConfirmada>
                )}
                {podeManifestar && n.situacao === "autorizada" && ["nulo", "ciencia"].includes(n.manifestacao) && (
                  <>
                    <AcaoConfirmada acao={manifestarNfe} botao="Confirmar operação" pergunta="Registra na SEFAZ que a compra aconteceu e a mercadoria chegou. É definitivo.">
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="tipo" value="confirmacao" />
                    </AcaoConfirmada>
                    <AcaoConfirmada acao={manifestarNfe} botao="Desconhecer" variante="perigo" pergunta="Registra na SEFAZ que a piscicultura não reconhece esta compra (possível uso indevido do CNPJ). É definitivo.">
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="tipo" value="desconhecimento" />
                    </AcaoConfirmada>
                    <AcaoConfirmada acao={manifestarNfe} botao="Não realizada" pergunta="Registra na SEFAZ que a compra foi combinada mas não aconteceu (ex.: devolvida na entrega).">
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="tipo" value="nao_realizada" />
                      <AreaTexto rotulo="Motivo" id={`j_${n.id}`} name="justificativa" required minLength={15} maxLength={255} />
                    </AcaoConfirmada>
                  </>
                )}
              </div>
            </div>
          </Cartao>
        );
      })}
    </div>
  );
}
