import Link from "next/link";
import { AcaoConfirmada } from "@/components/acao-confirmada";
import { FormAcao } from "@/components/form-acao";
import { Cartao, CLASSE_BOTAO_TEXTO, classeBotao, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { openFinanceConfigurado } from "@/lib/open-finance";
import { exigirAcesso } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { ConectarBanco } from "../conectar-banco";
import { desconectarBanco, desligarConta, sincronizarAgora } from "../open-finance-actions";

const STATUS: Record<string, { texto: string; alerta: boolean }> = {
  ativa: { texto: "Funcionando", alerta: false },
  atualizando: { texto: "Atualizando no banco", alerta: false },
  precisa_login: { texto: "Precisa renovar a autorização", alerta: true },
  erro: { texto: "Com erro", alerta: true },
};

function quando(iso: string | null) {
  if (!iso) return "ainda não leu";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export default async function PaginaBancos() {
  await exigirAcesso("conciliacao");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: conexoes }, { data: contas }, { data: saldos }] = await Promise.all([
    supabase.from("conexoes_bancarias").select("id, item_id, instituicao, status, erro, ultima_sincronizacao, created_at")
      .eq("empresa_id", atual.id).neq("status", "desconectada").order("created_at"),
    supabase.from("contas_financeiras").select("id, nome, open_finance_item_id, saldo_banco_cents, saldo_banco_em, saldo_inicial_data")
      .eq("empresa_id", atual.id).not("open_finance_item_id", "is", null),
    supabase.from("saldos_contas").select("conta_id, saldo_cents").eq("empresa_id", atual.id),
  ]);
  const configurado = openFinanceConfigurado();

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Titulo descricao="Com o banco conectado pelo Open Finance, o extrato entra sozinho todo dia na conciliação. A autorização é dada no app do banco e pode ser revogada a qualquer momento."
        acoes={configurado ? <ConectarBanco rotulo={conexoes?.length ? "Conectar outro banco" : "Conectar banco"} /> : undefined}>
        Bancos conectados
      </Titulo>
      <Link href="/conciliacao" className={`${classeBotao("secundario", "sm")} self-start`}>← Voltar para a conciliação</Link>

      {!configurado && (
        <Cartao titulo="Ativar o Open Finance">
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>Crie a conta da empresa em <a href="https://dashboard.pluggy.ai" className={CLASSE_BOTAO_TEXTO} target="_blank" rel="noreferrer">dashboard.pluggy.ai</a> (agregador autorizado pelo Banco Central).</li>
            <li>Em Applications, copie o Client ID e o Client Secret.</li>
            <li>Na Vercel, cadastre <code>PLUGGY_CLIENT_ID</code>, <code>PLUGGY_CLIENT_SECRET</code>, <code>PLUGGY_WEBHOOK_TOKEN</code> (um texto aleatório) e <code>CRON_SECRET</code>, e faça um novo deploy.</li>
            <li>Volte aqui e clique em Conectar banco.</li>
          </ol>
        </Cartao>
      )}

      {configurado && !conexoes?.length && (
        <p className="rounded-lg border border-dashed border-borda p-6 text-center text-sm text-texto-suave">
          Nenhum banco conectado ainda. As contas do banco são criadas aqui sozinhas e o extrato começa no dia 1º deste mês.
        </p>
      )}

      {(conexoes ?? []).map((c) => {
        const status = STATUS[c.status] ?? STATUS.erro;
        const ligadas = (contas ?? []).filter((x) => x.open_finance_item_id === c.item_id);
        return (
          <Cartao key={c.id}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{c.instituicao ?? "Banco"}</h2>
                  <p className={`text-sm ${status.alerta ? "text-perigo" : "text-texto-suave"}`}>
                    {status.texto} · última leitura {quando(c.ultima_sincronizacao)}
                  </p>
                  {status.alerta && c.erro && <p className="text-sm text-perigo">{c.erro}</p>}
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <FormAcao acao={sincronizarAgora} botao="Buscar lançamentos agora" variante="secundario">
                    <input type="hidden" name="conexao_id" value={c.id} />
                  </FormAcao>
                  <ConectarBanco itemId={c.item_id} rotulo="Renovar autorização" variante={status.alerta ? "primario" : "secundario"} />
                </div>
              </div>

              {ligadas.length > 0 ? (
                <ul className="divide-y divide-borda rounded-md border border-borda">
                  {ligadas.map((conta) => {
                    const sistema = saldos?.find((s) => s.conta_id === conta.id)?.saldo_cents;
                    const diferenca = conta.saldo_banco_cents != null && sistema != null ? Number(conta.saldo_banco_cents) - Number(sistema) : null;
                    return (
                      <li key={conta.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span>
                          <Link href={`/conciliacao?conta=${conta.id}`} className="font-medium underline-offset-4 hover:underline">{conta.nome}</Link>
                          <span className="block text-xs text-texto-suave">
                            Extrato desde {formatarData(conta.saldo_inicial_data)} · no banco {formatarMoeda(conta.saldo_banco_cents)} · no sistema {formatarMoeda(sistema)}
                            {diferenca ? <span className="text-perigo"> · diferença {formatarMoeda(diferenca)}</span> : null}
                          </span>
                        </span>
                        <AcaoConfirmada acao={desligarConta} botao="Desconectar esta conta"
                          pergunta={<>{conta.nome} deixa de receber o extrato pelo Open Finance. O que já foi importado e conciliado continua.</>}>
                          <input type="hidden" name="conta_id" value={conta.id} />
                        </AcaoConfirmada>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-texto-suave">Nenhuma conta deste banco está recebendo extrato.</p>
              )}

              <AcaoConfirmada acao={desconectarBanco} botao="Desconectar o banco" variante="perigo" confirmar="Desconectar e revogar"
                pergunta={<>Revoga a autorização de {c.instituicao ?? "o banco"} no Open Finance e para de importar em todas as contas dele. O extrato já importado e as conciliações continuam.</>}>
                <input type="hidden" name="conexao_id" value={c.id} />
              </AcaoConfirmada>
            </div>
          </Cartao>
        );
      })}
    </div>
  );
}
