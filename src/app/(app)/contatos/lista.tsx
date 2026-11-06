"use client";

import { useState, type FocusEvent } from "react";
import { AbasFiltro, FormPainel, ListaCadastro, Marcar, SecaoForm } from "@/components/cadastro";
import { AreaTexto, Campo, Etiqueta, Selecao } from "@/components/ui";
import { formatarDocumento } from "@/lib/documento";
import { consultarCep, consultarCnpj, type DadosCadastro } from "@/lib/consulta-publica";
import { excluirContato, salvarContato } from "./actions";

type Endereco = { logradouro?: string; numero?: string; complemento?: string; bairro?: string; cep?: string };

export type Contato = {
  id: string;
  tipos: string[];
  nome: string;
  cpf_cnpj: string | null;
  inscricao_estadual: string | null;
  produtor_rural: boolean;
  email: string | null;
  telefone: string | null;
  endereco: Endereco | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  arquivado: boolean;
  lista_preco_id: string | null;
};

type TabelaPreco = { id: string; nome: string; padrao: boolean; ativa: boolean };

const TIPOS: Record<string, string> = { cliente: "Cliente", fornecedor: "Fornecedor", funcionario: "Funcionário", socio: "Sócio" };
const ABAS = { cliente: "Clientes", fornecedor: "Fornecedores", funcionario: "Funcionários", socio: "Sócios", todos: "Todos", arquivados: "Arquivados" } as const;
type Aba = keyof typeof ABAS;

// Faltando algo que a NF-e exige
function incompleto(c: Contato) {
  const e = c.endereco ?? {};
  return !c.cpf_cnpj || !e.logradouro || !e.numero || !e.bairro || !e.cep || !c.cidade || !c.uf || (c.produtor_rural && !c.inscricao_estadual);
}

// Preenche só os campos vazios do formulário com os dados públicos (CNPJ ou CEP).
function preencherVazios(form: HTMLFormElement | null, dados: DadosCadastro | null) {
  if (!form || !dados) return 0;
  let n = 0;
  for (const [campo, valor] of Object.entries(dados)) {
    const el = form.elements.namedItem(campo);
    if (valor && el instanceof HTMLInputElement && !el.value.trim()) {
      el.value = valor;
      n++;
    }
  }
  return n;
}

