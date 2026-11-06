import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mensagemBanco } from "@/lib/acao";
import type { EmpresaCampo } from "@/lib/apontamento-campo-servidor";
import { hojeISO } from "@/lib/formato";
import { resumoLote, type SemanaLote } from "@/lib/zootecnico";
import type { BiometriaRecente, InsumoOpcao, LoteTanque, PainelCampo, RacaoSugerida, Tanque } from "./tipos";
import { validarAbrirLote, validarBiometriaCampo, validarFecharLote, validarInsumoCampo } from "./validar";

// Servidor do app de campo (/campo): o painel dos viveiros e a gravação do que chega da fila do celular.
// O apontamento do turno (ração, mortes, água) continua em apontamento-campo-servidor.ts, o mesmo do app Expo.

type Resposta = { status: number; corpo: Record<string, unknown> };
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const recusa = (erro: string): Resposta => ({ status: 422, corpo: { erro } });
const ordem = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

type RacaoBanco = {
  racao_kg: number | string | null; refeicoes: number | null; racao_por_refeicao_kg: number | string | null; proteina_pct: number | string | null;
  granulo: string | null; fase_tabela: string | null; taxa_pct: number | string | null; alerta: string | null; oxigenio_min_mg_l: number | string | null;
};

function racao(r: RacaoBanco | undefined): RacaoSugerida | null {
  if (!r || n(r.racao_kg) === null) return null;
  return {
    kg: n(r.racao_kg)!, refeicoes: r.refeicoes, por_refeicao_kg: n(r.racao_por_refeicao_kg), proteina: n(r.proteina_pct),
    granulo: r.granulo, fase: r.fase_tabela, taxa_pct: n(r.taxa_pct), alerta: r.alerta, oxigenio_min: n(r.oxigenio_min_mg_l),
  };
}

