import Link from "next/link";
import { Settings2, ShieldCheck } from "lucide-react";
import { BotaoLancamento } from "@/components/lancamento";
import { AreaTexto, Campo, CLASSE_BOTAO_TEXTO, LinkBotao, Secao, Selecao, Tabela, Titulo } from "@/components/ui";
import { BotaoNfe } from "@/components/vendas/botao-nfe";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso } from "@/lib/permissoes";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { ambienteFocus } from "@/lib/focus";
import { ExcluirLinha } from "@/components/excluir-linha";
import { cadastrarEmitenteFocus, excluirRegraFiscal, inutilizarNumeracao, registrarWebhookFocus, salvarConfigFiscal, salvarRegraFiscal } from "./actions";

const REGIMES: Record<string, string> = { simples: "Simples Nacional", presumido: "Lucro presumido", real: "Lucro real", produtor_rural: "Produtor rural" };
const STATUS: Record<string, string> = { processando: "Processando", autorizada: "Autorizada", rejeitada: "Rejeitada", cancelada: "Cancelada", denegada: "Denegada", cancelando: "Cancelando", rascunho: "Rascunho" };

export default async function PaginaNotas() {
  await exigirAcesso("notas");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: empresa }, { data: config }, { data: notas }, { data: pedidos }, { data: emitente }, { data: inutilizacoes }, { data: regras }, { data: produtosVenda }, { data: clientes }] = await Promise.all([
    supabase.from("empresas").select("cnpj, regime_tributario, inscricao_estadual, endereco").eq("id", atual.id).single(),
    supabase.rpc("config_fiscal_empresa", { p_empresa: atual.id }),
    supabase.from("notas_fiscais").select("id, modelo, numero, serie, status, valor_total_cents, emitida_em, created_at, motivo_rejeicao, pedido_venda_id, contatos(nome)")
      .eq("empresa_id", atual.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("pedidos").select("id, numero, data, cliente_nome, total_cents, status").eq("empresa_id", atual.id)
      .in("status", ["faturado", "entregue"]).order("data", { ascending: false }).limit(100),
    supabase.from("focus_emitentes").select("focus_id, habilita_nfce, certificado_valido_ate, updated_at").eq("empresa_id", atual.id).maybeSingle(),
    supabase.from("inutilizacoes_nfe").select("id, modelo, serie, numero_inicial, numero_final, status, motivo, xml_path, created_at")
      .eq("empresa_id", atual.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("regras_fiscais").select("id, nome, produto_id, contato_id, destino, destinatario, cfop, icms_situacao, texto")
      .eq("empresa_id", atual.id).order("nome"),
    supabase.from("produtos").select("id, nome").eq("empresa_id", atual.id).eq("ativo", true).eq("para_venda", true).order("nome"),
    supabase.from("contatos").select("id, nome").eq("empresa_id", atual.id).contains("tipos", ["cliente"]).eq("arquivado", false).order("nome").limit(1000),
  ]);
  const nomeProduto = new Map((produtosVenda ?? []).map((p) => [p.id, p.nome]));
  const nomeCliente = new Map((clientes ?? []).map((c) => [c.id, c.nome]));
  const DESTINO: Record<string, string> = { qualquer: "qualquer destino", dentro: "dentro do estado", fora: "fora do estado" };
  const DESTINATARIO: Record<string, string> = { qualquer: "", contribuinte: "contribuinte (com IE)", nao_contribuinte: "sem inscrição estadual" };
  const end = (empresa?.endereco ?? {}) as Record<string, string | undefined>;
  const pessoaFisica = empresa?.cnpj.length === 11;
  const ambiente = ambienteFocus();
  const vencido = emitente?.certificado_valido_ate && new Date(emitente.certificado_valido_ate) < new Date();
  const cfg = (config ?? {}) as Record<string, string>;
  const comNota = new Set((notas ?? []).filter((n) => !["rejeitada", "cancelada", "denegada"].includes(n.status)).map((n) => n.pedido_venda_id));
  const semNota = (pedidos ?? []).filter((p) => !comNota.has(p.id));
  const configurado = Boolean(process.env.FOCUS_NFE_TOKEN || emitente);

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo
        acoes={
          <>
            <LinkBotao href="/notas/recebidas" tamanho="sm" variante="secundario">Notas de compra</LinkBotao>
            <BotaoLancamento rotulo="Configuração fiscal" acao={salvarConfigFiscal} variante="secundario" tamanho="sm" icone={<Settings2 size={16} strokeWidth={1.75} aria-hidden />}
              descricao={<>Endereços dos clientes ficam em <Link href="/contatos" className={CLASSE_BOTAO_TEXTO}>Clientes e fornecedores</Link>.</>}>
            <div className="grid gap-3 grid-cols-2">
              <Selecao rotulo="Regime" id="regime" name="regime_tributario" defaultValue={empresa?.regime_tributario}>
                {Object.entries(REGIMES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </Selecao>
              <Campo rotulo="Inscrição estadual" id="ie" name="inscricao_estadual" defaultValue={empresa?.inscricao_estadual ?? ""} />
              <Campo rotulo="UF da piscicultura" id="uf" name="uf" maxLength={2} defaultValue={end.uf ?? ""} required />
              <Campo rotulo="Rua, estrada ou ramal" id="logradouro" name="logradouro" defaultValue={end.logradouro ?? ""} className="col-span-2" />
              <Campo rotulo="Número (ou SN)" id="numero" name="numero" defaultValue={end.numero ?? ""} />
              <Campo rotulo="Complemento" id="complemento" name="complemento" defaultValue={end.complemento ?? ""} />
              <Campo rotulo="Bairro ou localidade" id="bairro" name="bairro" defaultValue={end.bairro ?? ""} />
              <Campo rotulo="CEP" id="cep" name="cep" inputMode="numeric" defaultValue={end.cep ?? ""} />
              <Campo rotulo="Município" id="municipio" name="municipio" defaultValue={end.municipio ?? ""} />
              <Campo rotulo="Telefone" id="telefone" name="telefone" defaultValue={end.telefone ?? ""} />
              <Campo rotulo="E-mail fiscal" id="email" name="email" type="email" defaultValue={end.email ?? ""} />
              <Campo rotulo="CFOP dentro do estado" id="cfop_i" name="cfop_interna" defaultValue={cfg.cfop_interna} />
              <Campo rotulo="CFOP para outro estado" id="cfop_e" name="cfop_interestadual" defaultValue={cfg.cfop_interestadual} />
              <Campo rotulo="Série da NF-e" id="serie" name="serie" type="number" min={1} defaultValue={cfg.serie} />
              <Campo rotulo="Série da NFC-e" id="serie_nfce" name="serie_nfce" type="number" min={1} defaultValue={cfg.serie_nfce} />
              <Campo rotulo="ICMS (CST ou CSOSN)" id="icms" name="icms_situacao" defaultValue={cfg.icms_situacao} />
              <Campo rotulo="PIS (CST)" id="pis" name="pis_situacao" defaultValue={cfg.pis_situacao} />
              <Campo rotulo="COFINS (CST)" id="cofins" name="cofins_situacao" defaultValue={cfg.cofins_situacao} />
              <Campo rotulo="Funrural + Senar (%)" id="funrural" name="funrural_percentual" inputMode="decimal" defaultValue={String(cfg.funrural_percentual ?? 0).replace(".", ",")} />
            </div>
            <Campo rotulo="Informações complementares" id="info" name="informacoes_adicionais" defaultValue={cfg.informacoes_adicionais} placeholder="Ex.: Pescado isento de ICMS conforme o RICMS do estado…" />
            <p className="text-xs text-texto-suave">Os padrões partem da venda de peixe fresco in natura, em geral isento de ICMS (Convênio ICMS 60/91, com exceções por espécie e por estado) e com PIS e COFINS de alíquota zero. Para produtor rural pessoa física a nota sai com o CPF, sem PIS/COFINS (CST 08), e o Funrural aparece nas informações complementares. Campos vazios voltam ao padrão. Confirme tudo com o contador antes de emitir em produção.</p>
          </BotaoLancamento>
            <BotaoLancamento rotulo="Certificado e Focus" titulo="Emitente na Focus" acao={cadastrarEmitenteFocus} botao={emitente ? "Atualizar na Focus" : "Cadastrar na Focus"} variante="secundario" tamanho="sm"
              icone={<ShieldCheck size={16} strokeWidth={1.75} aria-hidden />}
              descricao={`${emitente
                ? `Cadastrado${emitente.certificado_valido_ate ? `; certificado válido até ${formatarData(emitente.certificado_valido_ate.slice(0, 10))}` : ""}${emitente.habilita_nfce ? "; NFC-e ligada" : ""}.`
                : "Salve antes a configuração fiscal e envie aqui o certificado digital A1 da piscicultura (arquivo .pfx)."} O certificado e a senha vão direto para a Focus e não ficam guardados no Balbina.`}>
            <label htmlFor="certificado" className="flex flex-col gap-1 text-sm">
              Certificado A1 (.pfx){emitente && " — só se for trocar"}
              <input id="certificado" name="certificado" type="file" accept=".pfx,.p12,application/x-pkcs12" required={!emitente} className="text-sm" />
            </label>
            <Campo rotulo="Senha do certificado" id="senha_certificado" name="senha_certificado" type="password" autoComplete="off" />
            {!pessoaFisica && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="habilita_nfce" defaultChecked={emitente?.habilita_nfce} className="size-4 accent-marca" />
                  Emitir NFC-e no PDV
                </label>
                <div className="grid grid-cols-[6rem_1fr] gap-2">
                  <Campo rotulo="ID do CSC" id="csc_id" name="csc_id" inputMode="numeric" />
                  <Campo rotulo={`CSC da NFC-e (${ambiente === "producao" ? "produção" : "homologação"})`} id="csc" name="csc" autoComplete="off" />
                </div>
                <p className="text-xs text-texto-suave">O CSC (código de segurança do contribuinte) é gerado no site da SEFAZ do estado. Deixe em branco para manter o atual.</p>
              </>
            )}
            {pessoaFisica && <p className="text-xs text-texto-suave">Produtor rural pessoa física emite NF-e com CPF e inscrição estadual. NFC-e exige CNPJ.</p>}
          </BotaoLancamento>
            <BotaoLancamento rotulo="Aviso da Focus" titulo="Aviso automático da Focus" acao={registrarWebhookFocus} botao="Cadastrar aviso" variante="secundario" tamanho="sm" icone={null}
              descricao="Cadastra na Focus o endereço deste app, para a nota mudar de situação sozinha quando a SEFAZ responder.">
              <span />
            </BotaoLancamento>
          </>
        }
        descricao={`NF-e dos pedidos faturados e NFC-e do balcão pela Focus NFe. Ambiente: ${ambiente === "producao" ? "produção (notas com valor fiscal)" : "homologação (notas de teste, sem valor fiscal)"}.`}>Notas fiscais</Titulo>
      {!configurado && (
        <p className="rounded-md border border-perigo/40 bg-perigo/5 px-3 py-2 text-sm">
          A piscicultura ainda não está cadastrada como emitente na Focus NFe. Preencha a Configuração fiscal e envie o certificado A1 em Certificado e Focus, nos botões do alto.
        </p>
      )}
      {vencido && (
        <p className="rounded-md border border-perigo/40 bg-perigo/5 px-3 py-2 text-sm">
          O certificado digital venceu em {formatarData(emitente!.certificado_valido_ate!.slice(0, 10))}. Envie o certificado novo para continuar emitindo.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Pedidos faturados sem nota</h2>
        <Tabela cabecalho={["Pedido", "Data", "Cliente", "Total", "NF-e"]} principal="Cliente" total={semNota.length} vazio="Todos os pedidos faturados já têm nota.">
          {semNota.map((p) => (
            <tr key={p.id} className="align-top tabular-nums">
              <td>{p.numero}</td>
              <td>{formatarData(p.data)}</td>
              <td>{p.cliente_nome}</td>
              <td>{formatarMoeda(p.total_cents)}</td>
              <td><BotaoNfe pedidoId={p.id} pedidoStatus={p.status} /></td>
            </tr>
          ))}
        </Tabela>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Notas emitidas</h2>
        <Tabela cabecalho={["Número", "Modelo", "Data", "Cliente", "Valor", "Situação", ""]} principal="Cliente" total={notas?.length ?? 0} vazio="Nenhuma nota ainda.">
          {(notas ?? []).map((n) => (
            <tr key={n.id} className="align-top tabular-nums">
              <td>{n.numero ? `${n.numero}/${n.serie}` : "–"}</td>
              <td>{n.modelo === "nfce" ? "NFC-e" : "NF-e"}</td>
              <td>{formatarData((n.emitida_em ?? n.created_at).slice(0, 10))}</td>
              <td>{(n.contatos as unknown as { nome: string } | null)?.nome ?? "–"}</td>
              <td>{formatarMoeda(n.valor_total_cents)}</td>
              <td className={n.status === "rejeitada" ? "text-perigo" : ""}>{STATUS[n.status] ?? n.status}</td>
              <td>{n.pedido_venda_id && <BotaoNfe pedidoId={n.pedido_venda_id} pedidoStatus="faturado" />}</td>
            </tr>
          ))}
        </Tabela>
      </section>

      <Secao
        titulo="Inutilizar numeração"
        descricao="Quando um número de nota foi pulado (rejeição que não vai ser reemitida, falha de sistema), a SEFAZ pede que ele seja inutilizado. Número já usado por nota não pode."
        acoes={
          <BotaoLancamento rotulo="Inutilizar números" titulo="Nova inutilização" acao={inutilizarNumeracao} botao="Inutilizar" variante="secundario" icone={null}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Selecao rotulo="Modelo" id="inu_modelo" name="modelo" defaultValue="nfe">
                  <option value="nfe">NF-e</option>
                  {!pessoaFisica && <option value="nfce">NFC-e</option>}
                </Selecao>
                <Campo rotulo="Série" id="inu_serie" name="serie" type="number" min={0} defaultValue={cfg.serie} required />
                <Campo rotulo="Do número" id="inu_ini" name="numero_inicial" type="number" min={1} required />
                <Campo rotulo="Até o número" id="inu_fim" name="numero_final" type="number" min={1} />
              </div>
              <Campo rotulo="Justificativa (mín. 15 caracteres)" id="inu_just" name="justificativa" required minLength={15} />
            </BotaoLancamento>
        }
      >
        <Tabela cabecalho={["Modelo", "Série", "Números", "Data", "Situação", ""]} principal="Números" total={inutilizacoes?.length ?? 0} vazio="Nenhuma numeração inutilizada.">
          {(inutilizacoes ?? []).map((i) => (
            <tr key={i.id} className="align-top tabular-nums">
              <td>{i.modelo === "nfce" ? "NFC-e" : "NF-e"}</td>
              <td>{i.serie}</td>
              <td>{i.numero_inicial === i.numero_final ? i.numero_inicial : `${i.numero_inicial} a ${i.numero_final}`}</td>
              <td>{formatarData(i.created_at.slice(0, 10))}</td>
              <td className={i.status === "rejeitada" ? "text-perigo" : ""}>
                {i.status === "autorizada" ? "Inutilizada" : i.status === "rejeitada" ? "Recusada" : "Processando"}
                {i.motivo && <span className="block text-xs">{i.motivo}</span>}
              </td>
              <td>{i.xml_path && <a href={`/api/notas/${i.id}/inutilizacao`} className={CLASSE_BOTAO_TEXTO}>XML</a>}</td>
            </tr>
          ))}
        </Tabela>
      </Secao>

      <Secao
        titulo="Regras fiscais"
        descricao="Combinadas com o contador: CFOP, situação do ICMS e texto da nota escolhidos sozinhos por produto, cliente e destino. Quando mais de uma vale, ganha a mais específica (produto, depois cliente, depois destino); os textos se somam."
        acoes={<BotaoLancamento rotulo="Nova regra fiscal" acao={salvarRegraFiscal} botao="Salvar regra" variante="secundario">
            <Campo rotulo="Nome" id="rf_nome" name="nome" required placeholder="Ex.: Peixe para fora do estado" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Selecao rotulo="Produto" id="rf_prod" name="produto_id" defaultValue="">
                <option value="">Todos</option>
                {(produtosVenda ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </Selecao>
              <Selecao rotulo="Cliente" id="rf_cli" name="contato_id" defaultValue="">
                <option value="">Todos</option>
                {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
              <Selecao rotulo="Destino" id="rf_dest" name="destino" defaultValue="qualquer">
                <option value="qualquer">Qualquer</option>
                <option value="dentro">Dentro do estado</option>
                <option value="fora">Fora do estado</option>
              </Selecao>
              <Selecao rotulo="Destinatário" id="rf_tipo" name="destinatario" defaultValue="qualquer">
                <option value="qualquer">Qualquer</option>
                <option value="contribuinte">Contribuinte (com inscrição estadual)</option>
                <option value="nao_contribuinte">Sem inscrição estadual</option>
              </Selecao>
              <Campo rotulo="CFOP" id="rf_cfop" name="cfop" inputMode="numeric" placeholder="Ex.: 6101" />
              <Campo rotulo="Situação do ICMS (CST/CSOSN)" id="rf_icms" name="icms_situacao" inputMode="numeric" placeholder="Ex.: 40 ou 400" />
            </div>
            <AreaTexto rotulo="Texto na nota" id="rf_texto" name="texto" placeholder="Ex.: Isento de ICMS conforme ..." className="font-sans" />
          </BotaoLancamento>}
      >
        <Tabela cabecalho={["Regra", "Vale para", "CFOP", "ICMS", "Texto", ""]} principal="Regra" total={regras?.length ?? 0} vazio="Nenhuma regra: valem os CFOP e a situação da configuração fiscal.">
          {(regras ?? []).map((r) => (
            <tr key={r.id} className="align-top">
              <td className="font-medium">{r.nome}</td>
              <td className="text-sm">{[r.produto_id ? nomeProduto.get(r.produto_id) ?? "produto" : "todos os produtos", r.contato_id ? nomeCliente.get(r.contato_id) ?? "cliente" : "todos os clientes",
                DESTINO[r.destino], DESTINATARIO[r.destinatario]].filter(Boolean).join(" · ")}</td>
              <td className="tabular-nums">{r.cfop ?? "–"}</td>
              <td className="tabular-nums">{r.icms_situacao ?? "–"}</td>
              <td className="text-sm">{r.texto ?? "–"}</td>
              <td><ExcluirLinha acao={excluirRegraFiscal} id={r.id} /></td>
            </tr>
          ))}
        </Tabela>
      </Secao>
    </div>
  );
}
