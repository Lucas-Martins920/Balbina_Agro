import { FormAcao } from "@/components/form-acao";
import { Campo, Cartao, Etiqueta, Tabela, Titulo } from "@/components/ui";
import { ENDPOINTS } from "@/lib/api/catalogo";
import { ESCOPOS, EVENTOS } from "@/lib/api/regras";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData } from "@/lib/formato";
import { exigirMaster, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { alterarWebhook, criarChave, criarWebhook, revogarChave } from "./actions";
import { FormSegredo } from "./form-segredo";

type Chave = { id: string; nome: string; prefixo: string; escopos: string[]; criada_em: string; expira_em: string | null; revogada_em: string | null };
type Webhook = { id: string; url: string; eventos: string[]; ativo: boolean; criado_em: string };
type Entrega = { id: string; webhook_id: string; evento: string; criado_em: string; tentativas: number; entregue_em: string | null; status_http: number | null; erro: string | null };

const GRUPOS_ESCOPO = [...new Set(ESCOPOS.map((e) => e.grupo))];
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://SEU-ENDERECO";

function situacaoChave(c: Chave) {
  if (c.revogada_em) return <Etiqueta tom="perigo">Revogada</Etiqueta>;
  if (c.expira_em && new Date(c.expira_em) < new Date()) return <Etiqueta tom="alerta">Vencida</Etiqueta>;
  return <Etiqueta tom="positivo">Ativa</Etiqueta>;
}

export default async function PaginaApi() {
  await exigirMaster();
  const { noPlano } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: chaves }, { data: usos }, { data: webhooks }, { data: entregas }] = await Promise.all([
    supabase.from("api_chaves").select("id, nome, prefixo, escopos, criada_em, expira_em, revogada_em").eq("empresa_id", atual.id).order("criada_em", { ascending: false }),
    supabase.from("api_chaves_uso").select("chave_id, ultimo_uso_em"),
    supabase.from("api_webhooks").select("id, url, eventos, ativo, criado_em").eq("empresa_id", atual.id).order("criado_em"),
    supabase.from("api_webhook_entregas").select("id, webhook_id, evento, criado_em, tentativas, entregue_em, status_http, erro")
      .eq("empresa_id", atual.id).order("criado_em", { ascending: false }).limit(20),
  ]);
  const ultimoUso = new Map((usos ?? []).map((u) => [u.chave_id as string, u.ultimo_uso_em as string]));
  const listaChaves = (chaves ?? []) as Chave[];
  const listaWebhooks = (webhooks ?? []) as Webhook[];
  const listaEntregas = (entregas ?? []) as Entrega[];
  const urlWebhook = new Map(listaWebhooks.map((w) => [w.id, w.url]));
  const foraDoPlano = ESCOPOS.filter((e) => !noPlano(e.chave.split(".")[0])).map((e) => e.nome.toLowerCase());

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Titulo descricao="Chaves para outros sistemas (ERP, contabilidade, loja, BI) lerem e lançarem dados desta empresa, e avisos automáticos quando algo muda.">
        API e integrações
      </Titulo>

      <Cartao titulo="Chaves de API" descricao="Só o master cria. Cada sistema ganha a própria chave, só com o que precisa, e ela vale 7 dias. Se você deixar de ser master, as chaves que criou são revogadas.">
        <Tabela cabecalho={["Nome", "Chave", "Escopos", "Criada", "Vence", "Último uso", "Situação", ""]} total={listaChaves.length}
          vazio="Nenhuma chave criada ainda." principal="Nome" ocultarNoCelular={["Chave", "Criada"]}>
          {listaChaves.map((c) => (
            <tr key={c.id}>
              <td className="font-medium">{c.nome}</td>
              <td className="font-mono text-[13px] text-texto-suave">{c.prefixo}</td>
              <td className="text-[13px]">{c.escopos.join(", ")}</td>
              <td>{formatarData(c.criada_em.slice(0, 10))}</td>
              <td>{c.expira_em ? formatarData(c.expira_em.slice(0, 10)) : ""}</td>
              <td>{ultimoUso.get(c.id) ? formatarData(ultimoUso.get(c.id)!.slice(0, 10)) : "Nunca"}</td>
              <td>{situacaoChave(c)}</td>
              <td>
                {!c.revogada_em && !(c.expira_em && new Date(c.expira_em) < new Date()) && (
                  <FormAcao acao={revogarChave} botao="Revogar" variante="secundario">
                    <input type="hidden" name="id" value={c.id} />
                  </FormAcao>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
        <div className="mt-6 border-t border-linha pt-5">
          <h3 className="mb-3 font-medium">Nova chave</h3>
          <FormSegredo acao={criarChave} botao="Criar chave">
            <Campo rotulo="Nome" id="nome" name="nome" required maxLength={80} placeholder="Ex.: ERP da contabilidade" className="max-w-md"
              ajuda="Toda chave vale 7 dias. Depois, crie uma nova e troque no outro sistema." />
            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="mb-1 font-medium">Escopos</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {GRUPOS_ESCOPO.map((g) => (
                  <div key={g}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-texto-suave">{g}</p>
                    {ESCOPOS.filter((e) => e.grupo === g).map((e) => (
                      <label key={e.chave} className="flex items-center gap-2 py-0.5">
                        <input type="checkbox" name="escopos" value={e.chave} />
                        {e.nome}
                        {!noPlano(e.chave.split(".")[0]) && <Etiqueta tom="alerta">fora do plano</Etiqueta>}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              {foraDoPlano.length > 0 && (
                <p className="text-[13px] text-texto-suave">Escopos fora do plano podem ser marcados, mas só funcionam depois de trocar de plano.</p>
              )}
            </fieldset>
          </FormSegredo>
        </div>
      </Cartao>

      <Cartao titulo="Webhooks" descricao="O Balbina avisa o seu sistema (POST em https) quando algo muda. Entrega em até 5 minutos, com novas tentativas por algumas horas.">
        <Tabela cabecalho={["Endereço", "Eventos", "Situação", ""]} total={listaWebhooks.length} vazio="Nenhum webhook cadastrado." principal="Endereço">
          {listaWebhooks.map((w) => (
            <tr key={w.id}>
              <td className="break-all font-mono text-[13px]">{w.url}</td>
              <td className="text-[13px]">{w.eventos.join(", ")}</td>
              <td>{w.ativo ? <Etiqueta tom="positivo">Ligado</Etiqueta> : <Etiqueta>Desligado</Etiqueta>}</td>
              <td>
                <div className="flex flex-wrap gap-2">
                  <FormAcao acao={alterarWebhook} botao={w.ativo ? "Desligar" : "Ligar"} variante="secundario">
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="acao" value={w.ativo ? "desligar" : "ligar"} />
                  </FormAcao>
                  <FormAcao acao={alterarWebhook} botao="Excluir" variante="secundario">
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="acao" value="excluir" />
                  </FormAcao>
                </div>
              </td>
            </tr>
          ))}
        </Tabela>
        <div className="mt-6 border-t border-linha pt-5">
          <h3 className="mb-3 font-medium">Novo webhook</h3>
          <FormSegredo acao={criarWebhook} botao="Cadastrar webhook">
            <Campo rotulo="Endereço (https)" id="url" name="url" type="url" required maxLength={500} placeholder="https://seu-sistema.com.br/webhooks/balbina" />
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="mb-1 font-medium">Eventos</legend>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {EVENTOS.map((e) => (
                  <label key={e.chave} className="flex items-center gap-2 py-0.5">
                    <input type="checkbox" name="eventos" value={e.chave} />
                    <span><code className="font-mono text-[13px]">{e.chave}</code> <span className="text-texto-suave">{e.nome}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          </FormSegredo>
        </div>
        {listaEntregas.length > 0 && (
          <div className="mt-6 border-t border-linha pt-5">
            <h3 className="mb-3 font-medium">Últimas entregas</h3>
            <Tabela cabecalho={["Quando", "Evento", "Destino", "Tentativas", "Resultado"]} total={listaEntregas.length} principal="Evento" ocultarNoCelular={["Destino"]}>
              {listaEntregas.map((e) => (
                <tr key={e.id}>
                  <td>{formatarData(e.criado_em.slice(0, 10))}</td>
                  <td className="font-mono text-[13px]">{e.evento}</td>
                  <td className="break-all text-[13px] text-texto-suave">{urlWebhook.get(e.webhook_id)}</td>
                  <td>{e.tentativas}</td>
                  <td>
                    {e.entregue_em ? <Etiqueta tom="positivo">Entregue</Etiqueta>
                      : e.tentativas >= 8 ? <Etiqueta tom="perigo">Desistiu: {e.erro}</Etiqueta>
                      : e.tentativas > 0 ? <Etiqueta tom="alerta">Tentando: {e.erro}</Etiqueta>
                      : <Etiqueta>Na fila</Etiqueta>}
                  </td>
                </tr>
              ))}
            </Tabela>
          </div>
        )}
      </Cartao>

      <Cartao titulo="Como usar" descricao="Referência rápida para quem vai programar a integração.">
        <div className="flex flex-col gap-4 text-sm">
          <p>
            Endereço base <code className="font-mono">{SITE}/api/v1</code>. Envie a chave em <code className="font-mono">Authorization: Bearer balbina_…</code>.
            Valores em centavos (inteiros), datas <code className="font-mono">AAAA-MM-DD</code>, listas paginadas com <code className="font-mono">?pagina=1&amp;por_pagina=100</code> (até 500).
            Erros voltam como <code className="font-mono">{`{"erro": {"codigo", "mensagem"}}`}</code>. Limite de 300 chamadas por minuto por chave.
          </p>
          <pre className="overflow-x-auto rounded-xl border border-borda bg-elevado/60 p-3 font-mono text-[12px] leading-relaxed">{`curl ${SITE}/api/v1/lancamentos?tipo=pagar&status=aberto \\
  -H "Authorization: Bearer balbina_..."

curl -X POST ${SITE}/api/v1/lancamentos \\
  -H "Authorization: Bearer balbina_..." -H "Content-Type: application/json" \\
  -d '{"tipo":"pagar","descricao":"Ração engorda","vencimento":"2026-11-10",
       "valor_cents":1250000,"categoria_id":"<id de GET /categorias>","contato_id":"<id>"}'`}</pre>
          <Tabela cabecalho={["Método", "Caminho", "Escopo", "O que faz"]} total={ENDPOINTS.length} principal="Caminho">
            {ENDPOINTS.map((e) => (
              <tr key={`${e.metodo} ${e.caminho}`}>
                <td className="font-mono text-[13px]">{e.metodo}</td>
                <td className="font-mono text-[13px]">{e.caminho}</td>
                <td className="text-[13px] text-texto-suave">{e.escopo}</td>
                <td>{e.descricao}{e.filtros && <span className="block text-[13px] text-texto-suave">Filtros: {e.filtros}</span>}</td>
              </tr>
            ))}
          </Tabela>
          <p>
            Cada aviso de webhook é um POST com <code className="font-mono">{`{"id", "evento", "criado_em", "empresa_id", "dados"}`}</code> e o cabeçalho{" "}
            <code className="font-mono">X-Balbina-Assinatura: t=&lt;segundos&gt;,v1=&lt;hmac&gt;</code>, onde hmac é o HMAC-SHA256 em hexadecimal de{" "}
            <code className="font-mono">{"`${t}.${corpo}`"}</code> com o segredo do webhook. Responda 2xx em até 8 segundos; o mesmo{" "}
            <code className="font-mono">id</code> pode chegar mais de uma vez.
          </p>
        </div>
      </Cartao>
    </div>
  );
}
