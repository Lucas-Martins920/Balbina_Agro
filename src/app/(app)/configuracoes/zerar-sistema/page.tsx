import Link from "next/link";
import { Aviso, Cartao, CLASSE_BOTAO_TEXTO, LinkBotao, Titulo } from "@/components/ui";
import { getEmpresaAtual, nomeEmpresa } from "@/lib/empresa";
import { formatarNumero } from "@/lib/formato";
import { exigirMaster } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { FormZerarSistema } from "./form";

export default async function PaginaZerarSistema() {
  await exigirMaster();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const contar = (tabela: string) =>
    supabase.from(tabela).select("*", { count: "exact", head: true }).eq("empresa_id", atual.id).then((r) => r.count ?? 0);
  const [lotes, apontamentos, estoque, pedidos, notas, titulos, baixas, documentos, { data: fatores }] =
    await Promise.all([
      contar("lotes"), contar("apontamentos_diarios"), contar("movimentos_estoque"), contar("pedidos_venda"), contar("notas_fiscais"),
      contar("agendamentos"), contar("baixas"), contar("documentos"),
      supabase.auth.mfa.listFactors(),
    ]);
  const temAutenticador = (fatores?.totp.length ?? 0) > 0;
  const nome = nomeEmpresa(atual);

  const itens: [string, number][] = [
    ["Lotes (com alocações e transferências)", lotes],
    ["Apontamentos diários", apontamentos],
    ["Movimentos de estoque", estoque],
    ["Pedidos de venda", pedidos],
    ["Notas fiscais emitidas", notas],
    ["Títulos a pagar e receber", titulos],
    ["Pagamentos e recebimentos (baixas)", baixas],
    ["Documentos e anexos", documentos],
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Titulo descricao="Apaga todos os movimentos desta empresa para recomeçar do zero, com os cadastros prontos. Não tem volta.">
        Zerar todo o sistema
      </Titulo>

      <Aviso tipo="alerta">
        Vale só para <strong>{nome}</strong>. Outras empresas em que você trabalha não são tocadas, e a assinatura continua igual.
      </Aviso>

      <Cartao titulo="O que vai ser apagado" descricao={nome}>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {itens.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex justify-between gap-3 border-b border-linha py-1.5">
              <dt className="text-texto-suave">{rotulo}</dt>
              <dd className="font-medium tabular-nums">{formatarNumero(valor)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[13px] text-texto-suave">
          Também saem: apontamentos na lixeira, biometrias, despescas, eventos sanitários e medicações, ordens de produção de
          ração, pedidos gerados pelos pedidos fixos, transferências de peixe entre pontos de venda, notas recebidas e
          inutilizações, recorrências, cobranças, pagamentos de boleto pelo Asaas, extratos e conciliação, meses fechados
          e a caixa de entrada de documentos. O estoque fica zerado e as contas e caixas ficam com
          saldo zero.
        </p>
      </Cartao>

      <Cartao titulo="O que fica">
        <p className="text-sm">
          A empresa, os usuários, cargos e logins; assinatura e plano; o Histórico de alterações; todos os cadastros
          (clientes e fornecedores, produtos, classes de peixe, depósitos, setores e viveiros, espécies e curvas, categorias, centros de
          custo, contas e caixas, fórmulas, medicamentos,
          tabelas de preço, pontos de venda, regras fiscais e de conciliação, pedidos fixos, checklist); planejamento e
          orçamento; configurações e integrações (Asaas, Focus NFe, Open Finance, WhatsApp, API, automações).
        </p>
        <p className="mt-3 text-[13px] text-texto-suave">
          O que já saiu do Balbina continua lá fora: notas autorizadas seguem na Sefaz e na Focus NFe, e boletos e cobranças
          emitidos seguem no Asaas. Notas fiscais têm guarda obrigatória por lei (5 anos): guarde a cópia
          de segurança. Cada linha apagada fica no Histórico de alterações, com quem zerou e quando.
        </p>
      </Cartao>

      <Cartao titulo="1. Baixe a cópia de segurança" descricao="Um arquivo com tudo que vai ser apagado, para guardar antes de zerar.">
        <LinkBotao href="/configuracoes/zerar-sistema/backup" prefetch={false} className="self-start">Baixar cópia (JSON)</LinkBotao>
      </Cartao>

      <Cartao titulo="2. Confirme e zere" descricao="Nome da empresa, a frase ZERAR TUDO e o código do autenticador.">
        {temAutenticador ? (
          <FormZerarSistema nomes={[nome, atual.razao_social]} />
        ) : (
          <Aviso tipo="alerta">
            Para zerar o sistema é preciso o código do app autenticador. Ative a verificação em duas etapas com app em{" "}
            <Link href="/seguranca" className={CLASSE_BOTAO_TEXTO}>Segurança</Link> e volte aqui.
          </Aviso>
        )}
      </Cartao>
    </div>
  );
}
