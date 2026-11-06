import { redirect } from "next/navigation";
import { FormAcao } from "@/components/form-acao";
import { Campo, Cartao, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { centavosParaCampo, hojeISO } from "@/lib/formato";
import { iaConfigurada } from "@/lib/ia";
import { pushConfigurado } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { WhatsAppPessoal } from "@/components/whatsapp-pessoal";
import { whatsappConfigurado } from "@/lib/whatsapp";
import { salvarAbastecimento, salvarAvisosRotina, salvarBuscaNfe, salvarCobrancaWhatsApp, salvarLembreteApontamento, salvarChatIa, salvarLeituraIa, salvarVendas, novoEnderecoEntrada, salvarPagamentos } from "./actions";

// Tudo que o Balbina faz sozinho para a piscicultura, num lugar só (docs/automacoes.md).
export default async function PaginaAutomacoes() {
  await exigirAcesso("configuracoes");
  const { pode, master } = await getPermissoes();
  if (!pode("configuracoes.editar")) redirect("/configuracoes");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const inicioMes = `${hojeISO(atual.fuso).slice(0, 7)}-01`;
  const [{ data: cfg }, { count: celulares }, { count: leituras }, { count: perguntas }] = await Promise.all([
    supabase.from("automacoes_empresa").select("*").eq("empresa_id", atual.id).maybeSingle(),
    supabase.from("push_inscricoes").select("id", { count: "exact", head: true }).eq("empresa_id", atual.id),
    supabase.from("ia_uso").select("id", { count: "exact", head: true }).eq("empresa_id", atual.id).neq("tipo", "chat").gte("created_at", inicioMes),
    supabase.from("ia_uso").select("id", { count: "exact", head: true }).eq("empresa_id", atual.id).eq("tipo", "chat").gte("created_at", inicioMes),
  ]);
  const caixa = process.env.ENTRADA_EMAIL_ENDERECO ?? "";
  const endereco = caixa.includes("@") && cfg?.entrada_token ? caixa.replace("@", `+${cfg.entrada_token}@`) : null;
  const hora = (t: string | null | undefined, padrao: string) => (t ?? padrao).slice(0, 5);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Titulo descricao="O que o Balbina faz sozinho para a piscicultura. Tudo que vem de fora entra como sugestão e alguém confirma.">Automações</Titulo>

      <Cartao titulo="Apontamento pré-preenchido" descricao="Sempre ligado.">
        <p className="text-sm text-texto-suave">
          O apontamento (web e celular) já abre com a ração normal de cada viveiro no turno, pela mediana dos últimos
          lançamentos do mesmo lote, e mostra ao lado a ração da tabela de arraçoamento pelo peso da última biometria. Quem lança
          confere, corrige e salva; o valor que foge mais de 15% do normal fica marcado. Mortes e qualidade da água nunca vêm preenchidas.
        </p>
      </Cartao>

      <Cartao titulo="Lembrete de apontamento" descricao="Aviso no celular de quem ligou os avisos no app de campo quando um viveiro ainda não lançou o turno.">
        <FormAcao acao={salvarLembreteApontamento} botao="Salvar" limparAoSalvar={false}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="lembrete_apontamento" defaultChecked={cfg?.lembrete_apontamento ?? false} className="size-4 accent-marca" />
            Avisar quando faltar apontamento
          </label>
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <Campo rotulo="Manhã, às" id="lembrete_manha" name="lembrete_manha" type="time" defaultValue={hora(cfg?.lembrete_manha, "10:00")} required />
            <Campo rotulo="Tarde, às" id="lembrete_tarde" name="lembrete_tarde" type="time" defaultValue={hora(cfg?.lembrete_tarde, "17:00")} required />
          </div>
          <p className="text-xs text-texto-suave">
            {pushConfigurado()
              ? `${celulares ?? 0} celular(es) com avisos ligados. Cada pessoa liga no próprio celular, no fim da tela do app de campo.`
              : "Os avisos no celular ainda não estão ligados no servidor (faltam as chaves VAPID). O lembrete fica guardado e começa a sair quando forem cadastradas."}
            {" "}O horário é o da piscicultura ({atual.fuso.replace("America/", "").replace("_", " ")}).
          </p>
        </FormAcao>
      </Cartao>

      <Cartao titulo="Notas de compra pela SEFAZ" descricao="Plano Fiscal ou Gestão. Usa o cadastro do emitente na Focus NFe (mesmo certificado A1).">
        <FormAcao acao={salvarBuscaNfe} botao="Salvar" limparAoSalvar={false}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="mde_ligado" defaultChecked={cfg?.mde_ligado ?? false} className="size-4 accent-marca" />
            Buscar a cada hora as NF-e que os fornecedores emitem para o CNPJ da piscicultura
          </label>
          <p className="text-xs text-texto-suave">
            As notas aparecem em Notas fiscais › Notas de compra para lançar como conta a pagar num clique, com a categoria de costume do fornecedor.
            Quem lança contas a pagar recebe aviso no celular. A Focus cobra por nota recebida.
          </p>
        </FormAcao>
      </Cartao>

      <Cartao titulo="Boletos e notas por foto ou e-mail" descricao="Leitura por IA: o documento vira conta a pagar proposta em Contas a pagar › Boletos e notas por foto.">
        <div className="flex flex-col gap-4 text-sm">
          {!iaConfigurada() && <p className="text-texto-suave">A leitura por IA ainda não está ligada no servidor (falta a chave ANTHROPIC_API_KEY).</p>}
          <FormAcao acao={salvarLeituraIa} botao="Salvar" limparAoSalvar={false}>
            <div className="w-48"><Campo rotulo="Leituras por mês, no máximo" id="ia_limite_mes" name="ia_limite_mes" type="number" min={0} max={5000} defaultValue={cfg?.ia_limite_mes ?? 200} required /></div>
            <p className="text-xs text-texto-suave">
              Cada foto ou PDF lido (e cada contagem de mortes por foto) conta uma leitura; custa alguns centavos. {leituras ?? 0} neste mês. Zero desliga.
            </p>
          </FormAcao>
          {caixa ? (
            <FormAcao acao={novoEnderecoEntrada} botao={endereco ? "Trocar endereço" : "Criar endereço"} limparAoSalvar={false} variante="secundario">
              <input type="hidden" name="trocar" value={endereco ? "1" : ""} />
              {endereco && <p>Encaminhe boletos, notas (XML ou PDF) e recibos para <span className="font-mono font-medium">{endereco}</span>.</p>}
              <p className="text-xs text-texto-suave">
                XML de NF-e vai para Notas de compra; PDF e foto passam pela IA. Até 10 anexos e 4 MB por e-mail. Quem lança contas a pagar recebe aviso no celular.
                Trocar o endereço desliga o anterior (use se ele vazar).
              </p>
            </FormAcao>
          ) : (
            <p className="text-xs text-texto-suave">A caixa de e-mail ainda não está ligada no servidor (faltam ENTRADA_EMAIL_ENDERECO e ENTRADA_EMAIL_SEGREDO).</p>
          )}
          <p className="text-xs text-texto-suave">
            No apontamento: o botão &quot;Falar o apontamento&quot; preenche os campos pela voz (sem custo, funciona no navegador do celular) e &quot;Contar mortes por foto&quot; usa a IA.
          </p>
        </div>
      </Cartao>

      <Cartao titulo="Chat do app de campo" descricao="Perguntas de manejo e lançamentos por texto ou voz no /campo, respondidos pela IA com a base da Embrapa.">
        <div className="flex flex-col gap-4 text-sm">
          {!iaConfigurada() && <p className="text-texto-suave">O chat com IA ainda não está ligado no servidor (falta a chave ANTHROPIC_API_KEY). O celular responde pela base de manejo que leva consigo.</p>}
          <FormAcao acao={salvarChatIa} botao="Salvar" limparAoSalvar={false}>
            <div className="w-48"><Campo rotulo="Perguntas por mês, no máximo" id="ia_chat_limite_mes" name="ia_chat_limite_mes" type="number" min={0} max={5000} defaultValue={cfg?.ia_chat_limite_mes ?? 300} required /></div>
            <p className="text-xs text-texto-suave">
              Cada mensagem enviada ao chat conta uma pergunta; custa alguns centavos. {perguntas ?? 0} neste mês. Passou do limite (ou zero), o celular
              continua respondendo pela base de manejo, sem IA, e nada se perde.
            </p>
          </FormAcao>
        </div>
      </Cartao>

      <Cartao titulo="Avisos de rotina" descricao="Também no celular de quem ligou os avisos, só para quem tem acesso ao assunto.">
        <FormAcao acao={salvarAvisosRotina} botao="Salvar" limparAoSalvar={false}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-64 flex-1 items-center gap-2 text-sm">
                <input type="checkbox" name="resumo_diario" defaultChecked={cfg?.resumo_diario ?? false} className="size-4 accent-marca" />
                Resumo do dia: produção de ontem, contas de hoje e alertas (quem vê relatórios)
              </label>
              <div className="w-32"><Campo rotulo="Às" id="resumo_hora" name="resumo_hora" type="time" defaultValue={hora(cfg?.resumo_hora, "06:30")} required /></div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-64 flex-1 items-center gap-2 text-sm">
                <input type="checkbox" name="pacote_contador" defaultChecked={cfg?.pacote_contador ?? false} className="size-4 accent-marca" />
                Pacote do contador do mês anterior pronto para baixar (quem vê relatórios)
              </label>
              <div className="w-32"><Campo rotulo="Dia do mês" id="pacote_contador_dia" name="pacote_contador_dia" type="number" min={1} max={28} defaultValue={cfg?.pacote_contador_dia ?? 5} required /></div>
            </div>
          </div>
        </FormAcao>
      </Cartao>

      <Cartao titulo="Vendas e cobrança" descricao="Plano Vendas ou acima. A nota e o boleto dependem do plano Fiscal.">
        <FormAcao acao={salvarVendas} botao="Salvar" limparAoSalvar={false}>
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="faturamento_completo" defaultChecked={cfg?.faturamento_completo ?? false} className="size-4 accent-marca" />
              Faturar num toque: ao faturar o pedido, emitir também a NF-e e o boleto ou Pix
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <p className="min-w-64 flex-1 text-sm">Pedidos fixos (Vendas › Pedidos fixos) gerados na véspera a partir de</p>
              <div className="w-32"><Campo rotulo="Hora" id="pedidos_fixos_hora" name="pedidos_fixos_hora" type="time" defaultValue={hora(cfg?.pedidos_fixos_hora, "16:00")} required /></div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-64 flex-1 items-center gap-2 text-sm">
                <input type="checkbox" name="bloquear_prazo_inadimplente" defaultChecked={cfg?.bloquear_prazo_inadimplente ?? false} className="size-4 accent-marca" />
                Só vender à vista para cliente com conta vencida há mais de
              </label>
              <div className="w-32"><Campo rotulo="Dias" id="inadimplencia_dias" name="inadimplencia_dias" type="number" min={1} max={180} defaultValue={cfg?.inadimplencia_dias ?? 15} required /></div>
            </div>
            <p className="text-xs text-texto-suave">
              A régua de cobrança fica em Contas a receber › Régua de cobrança: quem vence, quem atrasou e a mensagem pronta para o WhatsApp com a segunda via.
            </p>
          </div>
        </FormAcao>
      </Cartao>

      {whatsappConfigurado() ? (
        <>
          <Cartao titulo="Cobrança pelo WhatsApp" descricao="O lembrete da régua de cobrança sai sozinho para o cliente, pelo WhatsApp do Balbina, em nome da piscicultura.">
            <FormAcao acao={salvarCobrancaWhatsApp} botao="Salvar" limparAoSalvar={false}>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-64 flex-1 items-center gap-2 text-sm">
                  <input type="checkbox" name="whatsapp_cobranca" defaultChecked={cfg?.whatsapp_cobranca ?? false} className="size-4 accent-marca" />
                  Mandar o lembrete ao cliente 3 dias antes, no dia e no atraso (uma vez em cada fase)
                </label>
                <div className="w-32"><Campo rotulo="A partir das" id="whatsapp_cobranca_hora" name="whatsapp_cobranca_hora" type="time" defaultValue={hora(cfg?.whatsapp_cobranca_hora, "09:00")} required /></div>
              </div>
              <p className="text-xs text-texto-suave">
                Só para cliente com celular no cadastro, com a segunda via do boleto/Pix quando saiu pelo Asaas. Depois de 7 dias de atraso, só pela régua na tela.
                Cada mensagem é cobrada pela Meta.
              </p>
            </FormAcao>
          </Cartao>
          <WhatsAppPessoal />
        </>
      ) : (
        <Cartao titulo="WhatsApp" descricao="Avisos, documentos e cobrança pelo WhatsApp do Balbina.">
          <p className="text-sm text-texto-suave">O WhatsApp ainda não está ligado no servidor (faltam WHATSAPP_TOKEN e WHATSAPP_NUMERO_ID).</p>
        </Cartao>
      )}

      <Cartao titulo="Pagamentos pelo sistema" descricao="Pagar boletos pela conta Asaas da piscicultura, em Contas a pagar › Pagar pelo Asaas. Dinheiro saindo: só o master liga.">
        {master ? (
          <FormAcao acao={salvarPagamentos} botao="Salvar" limparAoSalvar={false}>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pagamentos_ligado" defaultChecked={cfg?.pagamentos_ligado ?? false} className="size-4 accent-marca" />
              Ligar o pagamento de boletos pelo Asaas
            </label>
            <div className="w-48"><Campo rotulo="Limite por dia (R$)" id="pagamento_limite_dia" name="pagamento_limite_dia" inputMode="decimal" defaultValue={centavosParaCampo(cfg?.pagamento_limite_dia_cents ?? 500000)} required /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pagamento_aprovacao_unica" defaultChecked={cfg?.pagamento_aprovacao_unica ?? false} className="size-4 accent-marca" />
              Aprovação por uma pessoa só (o master pode aprovar o que ele mesmo propôs)
            </label>
            <p className="text-xs text-texto-suave">
              Quem lança contas a pagar propõe; só o master aprova, com o segundo fator, e por padrão não aprova o que ele mesmo propôs.
              A baixa entra quando o Asaas confirma o pagamento. Precisa de saldo e da prova de vida na conta Asaas. Primeira versão: só boleto.
            </p>
          </FormAcao>
        ) : (
          <p className="text-sm text-texto-suave">{cfg?.pagamentos_ligado ? "Ligado pelo master." : "Desligado. Só o usuário master liga."}</p>
        )}
      </Cartao>

      <Cartao titulo="Compra e produção sugeridas" descricao="Em Previsões: o que produzir na fábrica e o que comprar, pelo consumo médio e pelas fórmulas vigentes.">
        <FormAcao acao={salvarAbastecimento} botao="Salvar" limparAoSalvar={false}>
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <Campo rotulo="Comprar para (dias)" id="compra_dias" name="compra_dias" type="number" min={1} max={180} defaultValue={cfg?.compra_dias ?? 30} required />
            <Campo rotulo="Produzir para (dias)" id="producao_dias" name="producao_dias" type="number" min={1} max={60} defaultValue={cfg?.producao_dias ?? 7} required />
          </div>
        </FormAcao>
      </Cartao>

      <Cartao titulo="Sempre ligadas" descricao="Não precisam de configuração.">
        <ul className="list-disc space-y-1 pl-5 text-sm text-texto-suave">
          <li>Cadastro de cliente e fornecedor: ao digitar o CNPJ ou o CEP, os campos vazios se preenchem pela consulta pública (BrasilAPI).</li>
          <li>Embalagens: com a ficha de embalagem no produto de peixe, as caixas, sacos e o gelo saem do estoque ao faturar a venda.</li>
          <li>Conciliação: o que foi lançado sempre do mesmo jeito pode ser lançado em lote; regras e recorrências aparecem como sugestão.</li>
        </ul>
      </Cartao>
    </div>
  );
}
