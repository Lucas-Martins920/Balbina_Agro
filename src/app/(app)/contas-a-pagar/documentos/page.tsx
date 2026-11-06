import Link from "next/link";
import { AcaoConfirmada } from "@/components/acao-confirmada";
import { Aviso, Campo, Cartao, CLASSE_BOTAO_TEXTO, Etiqueta, Segmentos, Selecao, Titulo } from "@/components/ui";
import { formatarLinha, lerLinhaDigitavel } from "@/lib/boleto";
import type { DadosDocumento } from "@/lib/documento-recebido";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, hojeISO } from "@/lib/formato";
import { iaConfigurada } from "@/lib/ia";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { ordenado } from "@/lib/ordem";
import { createClient } from "@/lib/supabase/server";
import { lancarDocumento, mudarSituacaoDocumento } from "./actions";
import { EnviarDocumento } from "./enviar";

const ABAS = [
  { valor: "nova", nome: "Para lançar" },
  { valor: "lancada", nome: "Lançados" },
  { valor: "ignorada", nome: "Ignorados" },
];
const TIPO: Record<string, string> = { boleto: "Boleto", nota_fiscal: "Nota fiscal", recibo: "Recibo", fatura: "Fatura", outro: "Documento" };

// C3/C4: boletos, notas e recibos lidos por IA (enviados aqui ou pela caixa de e-mail), para conferir e lançar.
export default async function PaginaDocumentos({ searchParams }: PageProps<"/contas-a-pagar/documentos">) {
  await exigirAcesso("contas-a-pagar");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const filtros = await searchParams;
  const status = ABAS.find((a) => a.valor === filtros.status)?.valor ?? "nova";
  const supabase = await createClient();
  const [{ data: docs }, { data: categorias }, { data: centros }, { data: contatos }] = await Promise.all([
    supabase.from("documentos_recebidos").select("id, origem, nome_arquivo, remetente, dados, linha_digitavel, erro, agendamento_id, created_at")
      .eq("empresa_id", atual.id).eq("status", status).order("created_at", { ascending: false }).limit(100),
    supabase.from("categorias").select("id, nome, grupo, sentido, parent_id, ordem").eq("empresa_id", atual.id).eq("ativa", true).eq("sentido", "saida")
      .order("ordem").order("nome").then(ordenado),
    supabase.from("centros_custo").select("id, nome").eq("empresa_id", atual.id).eq("ativo", true).order("nome"),
    supabase.from("contatos").select("id, nome, cpf_cnpj").eq("empresa_id", atual.id).eq("arquivado", false).not("cpf_cnpj", "is", null),
  ]);
  const lista = (docs ?? []).map((d) => ({ ...d, dados: d.dados as Partial<DadosDocumento> }));
  const podeLancar = pode("contas-a-pagar.editar");
  const porDocumento = new Map((contatos ?? []).map((c) => [c.cpf_cnpj as string, c]));
  const nomeCategoria = new Map((categorias ?? []).map((c) => [c.id, c.nome]));
  const hoje = hojeISO(atual.fuso);

  // categoria de costume do fornecedor reconhecido
  const habitual = new Map<string, { categoria_id: string | null; centro_custo_id: string | null }>();
  await Promise.all([...new Set(lista.map((d) => porDocumento.get(d.dados.fornecedor_documento ?? "")?.id).filter(Boolean) as string[])].map(async (c) => {
    const { data } = await supabase.rpc("custeio_habitual", { p_contato: c });
    if (data?.[0]) habitual.set(c, data[0]);
  }));

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Titulo descricao="Mande a foto ou o PDF e a IA preenche fornecedor, valor, vencimento e linha digitável. Nada vira conta sem você conferir.">
        Boletos e notas por foto
      </Titulo>
      {podeLancar && status === "nova" && (iaConfigurada() ? (
        <Cartao titulo="Ler documento"><EnviarDocumento /></Cartao>
      ) : (
        <Aviso tipo="info">A leitura por IA ainda não está ligada no servidor (falta a chave ANTHROPIC_API_KEY).</Aviso>
      ))}
      <p className="text-xs text-texto-suave">
        Também dá para mandar por e-mail para o endereço da piscicultura, em <Link href="/configuracoes/automacoes" className={CLASSE_BOTAO_TEXTO}>Configurações › Automações</Link>.
      </p>
      <Segmentos rotulo="Situação" opcoes={ABAS.map((a) => ({ href: `/contas-a-pagar/documentos?status=${a.valor}`, nome: a.nome, ativo: a.valor === status }))} />

      {lista.length === 0 && <p className="text-sm text-texto-suave">Nenhum documento aqui.</p>}
      {lista.map((d) => {
        const dd = d.dados;
        const fornecedor = porDocumento.get(dd.fornecedor_documento ?? "");
        const sugestao = fornecedor ? habitual.get(fornecedor.id) : undefined;
        const boleto = d.linha_digitavel ? lerLinhaDigitavel(d.linha_digitavel, hoje) : null;
        const titulo = [TIPO[dd.tipo ?? "outro"] ?? "Documento", dd.fornecedor_nome ?? fornecedor?.nome].filter(Boolean).join(" · ");
        return (
          <Cartao key={d.id} titulo={titulo}
            descricao={`${d.origem === "email" ? `Por e-mail${d.remetente ? ` de ${d.remetente}` : ""}` : d.origem === "whatsapp" ? "Pelo WhatsApp" : "Enviado aqui"} · ${d.nome_arquivo ?? ""} · ${formatarData(d.created_at.slice(0, 10))}`}>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {d.erro && <Etiqueta tom="perigo">{d.erro}</Etiqueta>}
                {boleto && <Etiqueta tom="positivo">Linha digitável conferida</Etiqueta>}
                {dd.linha_digitavel && !boleto && <Etiqueta tom="alerta">Linha digitável não confere: copie do papel</Etiqueta>}
                {fornecedor ? <Etiqueta tom="info">Fornecedor: {fornecedor.nome}</Etiqueta> : dd.fornecedor_nome && status === "nova" && <Etiqueta tom="alerta">Fornecedor novo: cadastra ao lançar</Etiqueta>}
                {d.agendamento_id && <Link href="/contas-a-pagar" className={CLASSE_BOTAO_TEXTO}>Ver em contas a pagar</Link>}
              </div>
              {boleto && <p className="font-mono text-xs">{formatarLinha(boleto)}</p>}
              <div className="flex flex-wrap gap-2">
                {status === "nova" && podeLancar && (
                  <AcaoConfirmada acao={lancarDocumento} botao="Conferir e lançar" confirmar="Lançar"
                    pergunta={`Confira com o papel. ${sugestao?.categoria_id ? `Categoria de costume: ${nomeCategoria.get(sugestao.categoria_id) ?? ""}.` : ""}`}>
                    <input type="hidden" name="id" value={d.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo rotulo="Fornecedor" id={`fn_${d.id}`} name="fornecedor_nome" defaultValue={fornecedor?.nome ?? dd.fornecedor_nome ?? ""} />
                      <Campo rotulo="CNPJ/CPF" id={`fd_${d.id}`} name="fornecedor_documento" inputMode="numeric" defaultValue={dd.fornecedor_documento ?? ""} />
                      <Campo rotulo="Descrição" id={`de_${d.id}`} name="descricao" required
                        defaultValue={[dd.descricao, dd.numero ? `nº ${dd.numero}` : null].filter(Boolean).join(" · ")} />
                      <Campo rotulo="Valor (R$)" id={`va_${d.id}`} name="valor" inputMode="decimal" required
                        defaultValue={dd.valor ? String(dd.valor.toFixed(2)).replace(".", ",") : ""} />
                      <Campo rotulo="Vencimento" id={`ve_${d.id}`} name="vencimento" type="date" required defaultValue={dd.vencimento ?? hoje} />
                      <Campo rotulo="Competência" id={`co_${d.id}`} name="competencia" type="date" defaultValue={dd.emissao ?? ""} ajuda="em branco, vale o vencimento" />
                      <Selecao rotulo="Categoria" id={`ca_${d.id}`} name="categoria_id" required defaultValue={sugestao?.categoria_id ?? ""}>
                        <option value="" disabled>Escolha…</option>
                        {(categorias ?? []).map((c) => <option key={c.id} value={c.id}>{c.parent_id ? `${nomeCategoria.get(c.parent_id) ?? ""} › ${c.nome}` : c.nome}</option>)}
                      </Selecao>
                      <Selecao rotulo="Centro de custo" id={`cc_${d.id}`} name="centro_custo_id" defaultValue={sugestao?.centro_custo_id ?? ""}>
                        <option value="">Nenhum</option>
                        {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </Selecao>
                    </div>
                  </AcaoConfirmada>
                )}
                {status !== "lancada" && podeLancar && (
                  <AcaoConfirmada acao={mudarSituacaoDocumento} botao={status === "nova" ? "Ignorar" : "Voltar para lançar"}
                    pergunta={status === "nova" ? "O documento sai da lista sem virar conta (ex.: já lançado, repetido)." : "O documento volta para a lista de lançar."}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="status" value={status === "nova" ? "ignorada" : "nova"} />
                  </AcaoConfirmada>
                )}
              </div>
            </div>
          </Cartao>
        );
      })}
    </div>
  );
}
