import "server-only";
import { mensagemBanco } from "@/lib/acao";
import { asaas, AsaasErro, credencialDoPerfil, type Credencial } from "@/lib/asaas";
import { idAsaas, montarCliente, montarCobranca, type Meio } from "@/lib/asaas-mapa";
import type { createClient } from "@/lib/supabase/server";

export const STATUS_COBRANCA: Record<string, string> = {
  processando: "Processando", emitida: "Emitida", visualizada: "Visualizada", paga: "Paga", expirada: "Vencida", cancelada: "Cancelada", erro: "Erro",
};

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Cobranca = { id: string; vencimento: string; valor_cents: number; meio: Meio; agendamento_id: string; perfil_cobranca_id: string };

// Abre a cobrança de um título a receber no Asaas e grava boleto/Pix. Devolve a mensagem de erro, ou null se deu certo.
export async function emitirCobrancaTitulo(supabase: Supabase, agendamento: string, perfil: string, meio: Meio): Promise<string | null> {
  const { data: id, error } = await supabase.rpc("preparar_cobranca", { p_agendamento: agendamento, p_perfil: perfil, p_meio: meio });
  if (error) return mensagemBanco(error);

  const { data: c, error: ler } = await supabase.from("cobrancas").select("id, vencimento, valor_cents, meio, agendamento_id, perfil_cobranca_id").eq("id", id).single<Cobranca>();
  if (ler) return mensagemBanco(ler);
  const [{ data: t }, { data: p }] = await Promise.all([
    supabase.from("agendamentos").select("descricao, contato_id, contatos(id, nome, cpf_cnpj, email, telefone, asaas_cliente_id)").eq("id", c!.agendamento_id).single(),
    supabase.from("perfis_cobranca").select("id, juros_mes_percentual, multa_percentual, desconto_ate_vencimento_percentual").eq("id", c!.perfil_cobranca_id).single(),
  ]);
  const contato = t?.contatos as unknown as { id: string; nome: string; cpf_cnpj: string; email: string | null; telefone: string | null; asaas_cliente_id: string | null };

  try {
    const cred = await credencialDoPerfil(p!);
    // reaproveita o cliente do Asaas só se ele for mesmo deste contato (o id pode ter sido editado pela API)
    let cliente = idAsaas(contato.asaas_cliente_id, "cus");
    if (cliente) {
      const existente = await asaas<{ externalReference?: string }>(cred, `/customers/${cliente}`).catch(() => null);
      if (existente?.externalReference !== contato.id) cliente = null;
    }
    // id que não confere: limpa antes de gravar o novo (o banco não deixa trocar um id por outro)
    if (!cliente && contato.asaas_cliente_id) await supabase.from("contatos").update({ asaas_cliente_id: null }).eq("id", contato.id);
    // cliente criado numa tentativa que caiu antes de gravar: acha pelo contato em vez de duplicar
    if (!cliente) {
      cliente = (await asaas<{ data?: { id: string }[] }>(cred, `/customers?externalReference=${contato.id}&limit=1`)).data?.[0]?.id
        ?? (await asaas<{ id: string }>(cred, "/customers", { method: "POST", body: montarCliente(contato) })).id;
      await supabase.from("contatos").update({ asaas_cliente_id: cliente }).eq("id", contato.id);
    }
    const pg = await criarPagamento(cred, c!.id, montarCobranca({ clienteAsaas: cliente, cobrancaId: c!.id, meio, vencimento: c!.vencimento, valor_cents: Number(c!.valor_cents), descricao: t!.descricao, perfil: p! }));
    // grava o id antes de buscar linha e Pix, para o webhook achar a cobrança mesmo se o resto falhar
    const { error: gravar } = await supabase.from("cobrancas").update({ id_externo: pg.id, status: "emitida", url_pdf: pg.invoiceUrl ?? pg.bankSlipUrl ?? null, enviada_em: new Date().toISOString() }).eq("id", c!.id);
    // sem o id o webhook não acha o pagamento; não marca "erro" para não liberar um segundo boleto
    if (gravar) return `A cobrança ${pg.id} foi criada no Asaas, mas não consegui gravá-la aqui (${mensagemBanco(gravar)}). Não emita de novo: avise o suporte.`;
    const [linha, pix] = await Promise.all([
      meio !== "pix" ? asaas<{ identificationField?: string }>(cred, `/payments/${pg.id}/identificationField`).catch(() => null) : null,
      meio !== "boleto" ? asaas<{ payload?: string }>(cred, `/payments/${pg.id}/pixQrCode`).catch(() => null) : null,
    ]);
    await supabase.from("cobrancas").update({ linha_digitavel: linha?.identificationField ?? null, pix_copia_cola: pix?.payload ?? null, updated_at: new Date().toISOString() }).eq("id", c!.id);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao falar com o Asaas";
    await supabase.from("cobrancas").update({ status: "erro", erro: msg, updated_at: new Date().toISOString() }).eq("id", c!.id);
    return msg;
  }
}

type Criado = { id: string; invoiceUrl?: string; bankSlipUrl?: string };

// Se a rede cai ou o tempo esgota, o Asaas pode ter criado o boleto mesmo assim. Antes de marcar erro
// (o que deixa emitir de novo e gerar um segundo boleto), procura pelo id da cobrança.
async function criarPagamento(cred: Credencial, cobrancaId: string, corpo: ReturnType<typeof montarCobranca>): Promise<Criado> {
  try {
    return await asaas<Criado>(cred, "/payments", { method: "POST", body: corpo });
  } catch (e) {
    if (e instanceof AsaasErro) throw e;
    const achado = await asaas<{ data?: Criado[] }>(cred, `/payments?externalReference=${cobrancaId}&limit=1`).catch(() => null);
    if (achado?.data?.[0]) return achado.data[0];
    throw e;
  }
}
