import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { MarcaBalbina } from "@/components/marca";
import { SeletorEmpresa } from "@/components/seletor-empresa";
import { SeletorTema } from "@/components/tema";
import { Aviso, Cartao, CLASSE_BOTAO_TEXTO, Etiqueta, LinkBotao, Titulo } from "@/components/ui";
import { sair } from "@/app/login/actions";
import { exigirAceiteTermos } from "@/lib/aceite-termos";
import { balbinaAsaasConfigurado, getAssinatura } from "@/lib/assinatura";
import { situacao, type NivelPlano, type Plano } from "@/lib/assinatura-mapa";
import { getEmpresaAtual, nomeEmpresa } from "@/lib/empresa";
import { formatarMoeda, hojeISO } from "@/lib/formato";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { assinar, cancelarAssinatura } from "./actions";

export const metadata: Metadata = { title: "Assinatura · Balbina" };

// Fica fora do layout do app: é para onde vai quem está com o acesso suspenso.
export default async function PaginaAssinatura() {
  await exigirAceiteTermos("/assinatura");
  const { atual, todas } = await getEmpresaAtual();
  const [assinatura, { master }, supabase] = await Promise.all([getAssinatura(atual.id), getPermissoes(), createClient()]);
  const [{ data: planos }, { data: niveis }] = await Promise.all([
    supabase.from("planos").select("id, nome, descricao, valor_cents, ciclo, nivel").order("ordem").returns<Plano[]>(),
    supabase.from("niveis_plano").select("id, nome, descricao, ordem, modulos").order("ordem").returns<NivelPlano[]>(),
  ]);
  const configurado = balbinaAsaasConfigurado();
  const cancelavel = assinatura.tem_assinatura && assinatura.status !== "cancelada" && assinatura.status !== "cortesia";

  return (
    <main className="relative flex flex-1 flex-col px-5 py-6 sm:px-10">
      <header className="flex items-center justify-between gap-3">
        <MarcaBalbina />
        <div className="flex items-center gap-2">
          <SeletorTema />
          <form action={sair}>
            <button type="submit" aria-label="Sair" title="Sair" className="grid size-8 place-items-center rounded-md text-texto-suave hover:bg-elevado hover:text-texto">
              <LogOut size={16} strokeWidth={1.75} aria-hidden />
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-10">
        <div className="max-w-xs">
          <SeletorEmpresa atual={atual.id} opcoes={todas.map((e) => ({ id: e.id, nome: nomeEmpresa(e) }))} />
        </div>
        <Titulo
          descricao={situacao(assinatura, hojeISO("America/Sao_Paulo"))}
          acoes={assinatura.liberada ? <LinkBotao href="/painel">Voltar ao sistema</LinkBotao> : undefined}
        >
          Assinatura do Balbina
        </Titulo>

        {!assinatura.liberada && (
          <Aviso tipo="alerta">
            O acesso aos dados de {nomeEmpresa(atual)} está suspenso. Nada foi apagado: assim que o pagamento for confirmado, tudo volta como estava.
          </Aviso>
        )}

        {assinatura.fatura_url && (
          <Cartao titulo="Fatura em aberto" descricao="Pague por Pix, boleto ou cartão. A liberação é automática quando o pagamento é confirmado.">
            <a href={assinatura.fatura_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-xl bg-destaque px-4 text-sm font-medium text-destaque-texto hover:bg-destaque/88">
              Pagar fatura
            </a>
          </Cartao>
        )}

        {assinatura.status === "teste" && assinatura.liberada && (
          <Aviso tipo="info">
            Durante o teste grátis você usa o Balbina Gestão completo. Depois dele, valem os módulos do plano que você assinar.
          </Aviso>
        )}

        {!master ? (
          <Cartao>
            <p className="text-sm">Só o usuário master da empresa pode assinar ou trocar o plano. Peça a ele para entrar nesta tela.</p>
          </Cartao>
        ) : !configurado ? (
          <Aviso tipo="info">A cobrança da assinatura ainda não foi configurada neste servidor. Fale com o suporte do Balbina.</Aviso>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Um cartão por nível (Basic, Vendas, Fiscal, Gestão), com o preço mensal e o anual */}
            {(niveis ?? []).map((n) => {
              const opcoes = (planos ?? []).filter((p) => p.nivel === n.id);
              if (opcoes.length === 0) return null;
              const seu = cancelavel && opcoes.some((p) => p.id === assinatura.plano_id);
              return (
                <Cartao key={n.id} titulo={n.nome} descricao={n.descricao ?? undefined} acoes={seu ? <Etiqueta tom="positivo">Seu plano</Etiqueta> : undefined}>
                  <div className="flex flex-col gap-3">
                    {opcoes.map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xl font-semibold tabular-nums">
                          {formatarMoeda(p.valor_cents)}
                          <span className="text-sm font-normal text-texto-suave"> / {p.ciclo === "anual" ? "ano" : "mês"}</span>
                        </p>
                        {assinatura.plano_id === p.id && cancelavel ? (
                          <span className="text-xs text-texto-suave">assinado</span>
                        ) : (
                          <FormAcao acao={assinar} botao={cancelavel ? "Trocar" : "Assinar"} variante={assinatura.liberada ? "secundario" : "primario"}>
                            <input type="hidden" name="plano" value={p.id} />
                          </FormAcao>
                        )}
                      </div>
                    ))}
                  </div>
                </Cartao>
              );
            })}
          </div>
        )}

        {master && configurado && cancelavel && (
          <Cartao titulo="Cancelar assinatura" descricao="Para as próximas cobranças. O acesso continua até o fim do período já pago.">
            <FormAcao acao={cancelarAssinatura} botao="Cancelar assinatura" variante="secundario">
              <></>
            </FormAcao>
          </Cartao>
        )}

        <p className="text-xs text-texto-suave">
          Veja os <Link href="/termos" className={CLASSE_BOTAO_TEXTO}>Termos de uso</Link> e a{" "}
          <Link href="/privacidade" className={CLASSE_BOTAO_TEXTO}>Política de privacidade</Link>.
        </p>
      </div>
    </main>
  );
}
