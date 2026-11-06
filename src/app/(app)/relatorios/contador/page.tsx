import { BookOpen, FolderArchive } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Campo, Cartao, CLASSE_CONTROLE, LinkBotao, Selecao, Titulo, classeBotao } from "@/components/ui";
import { faltasLcdpr } from "@/lib/lcdpr";
import { imovelDe, produtorDe } from "@/lib/lcdpr-dados";
import { createClient } from "@/lib/supabase/server";
import { salvarLcdpr } from "./actions";
import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO } from "@/lib/formato";
import { periodoMes } from "@/lib/pacote-contador";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { AbasRelatorio } from "../abas";

// Pacote mensal do contador (E1): tudo o que o escritório pede, num .zip.
export default async function PaginaPacoteContador({ searchParams }: PageProps<"/relatorios/contador">) {
  await exigirAcesso("relatorios");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const filtros = await searchParams;
  const hoje = hojeISO(atual.fuso);
  // padrão: o mês anterior, que é o que o contador fecha
  const [ano, mesHoje] = hoje.split("-").map(Number);
  const padrao = new Date(Date.UTC(ano, mesHoje - 2, 1)).toISOString().slice(0, 7);
  const mes = typeof filtros.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(filtros.mes) ? filtros.mes : padrao;
  const p = periodoMes(mes);
  const supabase = await createClient();
  const [{ data: lcdpr }, { data: emp }] = await Promise.all([
    supabase.from("lcdpr_config").select("*").eq("empresa_id", atual.id).maybeSingle(),
    supabase.from("empresas").select("cnpj").eq("id", atual.id).single(),
  ]);
  const faltas = faltasLcdpr(produtorDe(lcdpr), imovelDe(lcdpr));
  const anoLcdpr = ano - 1;
  const v = (c: string) => (lcdpr?.[c] ?? "") as string;
  const pf = /^\d{11}$/.test(emp?.cnpj ?? "");
  const itens = [
    "Resultado (DRE) do ano, por competência e por caixa (planilha)",
    "Contas a pagar e a receber com vencimento no mês (planilha)",
    "Extrato de cada conta no mês, com a situação da conciliação (CSV)",
    pode("notas.ver") ? "XML das notas emitidas no mês, autorizadas e canceladas" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Titulo descricao="O que o escritório de contabilidade pede todo mês, num arquivo só. Configure o aviso mensal em Configurações › Automações.">
        Pacote do contador
      </Titulo>
      <AbasRelatorio atual="/relatorios/contador" />
      <form className="flex flex-wrap items-end gap-3" action="/relatorios/contador">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-texto-suave">Mês</span>
          <input type="month" name="mes" defaultValue={mes} className={`h-10 px-3 ${CLASSE_CONTROLE}`} />
        </label>
        <button type="submit" className={classeBotao("secundario", "sm")}>Ver</button>
      </form>
      <Cartao titulo={`Pacote de ${p.nome}`} icone={FolderArchive} cor="azul" descricao="Montado na hora, com o que está lançado agora."
        acoes={<LinkBotao href={`/relatorios/contador/baixar?mes=${mes}`} tamanho="sm" prefetch={false}>Baixar (.zip)</LinkBotao>}>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {itens.map((i) => <li key={i}>{i}</li>)}
          <li>LEIA-ME com o que entrou e o que ficou de fora</li>
        </ul>
        <p className="mt-3 text-xs text-texto-suave">Com muitas notas no mês, o pacote leva alguns segundos para sair. Notas de compra entram quando a busca na SEFAZ estiver ligada.</p>
      </Cartao>
      <Cartao titulo="LCDPR (produtor rural pessoa física)" icone={BookOpen} cor="verde"
        descricao="Livro Caixa Digital do Produtor Rural, leiaute 1.3 da Receita, montado com os recebimentos e pagamentos do ano (sem empréstimos). O contador confere e transmite."
        acoes={faltas.length === 0 ? <LinkBotao href={`/relatorios/contador/lcdpr?ano=${anoLcdpr}`} tamanho="sm" prefetch={false}>Baixar {anoLcdpr} (.txt)</LinkBotao> : undefined}>
        {faltas.length > 0 && <p className="text-sm text-alerta">Falta no cadastro: {faltas.join(", ")}.</p>}
        {!pf && <p className="text-xs text-texto-suave">A empresa está com CNPJ: o LCDPR é do titular pessoa física. Informe o CPF dele abaixo.</p>}
        <p className="mt-2 text-xs text-texto-suave">Outro ano: troque o número no fim do link (…?ano=2025). Conta corrente e poupança com banco entram como contas; caixinha como espécie; cartão e aplicação como numerário em trânsito.</p>
        {pode("configuracoes.editar") && (
          <details className="mt-3 rounded-lg border border-linha px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">Cadastro do LCDPR</summary>
            <FormAcao acao={salvarLcdpr} botao="Salvar" limparAoSalvar={false} className="mt-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo rotulo="CPF do titular" id="l_cpf" name="cpf" inputMode="numeric" defaultValue={v("cpf") || (pf ? emp?.cnpj : "")} />
                <Campo rotulo="Nome do titular" id="l_nome" name="nome" defaultValue={v("nome")} />
                <Selecao rotulo="Forma de apuração" id="l_forma" name="forma_apuracao" defaultValue={String(lcdpr?.forma_apuracao ?? 1)}>
                  <option value="1">Livro caixa</option>
                  <option value="2">Lucro de 20% da receita (Lei 8.023/1990)</option>
                </Selecao>
                <Campo rotulo="Endereço" id="l_end" name="endereco" defaultValue={v("endereco")} />
                <Campo rotulo="Número" id="l_num" name="numero" defaultValue={v("numero")} />
                <Campo rotulo="Complemento" id="l_comp" name="complemento" defaultValue={v("complemento")} />
                <Campo rotulo="Bairro" id="l_bai" name="bairro" defaultValue={v("bairro")} />
                <Campo rotulo="UF" id="l_uf" name="uf" maxLength={2} defaultValue={v("uf")} />
                <Campo rotulo="Código IBGE do município" id="l_mun" name="cod_mun" inputMode="numeric" defaultValue={v("cod_mun")} ajuda="7 números; Manaus é 1302603" />
                <Campo rotulo="CEP" id="l_cep" name="cep" inputMode="numeric" defaultValue={v("cep")} />
                <Campo rotulo="Telefone" id="l_tel" name="telefone" defaultValue={v("telefone")} />
                <Campo rotulo="E-mail" id="l_email" name="email" type="email" defaultValue={v("email")} />
              </div>
              <p className="text-sm font-medium">Imóvel rural</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo rotulo="Nome do imóvel" id="l_inome" name="imovel_nome" defaultValue={v("imovel_nome")} />
                <Campo rotulo="CIB/NIRF" id="l_itr" name="cad_itr" inputMode="numeric" defaultValue={v("cad_itr")} ajuda="número do imóvel na Receita, 8 números" />
                <Campo rotulo="CAEPF" id="l_caepf" name="caepf" inputMode="numeric" defaultValue={v("caepf")} ajuda="14 números" />
                <Campo rotulo="Inscrição estadual" id="l_ie" name="inscricao_estadual" defaultValue={v("inscricao_estadual")} />
                <Campo rotulo="Endereço do imóvel" id="l_iend" name="imovel_endereco" defaultValue={v("imovel_endereco")} />
                <Campo rotulo="Número" id="l_inum" name="imovel_numero" defaultValue={v("imovel_numero")} />
                <Campo rotulo="Complemento" id="l_icomp" name="imovel_complemento" defaultValue={v("imovel_complemento")} />
                <Campo rotulo="Bairro ou localidade" id="l_ibai" name="imovel_bairro" defaultValue={v("imovel_bairro")} />
                <Campo rotulo="UF" id="l_iuf" name="imovel_uf" maxLength={2} defaultValue={v("imovel_uf")} />
                <Campo rotulo="Código IBGE do município" id="l_imun" name="imovel_cod_mun" inputMode="numeric" defaultValue={v("imovel_cod_mun")} />
                <Campo rotulo="CEP" id="l_icep" name="imovel_cep" inputMode="numeric" defaultValue={v("imovel_cep")} />
                <Selecao rotulo="Exploração" id="l_tipo" name="tipo_exploracao" defaultValue={String(lcdpr?.tipo_exploracao ?? 1)}>
                  <option value="1">Individual (imóvel próprio)</option>
                  <option value="2">Condomínio</option>
                  <option value="3">Imóvel arrendado</option>
                  <option value="4">Parceria</option>
                  <option value="5">Comodato</option>
                  <option value="6">Outros</option>
                </Selecao>
                <Campo rotulo="Participação (%)" id="l_part" name="participacao" inputMode="decimal"
                  defaultValue={String(Number(lcdpr?.participacao_centesimos ?? 10000) / 100).replace(".", ",")} />
              </div>
              <p className="text-sm font-medium">Contador que assina (opcional)</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo rotulo="Nome" id="l_cnome" name="contador_nome" defaultValue={v("contador_nome")} />
                <Campo rotulo="CPF/CNPJ" id="l_cdoc" name="contador_documento" defaultValue={v("contador_documento")} />
                <Campo rotulo="CRC" id="l_ccrc" name="contador_crc" defaultValue={v("contador_crc")} />
                <Campo rotulo="E-mail" id="l_cemail" name="contador_email" defaultValue={v("contador_email")} />
                <Campo rotulo="Telefone" id="l_cfone" name="contador_fone" defaultValue={v("contador_fone")} />
              </div>
            </FormAcao>
          </details>
        )}
      </Cartao>
    </div>
  );
}
