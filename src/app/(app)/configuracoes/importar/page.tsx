import { FormAcao } from "@/components/form-acao";
import { Campo, Cartao, classeBotao, Etiqueta, Selecao, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { MODELOS, type TipoModelo } from "@/lib/importacao-modelo";
import type { AuditoriaConta } from "@/lib/importacao-nibo";
import { niboLiberado } from "@/lib/integracoes";
import { exigirMaster, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { importarNibo, importarPlanilha } from "./actions";
import { ImportarModelo } from "./importar-modelo";

// A leitura do NIBO pagina todos os lançamentos; dá tempo para empresas com anos de histórico.
export const maxDuration = 300;

export default async function PaginaImportar() {
  await exigirMaster();
  const { atual } = await getEmpresaAtual();
  const nibo = await niboLiberado(atual.id);
  const { noPlano } = await getPermissoes();
  const modelos = MODELOS.filter((m) => !m.financeiro || noPlano("financeiro"));
  const supabase = await createClient();
  // o que a piscicultura já tem, para mostrar o que falta para começar
  const contar = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const [viveiros, lotes, estoque, produtos] = await Promise.all([
    contar(supabase.from("viveiros").select("id", { count: "exact", head: true }).eq("empresa_id", atual.id)),
    contar(supabase.from("lotes").select("id", { count: "exact", head: true }).eq("empresa_id", atual.id).neq("fase", "encerrado")),
    contar(supabase.from("saldos_produtos").select("produto_id", { count: "exact", head: true }).eq("empresa_id", atual.id).gt("saldo", 0)),
    contar(supabase.from("produtos").select("id", { count: "exact", head: true }).eq("empresa_id", atual.id).neq("tipo", "peixe")),
  ]);
  const ja: Partial<Record<TipoModelo, number>> = { viveiros, lotes, estoque, produtos };
  const { data: auditoria } = nibo
    ? await supabase.from("auditorias_importacao").select("desde, contas, avisos, created_at")
        .eq("empresa_id", atual.id).eq("origem", "nibo").order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Titulo descricao="Traga cadastros e lançamentos de outro sistema. Pode rodar quantas vezes quiser: o que já entrou é atualizado, sem duplicar.">
        Importar dados
      </Titulo>

      <Cartao titulo="Planilha modelo do Balbina">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-texto-suave">
            Para quem controla tudo em planilha: baixe o modelo, preencha com os seus dados e envie aqui. O Balbina reconhece as abas e
            as colunas, mostra antes o que vai entrar e o que tem erro (linha por linha) e só lança depois que você confirmar.
            Pode enviar de novo depois de corrigir: o que já entrou não duplica. Tudo o que entrar fica no Histórico de alterações.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/configuracoes/importar/modelo" className={classeBotao("secundario")} download>Baixar modelo (Excel)</a>
            <span className="text-sm text-texto-suave">ou um CSV por vez:</span>
            {modelos.map((m) => (
              <a key={m.tipo} href={`/configuracoes/importar/modelo?formato=csv&tipo=${m.tipo}`} download
                className={classeBotao("fantasma", "sm")}>{m.aba}</a>
            ))}
          </div>
          {([
            ["comecar", "Para começar", "Viveiros, lotes e estoque inicial são o que a piscicultura precisa para usar o Balbina no dia a dia."],
            ["cadastro", "Cadastros", "Produtos, clientes, fornecedores, contas e categorias. O que faltar também pode ser cadastrado depois, nas telas."],
            ["opcional", "Opcional: histórico", "Lançamentos e transferências antigos. Só se quiser o passado no Balbina; sem eles, o sistema começa do saldo de hoje."],
          ] as const).map(([etapa, titulo, texto]) => modelos.some((m) => m.etapa === etapa) && (
            <div key={etapa} className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold">{titulo}</h3>
              <p className="text-xs text-texto-suave">{texto}</p>
              <ul className="flex flex-col gap-1 text-sm text-texto-suave">
                {modelos.filter((m) => m.etapa === etapa).map((m) => (
                  <li key={m.tipo} className="flex flex-wrap items-baseline gap-x-2">
                    {etapa === "comecar" && (ja[m.tipo] ? <Etiqueta tom="positivo">já tem {ja[m.tipo]}</Etiqueta> : <Etiqueta tom="alerta">falta</Etiqueta>)}
                    {etapa === "opcional" && <Etiqueta>opcional</Etiqueta>}
                    <span><strong className="font-medium text-texto">{m.aba}:</strong> {m.descricao}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {modelos.length < MODELOS.length && (
            <p className="text-sm text-texto-suave">Lançamentos, contas, categorias e transferências precisam do financeiro, que não faz parte do plano da empresa.</p>
          )}
          <ImportarModelo />
        </div>
      </Cartao>

      {nibo && <Cartao titulo="NIBO">
        <FormAcao acao={importarNibo} botao="Importar do NIBO" limparAoSalvar>
          <p className="text-sm text-texto-suave">
            Traz categorias, centros de custo, contas e caixas, clientes, fornecedores, contas a pagar e a receber (com o que já foi pago),
            transferências e a conciliação: o que está conciliado no NIBO entra conciliado, e o que o banco mandou e falta conciliar
            aparece em Conciliação. O saldo de cada conta é acertado pelo extrato do NIBO e conferido dia a dia na auditoria. No NIBO, gere o token em <strong>Sua empresa → Mais opções → Configurações → API</strong>.
            O token é usado só nesta importação e não fica salvo.
          </p>
          <Campo rotulo="Token da API do NIBO" id="token" name="token" type="password" autoComplete="off" required />
          <Campo rotulo="Trazer lançamentos a partir de" id="desde" name="desde" type="date" defaultValue="2025-12-31" required
            ajuda="Vencimentos, pagamentos e recebimentos desta data em diante. Rodar de novo completa o que faltou e traz as baixas novas, sem duplicar." />
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="regras" defaultChecked />
            Criar regras de conciliação a partir do histórico (fornecedor ou cliente que sempre cai na mesma categoria)
          </label>
          <p className="text-xs text-texto-suave">Pode levar alguns minutos se houver muitos lançamentos. Não feche a página.</p>
        </FormAcao>
      </Cartao>}

      {auditoria && <Auditoria desde={auditoria.desde} quando={auditoria.created_at} contas={auditoria.contas as AuditoriaConta[]}
        avisos={auditoria.avisos as string[]} />}

      <Cartao titulo="Listagem de clientes ou fornecedores (LC Sistemas ou NIBO)">
        <FormAcao acao={importarPlanilha} botao="Importar planilha">
          <p className="text-sm text-texto-suave">
            Arquivo CSV com os títulos das colunas na primeira linha: nome, CPF/CNPJ, inscrição estadual, telefone, e-mail, endereço,
            número, bairro, CEP, cidade e UF. Serve para a listagem de clientes do LC Sistemas e para exportações do NIBO.
            Quem já existe (mesmo CPF/CNPJ ou mesmo nome) é completado, não duplicado.
          </p>
          <input
            type="file" name="arquivo" accept=".csv,text/csv" required aria-label="Arquivo CSV"
            className="text-sm file:mr-3 file:rounded-lg file:border file:border-borda file:bg-elevado file:px-3 file:py-1.5 file:text-sm"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Selecao rotulo="Os registros são" id="tipo" name="tipo" defaultValue="cliente">
              <option value="cliente">Clientes</option>
              <option value="fornecedor">Fornecedores</option>
            </Selecao>
            <Selecao rotulo="Vindos de" id="origem" name="origem" defaultValue="lc">
              <option value="lc">LC Sistemas</option>
              <option value="nibo">NIBO</option>
              <option value="planilha">Outra planilha</option>
            </Selecao>
          </div>
        </FormAcao>
      </Cartao>
    </div>
  );
}

const moeda = (c: number | null) => (c == null ? "–" : formatarMoeda(c));

// Saldo de hoje NIBO x Balbina em cada conta e os dias em que o total do dia não bate
function Auditoria({ desde, quando, contas, avisos }: { desde: string | null; quando: string; contas: AuditoriaConta[]; avisos: string[] }) {
  const diferentes = contas.filter((c) => c.diferenca_cents !== 0);
  return (
    <Cartao titulo="Auditoria de saldos (NIBO x Balbina)">
      <p className="mb-3 text-sm text-texto-suave">
        Última importação em {formatarData(quando.slice(0, 10))}, com lançamentos desde {desde ? formatarData(desde) : "o início"}.{" "}
        {diferentes.length === 0 ? "Todas as contas batem com o NIBO." : `${diferentes.length} de ${contas.length} contas com diferença.`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm tabular-nums">
          <thead className="text-texto-suave">
            <tr><th className="py-1.5 text-left font-medium">Conta</th><th className="px-2 font-medium">NIBO</th>
              <th className="px-2 font-medium">Balbina</th><th className="px-2 font-medium">Diferença</th></tr>
          </thead>
          <tbody>
            {contas.map((c) => (
              <tr key={c.conta} className="border-t border-borda/50">
                <td className="py-1.5 text-left">{c.conta}</td>
                <td className="px-2">{moeda(c.nibo_cents)}</td>
                <td className="px-2">{moeda(c.balbina_cents)}</td>
                <td className={`px-2 ${c.diferenca_cents ? "font-medium text-perigo" : "text-texto-suave"}`}>
                  {c.diferenca_cents ? moeda(c.diferenca_cents) : "ok"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-sm">
        {contas.filter((c) => c.nibo_periodo_cents != null).map((c) => (
          <li key={c.conta}>
            <strong className="font-medium">{c.conta}:</strong> abertura {moeda(c.abertura_cents ?? null)}; no NIBO, {moeda(c.nibo_periodo_cents ?? 0)} em{" "}
            {c.lancamentos_nibo} lançamentos (pelo {c.fonte}); no Balbina, {moeda(c.balbina_importado_cents ?? 0)} vindos do NIBO
            {c.balbina_proprio_qtd ? ` e ${moeda(c.balbina_proprio_cents ?? 0)} em ${c.balbina_proprio_qtd} lançamentos feitos só no Balbina` : ""}
            {c.nibo_extrato_cents != null ? `; pelo extrato do NIBO, ${moeda(c.nibo_extrato_cents)}` : ""}.
          </li>
        ))}
      </ul>
      {contas.filter((c) => c.total_dias_diferentes > 0).map((c) => (
        <details key={c.conta} className="mt-3 text-sm">
          <summary className="cursor-pointer">{c.conta}: {c.total_dias_diferentes} dias com movimento diferente</summary>
          <table className="mt-2 w-full text-right tabular-nums">
            <thead className="text-texto-suave">
              <tr><th className="text-left font-medium">Dia</th><th className="px-2 font-medium">NIBO</th><th className="px-2 font-medium">Balbina</th>
                <th className="px-2 font-medium">Diferença</th></tr>
            </thead>
            <tbody>
              {c.dias.map((d) => (
                <tr key={d.data} className="border-t border-borda/50">
                  <td className="py-1 text-left">{formatarData(d.data)}</td><td className="px-2">{moeda(d.nibo_cents)}</td>
                  <td className="px-2">{moeda(d.balbina_cents)}</td><td className="px-2 text-perigo">{moeda(d.balbina_cents - d.nibo_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.total_dias_diferentes > c.dias.length && <p className="mt-1 text-xs text-texto-suave">Mostrando os {c.dias.length} primeiros dias.</p>}
        </details>
      ))}
      {avisos.length > 0 && <p className="mt-3 text-xs text-texto-suave">Avisos: {avisos.join(" · ")}</p>}
      {contas.some((c) => c.diag) && (
        <details className="mt-3 text-xs text-texto-suave">
          <summary className="cursor-pointer">Detalhes técnicos do que o NIBO devolveu</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {contas.filter((c) => c.diag).map((c) => (
              <li key={c.conta} className="break-words">
                {c.conta}: saldo de hoje {c.diag!.saldo_informado ? "informado" : "não informado"}; extrato com {c.diag!.extrato_linhas} linhas
                {c.diag!.extrato_erro ? ` (erro: ${c.diag!.extrato_erro})` : ""}
                {c.diag!.extrato_chaves?.length ? `; resposta: ${c.diag!.extrato_chaves.join(", ")}` : ""}
                {c.diag!.extrato_campos?.length ? `; campos: ${c.diag!.extrato_campos.join(", ")}` : ""}
                ; a conciliar no banco: {c.diag!.pendentes_erro ? `erro (${c.diag!.pendentes_erro})` : (c.diag!.pendentes ?? 0)}
                {c.diag!.listas_linhas != null ? `; pagamentos e recebimentos: ${c.diag!.listas_linhas}` : ""}
                {c.diag!.extrato_nas_listas != null ? `; do extrato: ${c.diag!.extrato_nas_listas} achadas nos pagamentos/recebimentos, ` +
                  `${c.diag!.extrato_transferencias ?? 0} transferências, ${c.diag!.extrato_negativas ?? 0} negativas, ` +
                  `${c.diag!.extrato_conciliadas ?? 0} conciliadas, tipos ${(c.diag!.extrato_tipos ?? []).join("/") || "-"}` : ""}
                {c.diag!.extrato_ultimo_saldo != null ? `; saldo da última linha do extrato ${moeda(c.diag!.extrato_ultimo_saldo)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Cartao>
  );
}
