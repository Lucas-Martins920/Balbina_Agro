"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, hojeISO } from "@/lib/formato";
import { centavos, dividirPacote, resultadoVazio, somarResultados, type Pacote, type ResultadoImportacao } from "@/lib/importacao";
import { auditarNibo, chavesSincronizacao, conciliacaoNibo, desdeNiboValido, lerNibo, pacoteNibo, type ConciliacaoConta, type DadosNibo } from "@/lib/importacao-nibo";
import { abaCsv, interpretarPlanilha, type AbaLida, type Contexto, type Previa } from "@/lib/importacao-modelo";
import { lerXlsx } from "@/lib/importacao-modelo-xlsx";
import { decodificar, lerCsv, pacotePlanilhaContatos } from "@/lib/importacao-planilha";
import { niboLiberado } from "@/lib/integracoes";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

const TIPOS = new Set(["cliente", "fornecedor"]);
const ORIGENS = new Set(["lc", "nibo", "planilha"]);

async function enviar(pacote: Pacote, empresaId: string): Promise<{ resultado: ResultadoImportacao; erro?: string }> {
  const supabase = await createClient();
  let resultado = resultadoVazio();
  for (const lote of dividirPacote(pacote)) {
    const { data, error } = await supabase.rpc("importar_pacote", { p_empresa: empresaId, p_pacote: lote });
    if (error) return { resultado, erro: mensagemBanco(error) };
    resultado = somarResultados(resultado, data as ResultadoImportacao);
  }
  return { resultado };
}

function resumo(r: ResultadoImportacao, regras?: number) {
  const partes = [
    r.categorias && `${r.categorias} categorias`,
    r.centros_custo && `${r.centros_custo} centros de custo`,
    r.contas && `${r.contas} contas`,
    r.contatos_novos && `${r.contatos_novos} contatos novos`,
    r.contatos_atualizados && `${r.contatos_atualizados} contatos atualizados`,
    r.produtos && `${r.produtos} produtos`,
    r.titulos && `${r.titulos} lançamentos (${r.baixas} baixas)`,
    r.transferencias && `${r.transferencias} transferências`,
    r.titulos_ja_importados && `${r.titulos_ja_importados} lançamentos já estavam importados`,
    regras && `${regras} regras de conciliação criadas`,
  ].filter(Boolean);
  let texto = `Importação concluída: ${partes.join(", ") || "nada novo"}.`;
  if (r.total_avisos) texto += ` ${r.total_avisos} avisos: ${r.avisos.slice(0, 5).join(" · ")}${r.total_avisos > 5 ? " …" : ""}`;
  return texto;
}

async function empresaDoMaster() {
  const { master } = await getPermissoes();
  if (!master) return null;
  return (await getEmpresaAtual()).atual;
}

function revalidar() {
  for (const p of ["/contatos", "/categorias", "/centros-de-custo", "/contas", "/contas-a-pagar", "/contas-a-receber", "/painel", "/produtos",
    "/conciliacao", "/configuracoes/importar", "/piscicultura", "/lotes", "/estoque"]) revalidatePath(p);
}

// Conciliação em partes: cada conta com até 1.000 conciliados por chamada; os pendentes vão na primeira.
async function enviarConciliacao(contas: ConciliacaoConta[], empresaId: string) {
  const supabase = await createClient();
  const total = { conciliados: 0, pendentes: 0, sem_lancamento: 0 };
  for (const c of contas) {
    for (let i = 0; i === 0 || i < c.conciliados.length; i += 1000) {
      const parte = { conta_chave: c.conta_chave, conciliados: c.conciliados.slice(i, i + 1000), ...(i === 0 ? { pendentes: c.pendentes } : {}) };
      const { data, error } = await supabase.rpc("importar_conciliacao", { p_empresa: empresaId, p_origem: "nibo", p_contas: [parte] });
      if (error) return { total, erro: mensagemBanco(error) };
      const r = data as typeof total;
      total.conciliados += r.conciliados; total.pendentes += r.pendentes; total.sem_lancamento += r.sem_lancamento;
    }
  }
  return { total };
}

