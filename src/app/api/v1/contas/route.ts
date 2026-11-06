import { erroBanco, respostaApi, rotaApi, semEscopo } from "@/lib/api/servidor";

// Contas bancárias, caixas e cartões com o saldo de hoje (o mesmo da tela Contas e saldos).
export const GET = rotaApi(async (ctx) => {
  if (!ctx.pode("contas.ver")) return semEscopo("contas.ver");
  const [contas, saldos] = await Promise.all([
    ctx.db.from("contas_financeiras").select("id, tipo, nome, banco_codigo, agencia, conta, conta_dv, saldo_inicial_cents, saldo_inicial_data, limite_cents, arquivada")
      .eq("empresa_id", ctx.empresaId).order("nome"),
    ctx.db.from("saldos_contas").select("conta_id, saldo_cents, ultimo_movimento").eq("empresa_id", ctx.empresaId),
  ]);
  if (contas.error) return erroBanco(contas.error);
  if (saldos.error) return erroBanco(saldos.error);
  const porConta = new Map((saldos.data ?? []).map((s) => [s.conta_id, s]));
  return respostaApi({
    dados: (contas.data ?? []).map((c) => ({
      ...c,
      saldo_cents: porConta.get(c.id)?.saldo_cents ?? c.saldo_inicial_cents,
      ultimo_movimento: porConta.get(c.id)?.ultimo_movimento ?? null,
    })),
  });
});
