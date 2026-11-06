import { Settings2 } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { BotaoLancamento } from "@/components/lancamento";
import { Campo, Cartao, CLASSE_BOTAO_TEXTO, CLASSE_CONTROLE, Selecao, Tabela, Titulo } from "@/components/ui";
import { MEIOS_COBRANCA } from "@/lib/asaas-mapa";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { cancelarCobranca, emitirCobranca, salvarPerfil } from "./actions";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { balbinaAsaasConfigurado } from "@/lib/assinatura";
import { getUsuario } from "@/lib/auth";
import { STATUS_COBRANCA } from "@/lib/cobranca";
import { CartaoContaAsaas, type ContaAsaas } from "./conta";

export default async function PaginaCobrancas() {
  await exigirAcesso("cobrancas");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: perfil }, { data: contas }, { data: titulos }, { data: cobrancas }] = await Promise.all([
    supabase.from("perfis_cobranca").select("id, conta_repasse_id, juros_mes_percentual, multa_percentual, desconto_ate_vencimento_percentual").eq("empresa_id", atual.id).eq("provedor", "asaas").maybeSingle(),
    supabase.from("contas_financeiras").select("id, nome").eq("empresa_id", atual.id).eq("arquivada", false).neq("tipo", "cartao_credito").order("nome"),
    supabase.from("titulos").select("id, descricao, contato_nome, vencimento, saldo_cents, situacao").eq("empresa_id", atual.id).eq("tipo", "receber")
      .in("status", ["aberto", "parcial"]).gt("saldo_cents", 0).order("vencimento").limit(60),
    supabase.from("cobrancas").select("id, agendamento_id, meio, vencimento, valor_cents, status, url_pdf, linha_digitavel, pix_copia_cola, erro, agendamentos(descricao, contatos(nome))")
      .eq("empresa_id", atual.id).order("created_at", { ascending: false }).limit(60),
  ]);
  const ativas = new Set((cobrancas ?? []).filter((c) => ["processando", "emitida", "visualizada"].includes(c.status)).map((c) => c.agendamento_id));
  const semCobranca = (titulos ?? []).filter((t) => !ativas.has(t.id));
  const [{ data: conta }, { data: empresa }, { master }, usuario] = await Promise.all([
    perfil ? supabase.from("contas_asaas").select("modo, ambiente, situacao, email").eq("perfil_cobranca_id", perfil.id).maybeSingle<ContaAsaas>() : { data: null },
    supabase.from("empresas").select("cnpj").eq("id", atual.id).single(),
    getPermissoes(),
    getUsuario(),
  ]);
  const configurado = Boolean(conta);

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo
        descricao="Boleto e Pix pelo Asaas. Quando o cliente paga, o Asaas avisa e o título é baixado sozinho na conta do Asaas."
        acoes={perfil && (
          <BotaoLancamento rotulo="Configuração" titulo="Configuração da cobrança" acao={salvarPerfil} variante="secundario" tamanho="sm" icone={<Settings2 size={16} strokeWidth={1.75} aria-hidden />}>
          {perfil && <input type="hidden" name="perfil_id" value={perfil.id} />}
          <div className="grid gap-3 grid-cols-2">
            <Selecao rotulo="Conta onde o dinheiro cai" id="conta" name="conta_repasse_id" required defaultValue={perfil?.conta_repasse_id ?? "nova"}>
              <option value="nova">Criar conta “Asaas”</option>
              {(contas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
            <Campo rotulo="Juros ao mês (%)" id="juros" name="juros" inputMode="decimal" defaultValue={String(perfil?.juros_mes_percentual ?? 1).replace(".", ",")} />
            <Campo rotulo="Multa (%)" id="multa" name="multa" inputMode="decimal" defaultValue={String(perfil?.multa_percentual ?? 2).replace(".", ",")} />
            <Campo rotulo="Desconto até o vencimento (%)" id="desconto" name="desconto" inputMode="decimal" defaultValue={String(perfil?.desconto_ate_vencimento_percentual ?? 0).replace(".", ",")} />
          </div>
        </BotaoLancamento>
        )}
      >
        Cobranças
      </Titulo>

      {!perfil && (
        <Cartao titulo="Configuração">
          <FormAcao acao={salvarPerfil} botao="Ativar cobrança pelo Asaas" limparAoSalvar={false}>
            <div className="grid gap-3 sm:grid-cols-4">
              <Selecao rotulo="Conta onde o dinheiro cai" id="conta" name="conta_repasse_id" required defaultValue="nova">
                <option value="nova">Criar conta “Asaas”</option>
                {(contas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
              <Campo rotulo="Juros ao mês (%)" id="juros" name="juros" inputMode="decimal" defaultValue="1" />
              <Campo rotulo="Multa (%)" id="multa" name="multa" inputMode="decimal" defaultValue="2" />
              <Campo rotulo="Desconto até o vencimento (%)" id="desconto" name="desconto" inputMode="decimal" defaultValue="0" />
            </div>
          </FormAcao>
        </Cartao>
      )}

      {perfil && (
        <CartaoContaAsaas
          perfilId={perfil.id} conta={conta} master={master} pessoaFisica={empresa?.cnpj.length === 11}
          emailPadrao={usuario.email} podeAbrir={balbinaAsaasConfigurado()}
        />
      )}

      {perfil && configurado && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Contas a receber sem cobrança</h2>
          <Tabela cabecalho={["Vencimento", "Descrição", "Cliente", "Saldo", ""]} principal="Descrição" total={semCobranca.length} vazio="Tudo que está em aberto já tem cobrança.">
            {semCobranca.map((t) => (
              <tr key={t.id} className="tabular-nums">
                <td className={t.situacao === "vencido" ? "text-perigo" : ""}>{formatarData(t.vencimento)}</td>
                <td>{t.descricao}</td>
                <td>{t.contato_nome ?? "–"}</td>
                <td>{formatarMoeda(t.saldo_cents)}</td>
                <td>
                  <FormAcao acao={emitirCobranca} botao="Cobrar" variante="secundario" className="flex-row! items-start">
                    <input type="hidden" name="agendamento_id" value={t.id} />
                    <input type="hidden" name="perfil_id" value={perfil.id} />
                    <select name="meio" aria-label="Meio" defaultValue="boleto_pix" className={`h-10 ${CLASSE_CONTROLE}`}>
                      {Object.entries(MEIOS_COBRANCA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                    </select>
                  </FormAcao>
                </td>
              </tr>
            ))}
          </Tabela>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Cobranças emitidas</h2>
        <Tabela principal="Cliente e título" cabecalho={["Vencimento", "Cliente e título", "Valor", "Situação", "Boleto / Pix", ""]} total={cobrancas?.length ?? 0} vazio="Nenhuma cobrança ainda.">
          {(cobrancas ?? []).map((c) => {
            const a = c.agendamentos as unknown as { descricao: string; contatos: { nome: string } | null };
            return (
              <tr key={c.id} className="align-top tabular-nums">
                <td>{formatarData(c.vencimento)}</td>
                <td>{a.contatos?.nome ?? "–"}<span className="block text-xs text-texto-suave">{a.descricao} · {MEIOS_COBRANCA[c.meio as keyof typeof MEIOS_COBRANCA]}</span></td>
                <td>{formatarMoeda(c.valor_cents)}</td>
                <td className={c.status === "erro" || c.status === "expirada" ? "text-perigo" : ""}>
                  {STATUS_COBRANCA[c.status] ?? c.status}{c.erro && <span className="block max-w-56 text-xs">{c.erro}</span>}
                </td>
                <td className="max-w-72">
                  {c.url_pdf && <a href={c.url_pdf} target="_blank" rel="noreferrer" className={CLASSE_BOTAO_TEXTO}>Abrir cobrança</a>}
                  {c.linha_digitavel && <input readOnly aria-label="Linha digitável" value={c.linha_digitavel} className="mt-1 block w-full rounded-md border border-borda bg-elevado px-1.5 text-xs" />}
                  {c.pix_copia_cola && <input readOnly aria-label="Pix copia e cola" value={c.pix_copia_cola} className="mt-1 block w-full rounded-md border border-borda bg-elevado px-1.5 text-xs" />}
                </td>
                <td>
                  {["processando", "emitida", "visualizada", "expirada"].includes(c.status) && (
                    <FormAcao acao={cancelarCobranca} botao="Cancelar" variante="secundario">
                      <input type="hidden" name="cobranca_id" value={c.id} />
                    </FormAcao>
                  )}
                </td>
              </tr>
            );
          })}
        </Tabela>
      </section>
    </div>
  );
}
