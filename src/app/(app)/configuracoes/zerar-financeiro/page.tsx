import Link from "next/link";
import { Aviso, Cartao, CLASSE_BOTAO_TEXTO, LinkBotao, Titulo } from "@/components/ui";
import { getEmpresaAtual, nomeEmpresa } from "@/lib/empresa";
import { formatarMoeda, formatarNumero } from "@/lib/formato";
import { exigirMaster } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { FormZerar } from "./form";

export default async function PaginaZerarFinanceiro() {
  await exigirMaster();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const contar = (tabela: string) =>
    supabase.from(tabela).select("*", { count: "exact", head: true }).eq("empresa_id", atual.id).then((r) => r.count ?? 0);
  const [titulos, baixas, transferencias, extrato, conciliacoes, { data: saldos }, { data: fatores }] = await Promise.all([
    contar("agendamentos"), contar("baixas"), contar("transferencias"), contar("movimentos_bancarios"), contar("conciliacoes"),
    supabase.from("saldos_contas").select("saldo_cents").eq("empresa_id", atual.id),
    supabase.auth.mfa.listFactors(),
  ]);
  const saldoTotal = (saldos ?? []).reduce((s, c) => s + Number(c.saldo_cents), 0);
  const temAutenticador = (fatores?.totp.length ?? 0) > 0;
  const nome = nomeEmpresa(atual);

  const itens: [string, string][] = [
    ["Títulos a pagar e receber", formatarNumero(titulos)],
    ["Pagamentos e recebimentos (baixas)", formatarNumero(baixas)],
    ["Transferências entre contas", formatarNumero(transferencias)],
    ["Lançamentos do extrato", formatarNumero(extrato)],
    ["Conciliações", formatarNumero(conciliacoes)],
    ["Saldo somado das contas", formatarMoeda(saldoTotal)],
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Titulo descricao="Apaga todos os lançamentos e a conciliação desta empresa e deixa o saldo de todas as contas e caixas em zero. Não tem volta.">
        Zerar financeiro
      </Titulo>

      <Cartao titulo="O que vai ser apagado" descricao={nome}>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {itens.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex justify-between gap-3 border-b border-linha py-1.5">
              <dt className="text-texto-suave">{rotulo}</dt>
              <dd className="font-medium tabular-nums">{valor}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[13px] text-texto-suave">
          Também saem recorrências, cobranças e remessas dos títulos, extratos importados e meses fechados.
          Ficam: contas e caixas (com saldo zero), categorias, centros de custo, clientes e fornecedores, produtos,
          regras de conciliação, Open Finance, produção, estoque, vendas e notas. As vendas continuam; só o título
          que elas geraram some. Cada exclusão fica no Histórico de alterações.
        </p>
      </Cartao>

      <Cartao titulo="1. Baixe a cópia de segurança" descricao="Um arquivo com tudo que vai ser apagado, para guardar antes de zerar.">
        <LinkBotao href="/configuracoes/zerar-financeiro/backup" prefetch={false} className="self-start">Baixar cópia (JSON)</LinkBotao>
      </Cartao>

      <Cartao titulo="2. Confirme e zere">
        {temAutenticador ? (
          <FormZerar nomeEmpresa={nome} />
        ) : (
          <Aviso tipo="alerta">
            Para zerar o financeiro é preciso o código do app autenticador. Ative a verificação em duas etapas
            com app em <Link href="/seguranca" className={CLASSE_BOTAO_TEXTO}>Segurança</Link> e volte aqui.
          </Aviso>
        )}
      </Cartao>
    </div>
  );
}