// Todos os viveiros ativos (com e sem peixe), o lote de cada um com peso, ração sugerida pela tabela de
// arraçoamento, curva de crescimento e conversão alimentar, e o que dá para aplicar no viveiro.
export async function painelCampo(supabase: SupabaseClient, empresa: EmpresaCampo): Promise<PainelCampo> {
  const hoje = hojeISO(empresa.fuso);
  const [{ data: viveiros }, { data: alocacoes }, { data: especies }, { data: produtos }, { data: saldos }] = await Promise.all([
    supabase.from("viveiros").select("id, nome, area_m2, volume_m3, aeracao, setores(nome)").eq("empresa_id", empresa.id).eq("ativo", true),
    supabase.from("alocacoes_atuais").select("lote_id, viveiro_id, lote_codigo, fase, data_povoamento, especie_id, peixes_atuais, semana, dias_cultivo, " +
      "ultimo_apontamento, peso_medio_g, biomassa_kg, peixes_m2, kg_m3, ultima_biometria, carencia_ate, previsao_despesca, peso_alvo_g").eq("empresa_id", empresa.id),
    supabase.from("especies").select("id, nome").eq("empresa_id", empresa.id).order("nome"),
    supabase.from("produtos").select("id, nome, unidade, tipo").eq("empresa_id", empresa.id).eq("ativo", true).in("tipo", ["corretivo", "outro"]).order("nome"),
    supabase.from("saldos_produtos").select("produto_id, saldo").eq("empresa_id", empresa.id),
  ]);
  const ocupados = (alocacoes ?? []) as unknown as Record<string, unknown>[];
  const lotes = [...new Set(ocupados.map((a) => String(a.lote_id)))];

  const [{ data: semanas }, { data: biometrias }, { data: dadosLotes }, racoes] = await Promise.all([
    lotes.length ? supabase.from("indicadores_lote_semana").select("*").in("lote_id", lotes).order("semana") : Promise.resolve({ data: [] }),
    lotes.length
      ? supabase.from("biometrias").select("lote_id, viveiro_id, data, peso_medio_g, peixes_amostrados").in("lote_id", lotes).order("data", { ascending: false }).limit(400)
      : Promise.resolve({ data: [] }),
    lotes.length ? supabase.from("lotes").select("id, peso_inicial_g").in("id", lotes) : Promise.resolve({ data: [] }),
    // uma chamada por viveiro ocupado, como na tela de apontamentos
    Promise.all(ocupados.map((a) => supabase.rpc("racao_sugerida", { p_viveiro: a.viveiro_id, p_data: hoje }).then(({ data }) => [String(a.viveiro_id), (data as RacaoBanco[] | null)?.[0]] as const))),
  ]);

  const nomeEspecie = new Map((especies ?? []).map((e) => [e.id, e.nome as string]));
  const pesoInicial = new Map((dadosLotes ?? []).map((l: { id: string; peso_inicial_g: unknown }) => [l.id, n(l.peso_inicial_g)]));
  const racaoPorViveiro = new Map(racoes);
  const semanasPorLote = new Map<string, SemanaLote[]>();
  for (const s of (semanas ?? []) as (SemanaLote & { lote_id: string })[]) {
    const lista = semanasPorLote.get(s.lote_id) ?? [];
    lista.push(s);
    semanasPorLote.set(s.lote_id, lista);
  }
  const bioPorLote = new Map<string, BiometriaRecente[]>();
  for (const b of (biometrias ?? []) as { lote_id: string; data: string; peso_medio_g: unknown; peixes_amostrados: number }[]) {
    const lista = bioPorLote.get(b.lote_id) ?? [];
    if (lista.length < 8) lista.push({ data: b.data, peso_g: n(b.peso_medio_g) ?? 0, peixes: b.peixes_amostrados });
    bioPorLote.set(b.lote_id, lista);
  }

  const lotePorViveiro = new Map<string, LoteTanque>();
  for (const a of ocupados) {
    const loteId = String(a.lote_id);
    const sem = semanasPorLote.get(loteId) ?? [];
    const resumo = resumoLote(sem, { povoamento: a.data_povoamento as string, pesoInicialG: pesoInicial.get(loteId) ?? null });
    lotePorViveiro.set(String(a.viveiro_id), {
      id: loteId,
      codigo: String(a.lote_codigo),
      fase: String(a.fase),
      especie: nomeEspecie.get(a.especie_id as string) ?? "",
      povoamento: String(a.data_povoamento),
      dias: Number(a.dias_cultivo),
      semana: Number(a.semana),
      peixes: Number(a.peixes_atuais),
      peso_g: n(a.peso_medio_g),
      biomassa_kg: n(a.biomassa_kg),
      peso_alvo_g: n(a.peso_alvo_g),
      kg_m3: n(a.kg_m3),
      peixes_m2: n(a.peixes_m2),
      ultima_biometria: (a.ultima_biometria as string | null) ?? null,
      ultimo_apontamento: (a.ultimo_apontamento as string | null) ?? null,
      previsao_despesca: (a.previsao_despesca as string | null) ?? null,
      carencia_ate: (a.carencia_ate as string | null) ?? null,
      racao: racao(racaoPorViveiro.get(String(a.viveiro_id))),
      gpd: resumo.gpd,
      conversao: resumo.conversao,
      sobrevivencia: resumo.sobrevivencia,
      desvio_peso_pct: resumo.desvioPesoPct,
      curva: sem.map((s) => ({ semana: s.semana, real: n(s.peso_medio_g), padrao: n(s.padrao_peso_g) })),
      biometrias: bioPorLote.get(loteId) ?? [],
    });
  }

  const saldo = new Map((saldos ?? []).map((s: { produto_id: string; saldo: unknown }) => [s.produto_id, n(s.saldo)]));
  const tanques: Tanque[] = ((viveiros ?? []) as unknown as { id: string; nome: string; area_m2: unknown; volume_m3: unknown; aeracao: boolean | null; setores: { nome: string } | null }[])
    .map((v) => {
      const setor = v.setores?.nome ?? "";
      return {
        id: v.id, nome: v.nome, setor, rotulo: setor ? `${setor} / ${v.nome}` : v.nome,
        area_m2: n(v.area_m2), volume_m3: n(v.volume_m3), aeracao: Boolean(v.aeracao), lote: lotePorViveiro.get(v.id) ?? null,
      };
    })
    .sort((a, b) => ordem.compare(a.setor, b.setor) || ordem.compare(a.nome, b.nome));

  return {
    tanques,
    especies: (especies ?? []).map((e) => ({ id: e.id, nome: e.nome })),
    insumos: ((produtos ?? []) as Omit<InsumoOpcao, "saldo">[]).map((p) => ({ ...p, saldo: saldo.get(p.id) ?? null })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Gravação do que chega da fila. Cada função confere o corpo, chama a regra do banco e devolve status + corpo.
// O client_id torna o reenvio inofensivo; onde o banco não guarda o envio, a função reconhece o já gravado.
// ---------------------------------------------------------------------------------------------------------------

export async function gravarBiometriaCampo(supabase: SupabaseClient, empresa: EmpresaCampo, corpo: unknown): Promise<Resposta> {
  const v = validarBiometriaCampo(corpo, hojeISO(empresa.fuso));
  if ("erro" in v) return recusa(v.erro);
  const b = v.ok;
  const { data, error } = await supabase.rpc("registrar_biometria", {
    p_empresa: empresa.id, p_viveiro: b.viveiro_id, p_data: b.data, p_peixes: b.peixes,
    p_peso_total_g: b.peso_total_g, p_peso_medio_g: b.peso_medio_g, p_comprimento_cm: null, p_uniformidade_pct: null,
    p_observacoes: b.observacoes || null, p_client_id: b.client_id, p_lote: b.lote_id, p_origem: "app",
  });
  if (error) return recusa(mensagemBanco(error));
  return { status: 200, corpo: { id: data } };
}

export async function abrirLoteCampo(supabase: SupabaseClient, empresa: EmpresaCampo, corpo: unknown): Promise<Resposta> {
  const v = validarAbrirLote(corpo, hojeISO(empresa.fuso));
  if ("erro" in v) return recusa(v.erro);
  const a = v.ok;
  // povoar_lote não guarda o envio: um reenvio (resposta perdida no caminho) acha o lote com o mesmo código,
  // data, quantidade e viveiro e responde como repetido
  const { data: existentes } = await supabase.from("lotes").select("id, data_povoamento, qtd_povoada")
    .eq("empresa_id", empresa.id).eq("codigo", a.codigo).limit(1);
  const existente = existentes?.[0];
  if (existente) {
    const { data: aloc } = await supabase.from("lote_alocacoes").select("id").eq("lote_id", existente.id).eq("viveiro_id", a.viveiro_id).limit(1);
    if (existente.data_povoamento === a.data && Number(existente.qtd_povoada) === a.quantidade && aloc?.length) {
      return { status: 200, corpo: { id: existente.id, situacao: "repetido" } };
    }
    return recusa(`Já existe um lote ${a.codigo}. Use outro código.`);
  }
  const { data, error } = await supabase.rpc("povoar_lote", {
    p_empresa: empresa.id, p_codigo: a.codigo, p_especie: a.especie_id, p_povoamento: a.data, p_viveiro: a.viveiro_id,
    p_qtd: a.quantidade, p_peso_inicial_g: a.peso_inicial_g, p_custo_cents: a.custo_cents, p_fornecedor: null, p_peso_alvo_g: a.peso_alvo_g,
  });
  if (error) return recusa(error.message.includes("exclusion") ? "Este viveiro já tem um lote povoado nessa data." : mensagemBanco(error));
  return { status: 200, corpo: { id: data, situacao: "novo" } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fecharLoteCampo(supabase: SupabaseClient, empresa: EmpresaCampo, loteId: string, corpo: unknown): Promise<Resposta> {
  if (!UUID.test(loteId)) return recusa("Lote inválido.");
  const v = validarFecharLote(corpo, hojeISO(empresa.fuso));
  if ("erro" in v) return recusa(v.erro);
  const f = v.ok;
  const situacaoLote = async () => {
    const { data } = await supabase.from("lotes").select("fase").eq("id", loteId).eq("empresa_id", empresa.id).maybeSingle();
    return data?.fase as string | undefined;
  };

  if (f.modo === "encerrar") {
    const fase = await situacaoLote();
    if (!fase) return recusa("Lote não encontrado.");
    if (fase === "encerrado") return { status: 200, corpo: { situacao: "repetido", lote_encerrado: true } };
    const { error } = await supabase.rpc("encerrar_lote", { p_lote: loteId, p_data: f.data, p_motivo: f.motivo });
    if (error) return recusa(mensagemBanco(error));
    return { status: 200, corpo: { situacao: "novo", lote_encerrado: true } };
  }

  const { data, error } = await supabase.rpc("registrar_despesca", {
    p_empresa: empresa.id, p_viveiro: f.viveiro_id, p_data: f.data, p_tipo: "total", p_kg: f.kg,
    p_qtd_peixes: f.peixes, p_classes: null, p_observacoes: f.observacoes || null, p_client_id: f.client_id, p_lote: loteId,
  });
  if (error) return recusa(mensagemBanco(error));
  return { status: 200, corpo: { id: data, lote_encerrado: (await situacaoLote()) === "encerrado" } };
}

export async function lancarInsumoCampo(supabase: SupabaseClient, empresa: EmpresaCampo, corpo: unknown): Promise<Resposta> {
  const v = validarInsumoCampo(corpo, hojeISO(empresa.fuso));
  if ("erro" in v) return recusa(v.erro);
  const i = v.ok;
  const { data, error } = await supabase.rpc("registrar_insumo_viveiro", {
    p_empresa: empresa.id, p_viveiro: i.viveiro_id, p_data: i.data, p_tipo: i.tipo,
    p_produto: i.produto_id, p_quantidade: i.quantidade, p_medicamento: i.medicamento_id, p_dias: i.dias,
    p_dose_por_unidade: i.dose, p_base: i.base, p_observacoes: i.observacoes || null, p_client_id: i.client_id,
    p_baixar_estoque: i.baixar_estoque,
  });
  if (error) return recusa(mensagemBanco(error));
  return { status: 200, corpo: { id: data } };
}