// Compara o saldo e o total de cada dia, conta por conta, e guarda o resultado para a tela de importação.
async function auditar(dados: DadosNibo, empresaId: string) {
  const supabase = await createClient();
  // lê todas as páginas (o Supabase devolve no máximo 1.000 linhas por consulta)
  async function todas<T>(consulta: (de: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
    const linhas: T[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await consulta(de);
      if (error) throw new Error(`Erro ao ler os dados da auditoria: ${error.message}`);
      linhas.push(...((data ?? []) as T[]));
      if ((data ?? []).length < 1000) return linhas;
    }
  }
  const [vinculos, saldos, contasBalbina, movimentos] = await Promise.all([
    todas<{ entidade: string; chave: string; registro_id: string }>((de) => supabase.from("importacao_vinculos")
      .select("entidade, chave, registro_id").eq("empresa_id", empresaId).eq("origem", "nibo")
      .in("entidade", ["conta", "titulo", "baixa", "transferencia"]).order("registro_id").range(de, de + 999)),
    todas<{ conta_id: string; nome: string; saldo_cents: number }>((de) => supabase.from("saldos_contas")
      .select("conta_id, nome, saldo_cents").eq("empresa_id", empresaId).order("conta_id").range(de, de + 999)),
    todas<{ id: string; saldo_inicial_cents: number }>((de) => supabase.from("contas_financeiras")
      .select("id, saldo_inicial_cents").eq("empresa_id", empresaId).order("id").range(de, de + 999)),
    todas<{ conta_id: string; data: string; valor_cents: number; origem: string; origem_id: string; agendamento_id: string | null }>((de) =>
      supabase.from("movimentos_caixa").select("conta_id, data, valor_cents, origem, origem_id, agendamento_id")
        .eq("empresa_id", empresaId).gte("data", dados.desde!).order("data").order("origem_id").range(de, de + 999)),
  ]);
  // movimento importado do NIBO: baixa ou transferência com vínculo, ou baixa de título importado
  const importados = new Set(vinculos.filter((v) => v.entidade !== "conta").map((v) => v.registro_id));
  const niboIds = new Set(dados.contas.map((c) => c.id));
  const balbina = vinculos.filter((v) => v.entidade === "conta" && niboIds.has(v.chave)).map((v) => {
    const s = saldos.find((x) => x.conta_id === v.registro_id);
    return {
      chave: v.chave, nome: s?.nome ?? v.chave, saldo_cents: Number(s?.saldo_cents ?? 0),
      abertura_cents: Number(contasBalbina.find((c) => c.id === v.registro_id)?.saldo_inicial_cents ?? 0),
      movimentos: movimentos.filter((m) => m.conta_id === v.registro_id).map((m) => ({
        data: m.data, valor_cents: Number(m.valor_cents),
        importado: importados.has(m.origem_id) || (!!m.agendamento_id && importados.has(m.agendamento_id)),
      })),
    };
  });
  const contas = auditarNibo(dados, balbina);
  await supabase.from("auditorias_importacao").insert({ empresa_id: empresaId, origem: "nibo", desde: dados.desde, contas, avisos: dados.avisos ?? [] });
  return contas;
}

export async function importarNibo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const token = String(form.get("token") ?? "").trim();
  if (token.length < 10) return falha("Cole o token da API do NIBO.");
  const empresa = await empresaDoMaster();
  if (!empresa) return falha("Só o usuário master da empresa pode importar dados.");
  if (!(await niboLiberado(empresa.id))) return falha("A integração com o NIBO não está liberada para esta empresa.");

  const desde = String(form.get("desde") ?? "");
  if (!desdeNiboValido(desde, hojeISO())) return falha("Informe a partir de que data trazer os lançamentos (até 10 anos atrás).");

  let pacote: Pacote;
  let lidos: string;
  let dados: DadosNibo;
  try {
    dados = await lerNibo(token, desde);
    pacote = pacoteNibo(dados);
    lidos = `Lidos do NIBO a partir de ${formatarData(desde)}: ${dados.debitos.length} contas a pagar, ${dados.creditos.length} contas a receber, ` +
      `${dados.pagamentos.length} pagamentos, ${dados.recebimentos.length} recebimentos e o extrato de ` +
      `${Object.keys(dados.extratos ?? {}).length} contas.${dados.avisos?.length ? ` Avisos: ${dados.avisos.join(" · ")}.` : ""}`;
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Não foi possível ler os dados do NIBO.");
  }
  // o que entrou errado ou mudou no NIBO desde a última importação sai antes, para entrar de novo certo
  const supabase = await createClient();
  const sinc = await supabase.rpc("sincronizar_importacao", { p_empresa: empresa.id, p_origem: "nibo", p_pacote: chavesSincronizacao(pacote, desde) });
  if (sinc.error) return falha(`Não foi possível sincronizar com o NIBO: ${mensagemBanco(sinc.error)}`);
  const removidos = sinc.data as { baixas: number; transferencias: number; titulos: number };

  const { resultado, erro } = await enviar(pacote, empresa.id);
  if (erro) return falha(`Parte dos dados entrou, mas a importação parou: ${erro}. Corrija e rode de novo: o que já entrou não duplica.`);

  // saldo de abertura: saldo de hoje no NIBO menos o que o Balbina movimentou na conta desde a data inicial
  if (dados.saldos?.length) {
    const fix = await supabase.rpc("fixar_saldos_importacao", {
      p_empresa: empresa.id, p_origem: "nibo", p_desde: desde,
      p_contas: dados.saldos.filter((s) => s.balance != null).map((s) => ({ conta_chave: s.accountId, saldo_cents: centavos(s.balance) })),
    });
    if (fix.error) return falha(`Os lançamentos entraram, mas o saldo das contas não foi acertado: ${mensagemBanco(fix.error)}`);
  }

  const conc = await enviarConciliacao(conciliacaoNibo(dados), empresa.id);
  if (conc.erro) return falha(`Os lançamentos entraram, mas a conciliação parou: ${conc.erro}. Rode de novo: o que já entrou não duplica.`);

  let regras: number | undefined;
  if (form.get("regras") === "on") {
    const { data } = await supabase.rpc("criar_regras_do_historico", { p_empresa: empresa.id });
    regras = Number(data ?? 0);
  }
  const auditoria = await auditar(dados, empresa.id);
  const batem = auditoria.filter((a) => a.diferenca_cents === 0).length;
  revalidar();
  const corrigidos = removidos.baixas + removidos.transferencias + removidos.titulos;
  return sucesso(`${lidos} ${corrigidos ? `Refeitos ${corrigidos} lançamentos que tinham entrado diferentes do NIBO. ` : ""}${resumo(resultado, regras)} Conciliação: ${conc.total.conciliados} conciliados e ${conc.total.pendentes} pendentes do banco. ` +
    `Saldos: ${batem} de ${auditoria.length} contas batem com o NIBO (veja a auditoria abaixo).`);
}