function FormContato({ contato, tipoPadrao, tabelas, podeEditar }: { contato?: Contato; tipoPadrao: string; tabelas: TabelaPreco[]; podeEditar: boolean }) {
  const [pessoa, setPessoa] = useState<"fisica" | "juridica">(contato?.cpf_cnpj?.length === 14 ? "juridica" : contato ? "fisica" : "juridica");
  const [produtor, setProdutor] = useState(contato?.produtor_rural ?? false);
  const [consulta, setConsulta] = useState<string | null>(null);
  async function aoSairDoDocumento(ev: FocusEvent<HTMLInputElement>) {
    const form = ev.currentTarget.form;
    if (ev.currentTarget.value.replace(/\D/g, "").length !== 14) return;
    setConsulta("Buscando o CNPJ na Receita…");
    const n = preencherVazios(form, await consultarCnpj(ev.currentTarget.value));
    setConsulta(n ? `Preenchido pelo CNPJ (${n} campo(s)). Confira antes de salvar.` : "CNPJ não encontrado ou campos já preenchidos.");
  }
  async function aoSairDoCep(ev: FocusEvent<HTMLInputElement>) {
    const form = ev.currentTarget.form;
    const n = preencherVazios(form, await consultarCep(ev.currentTarget.value));
    if (n) setConsulta(`Endereço preenchido pelo CEP (${n} campo(s)).`);
  }
  const e = contato?.endereco ?? {};
  const pf = pessoa === "fisica";
  const tipos = contato?.tipos ?? [tipoPadrao in TIPOS ? tipoPadrao : "cliente"];

  return (
    <FormPainel acao={salvarContato} excluir={contato ? excluirContato : undefined} somenteLeitura={!podeEditar}
      confirmacao={`Excluir ${contato?.nome ?? "o cadastro"}? Se já tiver lançamentos ou pedidos, arquive em vez de excluir.`}>
      {contato && <input type="hidden" name="id" value={contato.id} />}

      <SecaoForm titulo="Cadastro">
        <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
          <legend className="sr-only">É</legend>
          {Object.entries(TIPOS).map(([v, n]) => (
            <Marcar key={v} rotulo={n} name="tipos" value={v} defaultChecked={tipos.includes(v)} />
          ))}
        </fieldset>
        <div role="radiogroup" aria-label="Pessoa" className="inline-flex w-fit gap-0.5 rounded-full border border-borda bg-elevado/60 p-0.5 text-[13px]">
          {(["juridica", "fisica"] as const).map((p) => (
            <label key={p} className={`cursor-pointer rounded-full px-3.5 py-1 font-medium transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-marca ${
              pessoa === p ? "bg-solido text-texto shadow-[0_1px_3px_rgb(0_0_0/0.12)]" : "text-texto-suave hover:text-texto"}`}>
              <input type="radio" name="pessoa" value={p} checked={pessoa === p} onChange={() => setPessoa(p)} className="sr-only" />
              {p === "juridica" ? "Pessoa jurídica" : "Pessoa física"}
            </label>
          ))}
        </div>
        <Campo rotulo={pf ? "Nome completo" : "Razão social"} id="ct_nome" name="nome" defaultValue={contato?.nome} required
          placeholder={pf ? "Ex.: João da Silva" : "Ex.: Mercado Bom Preço Ltda"} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo={pf ? "CPF" : "CNPJ"} id="ct_doc" name="cpf_cnpj" inputMode="numeric" defaultValue={formatarDocumento(contato?.cpf_cnpj)}
            placeholder={pf ? "000.000.000-00" : "00.000.000/0000-00"} required={pf && produtor} onBlur={aoSairDoDocumento}
            ajuda={pf ? undefined : "ao sair do campo, nome, contato e endereço vêm da Receita"} />
          <Campo rotulo="Inscrição estadual" id="ct_ie" name="inscricao_estadual" defaultValue={contato?.inscricao_estadual ?? ""}
            placeholder={pf && !produtor ? "Não tem" : "Número ou ISENTO"} required={pf && produtor} />
        </div>
        {consulta && <p role="status" className="text-xs text-texto-suave">{consulta}</p>}
        {pf && (
          <Marcar rotulo="Produtor rural" ajuda="Pessoa física com inscrição estadual de produtor: a NF-e sai com CPF e IE."
            name="produtor_rural" checked={produtor} onChange={(ev) => setProdutor(ev.target.checked)} />
        )}
      </SecaoForm>

      <SecaoForm titulo="Contato">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="E-mail" id="ct_email" name="email" type="email" defaultValue={contato?.email ?? ""} ajuda="recebe boleto e nota" />
          <Campo rotulo="Telefone" id="ct_tel" name="telefone" type="tel" defaultValue={contato?.telefone ?? ""} placeholder="(00) 00000-0000" />
        </div>
      </SecaoForm>

      <SecaoForm titulo="Endereço">
        <div className="grid grid-cols-6 gap-3">
          <div className="col-span-6 sm:col-span-2"><Campo rotulo="CEP" id="ct_cep" name="cep" inputMode="numeric" defaultValue={e.cep ?? ""} placeholder="00000-000" onBlur={aoSairDoCep} /></div>
          <div className="col-span-6 sm:col-span-4"><Campo rotulo="Rua" id="ct_rua" name="logradouro" defaultValue={e.logradouro ?? ""} placeholder="Rua, estrada ou linha" /></div>
          <div className="col-span-2"><Campo rotulo="Número" id="ct_num" name="numero" defaultValue={e.numero ?? ""} placeholder="S/N" /></div>
          <div className="col-span-4"><Campo rotulo="Complemento" id="ct_comp" name="complemento" defaultValue={e.complemento ?? ""} /></div>
          <div className="col-span-6 sm:col-span-3"><Campo rotulo="Bairro ou localidade" id="ct_bairro" name="bairro" defaultValue={e.bairro ?? ""} /></div>
          <div className="col-span-4 sm:col-span-2"><Campo rotulo="Cidade" id="ct_cidade" name="cidade" defaultValue={contato?.cidade ?? ""} /></div>
          <div className="col-span-2 sm:col-span-1"><Campo rotulo="UF" id="ct_uf" name="uf" maxLength={2} defaultValue={contato?.uf ?? ""} className="uppercase" /></div>
        </div>
      </SecaoForm>

      {tabelas.length > 1 && (
        <SecaoForm titulo="Vendas">
          <Selecao rotulo="Tabela de preço" id="ct_tabela" name="lista_preco_id" defaultValue={contato?.lista_preco_id ?? ""}
            ajuda="Usada nas vendas para este cliente. Preço especial do cliente vence a tabela.">
            {tabelas.filter((t) => t.padrao).map((t) => <option key={t.id} value="">{t.nome}</option>)}
            {tabelas.filter((t) => !t.padrao && (t.ativa || t.id === contato?.lista_preco_id)).map((t) => (
              <option key={t.id} value={t.id}>{t.nome}{t.ativa ? "" : " (inativa)"}</option>
            ))}
          </Selecao>
        </SecaoForm>
      )}

      <SecaoForm titulo="Outros">
        <AreaTexto rotulo="Observações" id="ct_obs" name="observacoes" defaultValue={contato?.observacoes ?? ""} className="font-sans" />
        {contato && <Marcar rotulo="Arquivado" ajuda="Some das listas e dos lançamentos, mas o histórico fica." name="arquivado" defaultChecked={contato.arquivado} />}
      </SecaoForm>
    </FormPainel>
  );
}

