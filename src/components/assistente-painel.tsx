import { ArrowRight, Rocket } from "lucide-react";
import { Ficha, LinkBotao } from "@/components/ui";
import { progresso, proximoPasso, textoFaltam, type SituacaoAssistente } from "@/lib/assistente";
import { esconderAssistente } from "@/app/(app)/primeiros-passos/actions";

// Faixa no topo do painel enquanto a piscicultura não está configurada: quanto falta e o próximo passo.
export function AssistentePainel({ situacao }: { situacao: SituacaoAssistente }) {
  const proximo = proximoPasso(situacao);
  return (
    <section aria-label="Primeiros passos" data-cartao="Primeiros passos" className="vidro flex flex-col gap-4 rounded-2xl border border-borda p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Ficha icone={Rocket} cor="marca" />
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.015em]">Configure sua piscicultura</h2>
            <p className="mt-0.5 text-[13px] text-texto-suave">
              {textoFaltam(situacao.faltam)}{proximo ? `. Próximo: ${proximo.titulo.toLowerCase()}.` : "."}
            </p>
          </div>
        </div>
        <form action={esconderAssistente}>
          <button type="submit" className="text-[13px] text-texto-suave transition-colors duration-150 hover:text-texto">
            Fazer depois
          </button>
        </form>
      </div>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-elevado">
        <div className="crescer-x h-full rounded-full bg-marca" style={{ width: `${Math.round(progresso(situacao) * 100)}%` }} />
      </div>
      <div className="flex flex-wrap gap-2">
        {proximo && (
          <LinkBotao href={proximo.href} variante="primario" tamanho="sm">
            {proximo.acao} <ArrowRight size={14} aria-hidden />
          </LinkBotao>
        )}
        <LinkBotao href="/primeiros-passos" tamanho="sm">Ver todos os passos</LinkBotao>
      </div>
    </section>
  );
}