export async function importarPlanilha(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const arquivo = form.get("arquivo");
  const tipo = String(form.get("tipo") ?? "");
  const origem = String(form.get("origem") ?? "");
  if (!(arquivo instanceof File) || arquivo.size === 0) return falha("Escolha o arquivo CSV.");
  if (!TIPOS.has(tipo) || !ORIGENS.has(origem)) return falha("Escolha o tipo de cadastro e o sistema de origem.");
  if (/\.(xlsx?|pdf)$/i.test(arquivo.name)) return falha("Salve a planilha como CSV (no Excel: Arquivo → Salvar como → CSV) e envie de novo.");
  const empresa = await empresaDoMaster();
  if (!empresa) return falha("Só o usuário master da empresa pode importar dados.");

  const linhas = lerCsv(decodificar(await arquivo.arrayBuffer()));
  const pacote = pacotePlanilhaContatos(linhas, tipo as "cliente" | "fornecedor", origem);
  if (!pacote.contatos?.length) return falha("Não achei a coluna de nome na planilha. A primeira linha precisa ter os títulos das colunas (nome, CPF/CNPJ, telefone…).");

  const { resultado, erro } = await enviar(pacote, empresa.id);
  if (erro) return falha(erro);
  revalidar();
  return sucesso(resumo(resultado));
}