export function ListaContatos({ contatos, tabelas, tipoInicial, podeEditar }: { contatos: Contato[]; tabelas: TabelaPreco[]; tipoInicial: string; podeEditar: boolean }) {
  const [aba, setAba] = useState<Aba>(tipoInicial in ABAS ? (tipoInicial as Aba) : "cliente");
  const porId = new Map(contatos.map((c) => [c.id, c]));
  const nomeTabela = new Map(tabelas.filter((t) => !t.padrao).map((t) => [t.id, t.nome]));
  const visiveis = contatos.filter((c) =>
    aba === "arquivados" ? c.arquivado : !c.arquivado && (aba === "todos" || c.tipos.includes(aba)));
  const tipoNovo = aba in TIPOS ? aba : "cliente";
  const nomeNovo = tipoNovo === "fornecedor" ? "Novo fornecedor" : tipoNovo === "cliente" ? "Novo cliente" : `Novo ${TIPOS[tipoNovo].toLowerCase()}`;

  return (
    <ListaCadastro
      colunas={["Nome", "Documento", "Contato", "Cidade", "Situação"]}
      buscaPlaceholder="Buscar por nome, CPF/CNPJ, e-mail ou cidade"
      vazio="Ninguém cadastrado neste filtro."
      filtros={<AbasFiltro rotulo="Tipo" valor={aba} aoMudar={setAba} opcoes={(Object.keys(ABAS) as Aba[]).map((a) => ({ valor: a, nome: <>{ABAS[a]} <span className="tabular-nums opacity-60">{contatos.filter((c) => (a === "arquivados" ? c.arquivado : !c.arquivado && (a === "todos" || c.tipos.includes(a)))).length}</span></> }))} />}
      rotuloNovo={nomeNovo}
      novo={podeEditar ? { titulo: nomeNovo, conteudo: <FormContato tipoPadrao={tipoNovo} tabelas={tabelas} podeEditar /> } : null}
      editar={(id) => {
        const c = porId.get(id);
        return c ? { titulo: c.nome, conteudo: <FormContato contato={c} tipoPadrao={tipoNovo} tabelas={tabelas} podeEditar={podeEditar} /> } : null;
      }}
      linhas={visiveis.map((c) => ({
        id: c.id,
        busca: [c.nome, c.cpf_cnpj, formatarDocumento(c.cpf_cnpj), c.email, c.telefone, c.cidade].filter(Boolean).join(" "),
        ordem: [c.nome, c.cpf_cnpj ?? null, c.email ?? c.telefone ?? null, c.cidade ?? null, c.arquivado ? 2 : incompleto(c) ? 0 : 1],
        inativa: c.arquivado,
        celulas: [
          <span key="n" className="flex flex-col">
            <span className="font-medium text-texto">{c.nome}</span>
            <span className="text-xs text-texto-suave">{c.tipos.map((t) => TIPOS[t]).join(", ")}</span>
          </span>,
          <span key="d" className="whitespace-nowrap tabular-nums">{c.cpf_cnpj ? formatarDocumento(c.cpf_cnpj) : <span className="text-texto-suave">–</span>}</span>,
          <span key="c" className="flex flex-col text-[13px]">
            {c.email && <span className="truncate">{c.email}</span>}
            {c.telefone && <span className="text-texto-suave">{c.telefone}</span>}
            {!c.email && !c.telefone && <span className="text-texto-suave">–</span>}
          </span>,
          c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ""}` : <span key="ci" className="text-texto-suave">–</span>,
          <span key="s" className="flex flex-wrap gap-1">
            {c.produtor_rural && <Etiqueta tom="info">Produtor rural</Etiqueta>}
            {c.lista_preco_id && nomeTabela.has(c.lista_preco_id) && <Etiqueta tom="info">{nomeTabela.get(c.lista_preco_id)}</Etiqueta>}
            {c.arquivado ? <Etiqueta>Arquivado</Etiqueta> : incompleto(c) ? <Etiqueta tom="alerta">Falta dado p/ NF-e</Etiqueta> : <Etiqueta tom="positivo">Completo</Etiqueta>}
          </span>,
        ],
      }))}
    />
  );
}
