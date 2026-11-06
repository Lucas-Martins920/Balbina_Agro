import { MessageCircle } from "lucide-react";
import { Cartao, CLASSE_BOTAO_TEXTO, Etiqueta, Titulo, classeBotao } from "@/components/ui";
import { getEmpresaAtual, nomeEmpresa } from "@/lib/empresa";
import { formatarData, formatarMoeda, hojeISO, somarDias } from "@/lib/formato";
import { exigirAcesso } from "@/lib/permissoes";
import { DIAS_ANTES, FAIXAS, faixaDaRegua, linkWhatsApp, textoLembreteCobranca, type Faixa } from "@/lib/regua-cobranca";
import { createClient } from "@/lib/supabase/server";

const ATRASO_MAXIMO = 90;

// D4: régua de cobrança. Quem cobrar hoje, com a mensagem pronta para o WhatsApp e a segunda via do boleto/Pix.
// O Asaas também manda os e-mails e SMS de lembrete das cobranças que ele emitiu.
export default async function PaginaReguaCobranca() {
  await exigirAcesso("contas-a-receber");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const hoje = hojeISO(atual.fuso);
  const { data: titulos } = await supabase.from("titulos")
    .select("id, descricao, vencimento, saldo_cents, contato_id, contato_nome, parcela_numero, parcela_total")
    .eq("empresa_id", atual.id).eq("tipo", "receber").in("status", ["aberto", "parcial"])
    .gte("vencimento", somarDias(hoje, -ATRASO_MAXIMO)).lte("vencimento", somarDias(hoje, DIAS_ANTES))
    .order("vencimento").limit(500);
  const lista = (titulos ?? []).filter((t) => Number(t.saldo_cents) > 0);
  const contatos = [...new Set(lista.map((t) => t.contato_id).filter(Boolean))] as string[];
  const [{ data: fones }, { data: cobrancas }] = await Promise.all([
    contatos.length ? supabase.from("contatos").select("id, telefone").in("id", contatos) : { data: [] },
    lista.length ? supabase.from("cobrancas").select("agendamento_id, url_pdf, status").in("agendamento_id", lista.map((t) => t.id))
      .in("status", ["emitida", "visualizada", "expirada"]) : { data: [] },
  ]);
  const telefone = new Map((fones ?? []).map((c) => [c.id, c.telefone]));
  const segundaVia = new Map((cobrancas ?? []).filter((c) => c.url_pdf).map((c) => [c.agendamento_id, c.url_pdf as string]));
  const empresa = nomeEmpresa(atual);
  const porFaixa = new Map<Faixa, typeof lista>();
  for (const t of lista) {
    const f = faixaDaRegua(t.vencimento, hoje);
    if (f) porFaixa.set(f, [...(porFaixa.get(f) ?? []), t]);
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Titulo descricao="Quem cobrar hoje: antes do vencimento, no dia e depois. O lembrete abre pronto no WhatsApp, com a segunda via quando o boleto/Pix saiu pelo Asaas. Para travar venda a prazo de quem está devendo, ligue em Configurações › Automações.">
        Régua de cobrança
      </Titulo>
      {lista.length === 0 && <p className="text-sm text-texto-suave">Nenhuma conta a receber perto do vencimento ou atrasada.</p>}
      {(Object.keys(FAIXAS) as Faixa[]).filter((f) => porFaixa.has(f)).map((f) => (
        <Cartao key={f} titulo={FAIXAS[f]} cor={f.startsWith("atraso") ? "laranja" : "azul"} icone={MessageCircle}>
          <ul className="-my-2 divide-y divide-linha text-sm">
            {porFaixa.get(f)!.map((t) => {
              const via = segundaVia.get(t.id) ?? null;
              const texto = textoLembreteCobranca({ cliente: t.contato_nome ?? "cliente", empresa, valorCents: Number(t.saldo_cents), vencimento: t.vencimento, faixa: f, segundaVia: via });
              const link = linkWhatsApp(t.contato_id ? telefone.get(t.contato_id) : null, texto);
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="w-20 tabular-nums text-texto-suave">{formatarData(t.vencimento)}</span>
                  <span className="flex min-w-48 flex-1 flex-col">
                    <span className="font-medium">{t.contato_nome ?? "Sem cliente"}</span>
                    <span className="text-xs text-texto-suave">{t.descricao}{t.parcela_total ? ` · ${t.parcela_numero}/${t.parcela_total}` : ""}</span>
                  </span>
                  <span className="font-medium tabular-nums">{formatarMoeda(Number(t.saldo_cents))}</span>
                  {via && <a href={via} target="_blank" rel="noreferrer" className={CLASSE_BOTAO_TEXTO}>2ª via</a>}
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer" className={classeBotao("secundario", "sm")}>Lembrar no WhatsApp</a>
                  ) : (
                    <Etiqueta>sem celular no cadastro</Etiqueta>
                  )}
                </li>
              );
            })}
          </ul>
        </Cartao>
      ))}
    </div>
  );
}