type ResultadoPiscicultura = {
  setores: number; viveiros: number; viveiros_atualizados: number; especies: number; lotes: number; lotes_existentes: number;
  estoque: number; avisos: string[]; total_avisos: number;
};

function resumoPiscicultura(g: ResultadoPiscicultura) {
  const partes = [
    g.setores && `${g.setores} setores`,
    g.viveiros && `${g.viveiros} viveiros novos`,
    g.viveiros_atualizados && `${g.viveiros_atualizados} viveiros atualizados`,
    g.especies && `${g.especies} espécies novas`,
    g.lotes && `${g.lotes} lotes povoados`,
    g.lotes_existentes && `${g.lotes_existentes} lotes já existiam`,
    g.estoque && `estoque inicial de ${g.estoque} produtos`,
  ].filter(Boolean);
  let texto = ` Piscicultura: ${partes.join(", ") || "nada novo"}.`;
  if (g.total_avisos) texto += ` ${g.total_avisos} não entraram: ${g.avisos.slice(0, 5).join(" · ")}${g.total_avisos > 5 ? " …" : ""}`;
  return texto;
}

// ---------------------------------------------------------------------------
// Planilha modelo do Balbina (xlsx ou csv): prévia linha a linha e depois o lançamento.
// ---------------------------------------------------------------------------

export type EstadoModelo = { erro?: string; ok?: string; previa?: Previa; prontas?: number };

const LIMITE_BYTES = 5 * 1024 * 1024;

async function lerModelo(form: FormData): Promise<{ abas: AbaLida[] } | { erro: string }> {
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha a planilha." };
  if (arquivo.size > LIMITE_BYTES) return { erro: "A planilha passa de 5 MB. Divida em arquivos menores e envie um de cada vez." };
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith(".xls")) return { erro: "Formato .xls antigo: no Excel, use Arquivo → Salvar como → Pasta de trabalho do Excel (.xlsx) e envie de novo." };
  const bytes = await arquivo.arrayBuffer();
  if (nome.endsWith(".xlsx")) {
    try {
      return { abas: await lerXlsx(bytes) };
    } catch {
      return { erro: "Não consegui abrir a planilha. Confira se é um arquivo .xlsx do Excel ou do Google Planilhas." };
    }
  }
  if (nome.endsWith(".csv") || nome.endsWith(".txt")) return { abas: [abaCsv(arquivo.name.replace(/\.[^.]+$/, ""), decodificar(bytes))] };
  return { erro: "Envie a planilha em .xlsx ou .csv." };
}

