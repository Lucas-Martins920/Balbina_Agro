import { Check, FileUp, SkipForward } from "lucide-react";
import { Aviso, Botao, Cartao, Etiqueta, LinkBotao, Titulo } from "@/components/ui";
import { passosConhecidos, progresso, proximoPasso, textoFaltam } from "@/lib/assistente";
import { getAssistente } from "@/lib/assistente-dados";
import { getEmpresaAtual, nomeEmpresa } from "@/lib/empresa";
import { exigirMaster } from "@/lib/permissoes";
import { esconderAssistente, pularPasso, retomarAssistente } from "./actions";

// Passos que a planilha modelo resolve de uma vez (aba Para começar).
const DA_PLANILHA = ["piscicultura", "lotes", "estoque"];

export default async function PrimeirosPassos() {
  await exigirMaster();
  const [situacao, { atual }] = await Promise.all([getAssistente(), getEmpresaAtual()]);
  if (!situacao) return null;
  const passos = passosConhecidos(situacao);
  const proximo = proximoPasso(situacao);
  const pronto = situacao.faltam === 0;
  const planilhaAjuda = passos.some((p) => DA_PLANILHA.includes(p.id) && !p.feito);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Titulo
        descricao={`Deixe a ${nomeEmpresa(atual)} pronta para o dia a dia. Pule o que não usa e volte quando quiser.`}
        acoes={
          !pronto && !situacao.escondido && (
            <form action={esconderAssistente}>
              <Botao type="submit" variante="fantasma" tamanho="sm">Fazer depois</Botao>
            </form>
          )
        }
      >
        Primeiros passos
      </Titulo>

      <section aria-label="Progresso" className="vidro flex flex-col gap-3 rounded-2xl border border-borda p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[17px] font-semibold tracking-[-0.015em]">{textoFaltam(situacao.faltam)}</p>
          <p className="text-[13px] text-texto-suave tabular-nums">
            {passos.length - situacao.faltam} de {passos.length} resolvidos
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Passos resolvidos"
          aria-valuemin={0}
          aria-valuemax={passos.length}
          aria-valuenow={passos.length - situacao.faltam}
          className="h-2 overflow-hidden rounded-full bg-elevado"
        >
          <div className="crescer-x h-full rounded-full bg-marca" style={{ width: `${Math.round(progresso(situacao) * 100)}%` }} />
        </div>
        {situacao.escondido && !pronto && (
          <form action={retomarAssistente} className="flex flex-wrap items-center gap-3">
            <p className="text-[13px] text-texto-suave">O assistente está escondido do painel.</p>
            <Botao type="submit" variante="secundario" tamanho="sm">Mostrar no painel</Botao>
          </form>
        )}
        {pronto && (
          <>
            <Aviso tipo="sucesso">A piscicultura está configurada. O assistente sai do painel; para revê-lo, use Configurações.</Aviso>
            <LinkBotao href="/painel" variante="primario" className="self-start">Ir para o painel</LinkBotao>
          </>
        )}
      </section>

      {planilhaAjuda && (
        <Cartao
          titulo="Tem tudo numa planilha?"
          descricao="Baixe o modelo, preencha viveiros, lotes e estoque inicial e envie: o Balbina confere linha por linha antes de lançar."
          icone={FileUp}
          cor="verde"
        >
          <LinkBotao href="/configuracoes/importar" tamanho="sm">Usar a planilha modelo</LinkBotao>
        </Cartao>
      )}

      <ol className="flex flex-col gap-3">
        {passos.map((p, i) => (
          <li key={p.id} className={`vidro flex flex-col gap-3 rounded-2xl border border-borda p-5 sm:flex-row sm:items-start ${p.feito || p.pulado ? "opacity-80" : ""}`}>
            <span
              aria-hidden
              className={`grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold ${
                p.feito ? "border-positivo bg-positivo text-destaque-texto" : p.id === proximo?.id ? "border-marca bg-marca/16" : "border-borda text-texto-suave"
              }`}
            >
              {p.feito ? <Check size={16} strokeWidth={2.5} /> : p.pulado ? <SkipForward size={14} /> : i + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                {p.titulo}
                {p.feito && <Etiqueta tom="positivo">Feito</Etiqueta>}
                {!p.feito && p.pulado && <Etiqueta>Pulado</Etiqueta>}
              </h2>
              <p className="text-[13px] text-texto-suave">{p.descricao}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {p.feito ? (
                  <LinkBotao href={p.href} tamanho="sm" variante="fantasma">Ver</LinkBotao>
                ) : (
                  <>
                    <LinkBotao href={p.href} tamanho="sm" variante={p.id === proximo?.id ? "primario" : "secundario"}>{p.acao}</LinkBotao>
                    <form action={pularPasso.bind(null, p.id, !p.pulado)}>
                      <Botao type="submit" tamanho="sm" variante="fantasma">{p.pulado ? "Voltar a pedir" : "Pular"}</Botao>
                    </form>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
