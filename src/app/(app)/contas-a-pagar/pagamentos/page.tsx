import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Cartao, Etiqueta, Titulo, Vazio } from "@/components/ui";
import { formatarLinha } from "@/lib/boleto";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, formatarMoeda, hojeISO, somarDias } from "@/lib/formato";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { aprovarPagamentos, cancelarPagamento, proporPagamentos } from "./actions";

const DIAS = 10;
const SITUACAO: Record<string, { nome: string; tom: "neutro" | "positivo" | "perigo" | "alerta" | "info" }> = {
  proposto: { nome: "aguardando aprovação", tom: "alerta" },
  enviado: { nome: "enviado ao Asaas", tom: "info" },
  pago: { nome: "pago", tom: "positivo" },
  falhou: { nome: "não pago", tom: "perigo" },
  cancelado: { nome: "cancelado", tom: "neutro" },
};

// C7: pagar boletos pelo Balbina, pela conta Asaas da piscicultura. Quem lança propõe; o master aprova.
export default async function PaginaPagamentos() {
  await exigirAcesso("contas-a-pagar");
  const { pode, master } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const hoje = hojeISO(atual.fuso);
  const supabase = await createClient();
  const [{ data: cfg }, { data: perfil }, { data: abertos }, { data: pagamentos }] = await Promise.all([
    supabase.from("automacoes_empresa").select("pagamentos_ligado, pagamento_limite_dia_cents, pagamento_aprovacao_unica").eq("empresa_id", atual.id).maybeSingle(),
    supabase.from("perfis_cobranca").select("id").eq("empresa_id", atual.id).eq("provedor", "asaas").eq("ativo", true).limit(1).maybeSingle(),
    supabase.from("titulos").select("id, descricao, referencia, vencimento, saldo_cents, contato_nome")
      .eq("empresa_id", atual.id).eq("tipo", "pagar").in("status", ["aberto", "parcial"]).lte("vencimento", somarDias(hoje, DIAS))
      .order("vencimento").limit(300),
    supabase.from("pagamentos_saida").select("id, agendamento_id, linha, valor_cents, data_pagamento, status, erro, id_externo, proposto_por, created_at, agendamentos(descricao)")
      .eq("empresa_id", atual.id).gte("created_at", `${somarDias(hoje, -30)}T00:00:00Z`).order("created_at", { ascending: false }).limit(200),
  ]);
  const ativos = new Set((pagamentos ?? []).filter((p) => p.status === "proposto" || p.status === "enviado").map((p) => p.agendamento_id));
  const boletos = (abertos ?? []).filter((t) => /^\d{47,48}$/.test(t.referencia ?? "") && Number(t.saldo_cents) > 0 && !ativos.has(t.id));
  const semBoleto = (abertos ?? []).filter((t) => !/^\d{47,48}$/.test(t.referencia ?? "")).length;
  const propostos = (pagamentos ?? []).filter((p) => p.status === "proposto");
  const historico = (pagamentos ?? []).filter((p) => p.status !== "proposto");
  const descricao = (p: { agendamentos: unknown }) => (p.agendamentos as { descricao: string } | null)?.descricao ?? "Conta a pagar";
  const podePropor = pode("contas-a-pagar.editar");

  if (!cfg?.pagamentos_ligado || !perfil) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <Titulo descricao="Pagar boletos pelo Balbina, pela conta Asaas da piscicultura, com aprovação do master.">Pagamentos pelo Asaas</Titulo>
        <Vazio>
          {!perfil ? "Conecte antes a conta Asaas da piscicultura em Cobranças. " : ""}
          {!cfg?.pagamentos_ligado ? "O master liga em Configurações › Automações › Pagamentos pelo sistema, com o limite por dia." : ""}
        </Vazio>
      </div>
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Titulo descricao={`Quem lança contas a pagar propõe; o master aprova com o segundo fator e o Asaas paga da conta da piscicultura. A baixa entra quando o Asaas confirma. Limite por dia: ${formatarMoeda(Number(cfg.pagamento_limite_dia_cents))}.`}>
        Pagamentos pelo Asaas
      </Titulo>

      <Cartao titulo={`Boletos para pagar até ${formatarData(somarDias(hoje, DIAS))}`}>
        {boletos.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhum boleto em aberto com linha digitável nos próximos {DIAS} dias.{semBoleto ? ` ${semBoleto} conta(s) sem linha digitável não aparecem aqui.` : ""}</p>
        ) : (
          <FormAcao acao={proporPagamentos} botao="Propor o pagamento dos marcados" variante="secundario">
            <ul className="-my-2 divide-y divide-linha text-sm">
              {boletos.map((t) => (
                <li key={t.id}>
                  <label className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <input type="checkbox" name="titulo" value={t.id} disabled={!podePropor} className="size-4 accent-marca" />
                    <span className="w-20 tabular-nums text-texto-suave">{formatarData(t.vencimento)}</span>
                    <span className="flex min-w-48 flex-1 flex-col">
                      <span className="font-medium">{t.descricao}</span>
                      <span className="font-mono text-xs text-texto-suave">{t.contato_nome ? `${t.contato_nome} · ` : ""}{formatarLinha(t.referencia ?? "")}</span>
                    </span>
                    <span className="font-medium tabular-nums">{formatarMoeda(Number(t.saldo_cents))}</span>
                  </label>
                </li>
              ))}
            </ul>
            {semBoleto > 0 && <p className="text-xs text-texto-suave">{semBoleto} conta(s) sem linha digitável não aparecem aqui (cadastre a linha na conta).</p>}
          </FormAcao>
        )}
      </Cartao>

      <Cartao titulo="Aguardando aprovação" cor="laranja">
        {propostos.length === 0 ? <p className="text-sm text-texto-suave">Nada esperando aprovação.</p> : (
          <div className="flex flex-col gap-4">
            <FormAcao acao={aprovarPagamentos} botao="Aprovar e pagar os marcados">
              <ul className="-my-2 divide-y divide-linha text-sm">
                {propostos.map((p) => (
                  <li key={p.id}>
                    <label className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                      <input type="checkbox" name="pagamento" value={p.id} disabled={!master} className="size-4 accent-marca" />
                      <span className="w-20 tabular-nums text-texto-suave">{formatarData(p.data_pagamento)}</span>
                      <span className="flex min-w-48 flex-1 flex-col">
                        <span className="font-medium">{descricao(p)}</span>
                        <span className="font-mono text-xs text-texto-suave">{formatarLinha(p.linha)}</span>
                      </span>
                      <span className="font-medium tabular-nums">{formatarMoeda(Number(p.valor_cents))}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {master ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="confirmo" required className="size-4 accent-marca" />
                  Conferi as linhas e os valores: o dinheiro sai da conta Asaas da piscicultura
                </label>
              ) : (
                <p className="text-xs text-texto-suave">Só o usuário master aprova.{cfg.pagamento_aprovacao_unica ? "" : " Quem propôs não pode aprovar."}</p>
              )}
            </FormAcao>
            {podePropor && (
              <div className="flex flex-wrap gap-2">
                {propostos.map((p) => (
                  <FormAcao key={p.id} acao={cancelarPagamento} botao={`Cancelar ${descricao(p)}`} variante="secundario">
                    <input type="hidden" name="id" value={p.id} />
                  </FormAcao>
                ))}
              </div>
            )}
          </div>
        )}
      </Cartao>

      <Cartao titulo="Últimos 30 dias">
        {historico.length === 0 ? <p className="text-sm text-texto-suave">Nenhum pagamento enviado ainda.</p> : (
          <ul className="-my-2 divide-y divide-linha text-sm">
            {historico.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="w-20 tabular-nums text-texto-suave">{formatarData(p.data_pagamento)}</span>
                <span className="flex min-w-48 flex-1 flex-col">
                  <span className="font-medium">{descricao(p)}</span>
                  {p.erro && <span className="text-xs text-texto-suave">{p.erro}</span>}
                </span>
                <span className="tabular-nums">{formatarMoeda(Number(p.valor_cents))}</span>
                <Etiqueta tom={SITUACAO[p.status].tom}>{SITUACAO[p.status].nome}</Etiqueta>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      <p className="text-xs text-texto-suave">
        Precisa de saldo na conta Asaas e da prova de vida feita no Asaas. Pagamento no dia segue o horário de corte do banco.
        Para cadastrar a linha digitável, use <Link href="/contas-a-pagar/documentos" className="underline">Boletos e notas por foto</Link> ou o campo referência da conta.
      </p>
    </div>
  );
}