// O que já existe na empresa: para saber se a conta da baixa existe e o que vai ser cadastrado de novo.
async function contextoModelo(empresaId: string, fuso: string): Promise<Contexto> {
  const supabase = await createClient();
  const { noPlano } = await getPermissoes();
  async function nomes(tabela: "contas_financeiras" | "contatos" | "categorias" | "produtos") {
    const lista: string[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from(tabela).select("nome").eq("empresa_id", empresaId).order("id").range(de, de + 999);
      if (error) throw new Error(`Erro ao ler ${tabela}: ${error.message}`);
      lista.push(...(data ?? []).map((r) => r.nome as string));
      if ((data ?? []).length < 1000) return lista;
    }
  }
  const [contas, contatos, categorias, produtos, viveiros, especies] = await Promise.all([
    nomes("contas_financeiras"), nomes("contatos"), nomes("categorias"), nomes("produtos"),
    supabase.from("viveiros").select("nome, setores(nome)").eq("empresa_id", empresaId).limit(1000),
    // catálogo global (empresa_id nulo) e as da empresa: o RLS já filtra
    supabase.from("especies").select("nome").limit(1000),
  ]);
  if (viveiros.error || especies.error) throw new Error(`Erro ao ler a piscicultura: ${(viveiros.error ?? especies.error)!.message}`);
  return {
    financeiro: noPlano("financeiro"), contas, contatos, categorias, produtos,
    viveiros: (viveiros.data ?? []).map((g) => ({ nome: g.nome as string, setor: (g.setores as unknown as { nome: string } | null)?.nome ?? "" })),
    especies: (especies.data ?? []).map((l) => l.nome as string), hoje: hojeISO(fuso),
  };
}

async function prepararModelo(form: FormData) {
  const empresa = await empresaDoMaster();
  if (!empresa) return { erro: "Só o usuário master da empresa pode importar dados." };
  const lido = await lerModelo(form);
  if ("erro" in lido) return lido;
  if (!lido.abas.some((a) => a.linhas.length)) return { erro: "A planilha está vazia: preencha as linhas abaixo dos títulos." };
  const { pacote, previa } = interpretarPlanilha(lido.abas, await contextoModelo(empresa.id, empresa.fuso));
  const prontas = previa.abas.reduce((s, a) => s + a.validas, 0);
  return { empresa, pacote, previa, prontas };
}

export async function previaModelo(form: FormData): Promise<EstadoModelo> {
  try {
    const r = await prepararModelo(form);
    if ("erro" in r) return { erro: r.erro };
    return { previa: r.previa, prontas: r.prontas };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível ler a planilha." };
  }
}

export async function importarModelo(form: FormData): Promise<EstadoModelo> {
  let r: Awaited<ReturnType<typeof prepararModelo>>;
  try {
    r = await prepararModelo(form);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível ler a planilha." };
  }
  if ("erro" in r) return { erro: r.erro };
  if (!r.prontas) return { erro: "Nenhuma linha está pronta para entrar. Corrija os erros da prévia e envie de novo.", previa: r.previa, prontas: 0 };
  // cadastros e financeiro primeiro (cria produtos e fornecedores); depois viveiros, lotes e estoque
  const { viveiros, lotes, estoque, ...base } = r.pacote;
  const { resultado, erro } = await enviar(base, r.empresa.id);
  if (erro) {
    revalidar();
    return { erro: `Parte da planilha entrou, mas a importação parou: ${erro}. Corrija e envie de novo: o que já entrou não duplica.`, previa: r.previa };
  }
  let piscicultura = "";
  if (viveiros?.length || lotes?.length || estoque?.length) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("importar_piscicultura", { p_empresa: r.empresa.id, p_pacote: { viveiros, lotes, estoque } });
    if (error) {
      revalidar();
      return { erro: `Os cadastros entraram, mas viveiros, lotes e estoque pararam: ${mensagemBanco(error)}. Envie de novo: o que já entrou não duplica.`, previa: r.previa };
    }
    piscicultura = resumoPiscicultura(data as ResultadoPiscicultura);
  }
  revalidar();
  const fora = r.previa.problemas.filter((p) => p.ignorada).length;
  const algoBase = Object.entries(base).some(([k, v]) => k !== "origem" && Array.isArray(v) && v.length);
  return {
    ok: `${algoBase ? resumo(resultado) : "Importação concluída."}${piscicultura}${fora ? ` ${fora} linhas com erro ficaram de fora: corrija e envie a planilha de novo.` : ""}`,
    previa: r.previa, prontas: r.prontas,
  };
}
