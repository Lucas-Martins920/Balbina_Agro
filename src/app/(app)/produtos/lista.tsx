"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { AbasFiltro, BotaoLote, FormPainel, ListaCadastro, Marcar, SecaoForm } from "@/components/cadastro";
import { AreaTexto, Aviso, Campo, Etiqueta, Selecao } from "@/components/ui";
import { FormMovimento, type Opcao as OpcaoEstoque, type SaldoDeposito } from "@/components/movimento-estoque";
import { ABAS_PRODUTO, TIPOS_PRODUTO_TODOS, UNIDADES, produtoNaAba, unidadeSaldo, type AbaProduto } from "@/lib/estoque";
import { centavosParaCampo, formatarMoeda, formatarNumero, formatarQuantidade } from "@/lib/formato";
import { ativarProdutosEmLote, excluirProduto, salvarProduto } from "./actions";

export type Produto = {
  id: string;
  tipo: string;
  nome: string;
  sku: string | null;
  unidade: string;
  fator_kg: number | null;
  classe_peixe_id: string | null;
  ncm: string | null;
  cfop_padrao: string | null;
  categoria_financeira_id: string | null;
  custo_medio_cents: number;
  ativo: boolean;
  base_estoque: boolean;
  para_venda: boolean;
  estoque_minimo: number | null;
  observacoes: string | null;
  fabricante?: string | null;
  proteina_pct?: number | null;
  granulometria?: string | null;
  saco_kg?: number | null;
  fase_recomendada?: string | null;
  saldo?: number | null;
  preco_venda?: number | null;
  embalagens?: { embalagem_id: string; quantidade: number }[];
};

// Cadastro separado em duas telas: produtos de venda (/produtos) e insumos de consumo da piscicultura (/insumos)
export type GrupoProduto = "venda" | "consumo";

// Linhas da ficha de embalagem no formulário (vazias ficam de fora ao salvar)
const LINHAS_FICHA = 4;

type Opcao = { id: string; nome: string };
type Categoria = Opcao & { sentido: string; parent_id: string | null };

// Dados do estoque para o painel do produto lançar entrada, saída ou ajuste
export type DadosEstoque = { depositos: OpcaoEstoque[]; saldos: SaldoDeposito[]; lotes: OpcaoEstoque[]; podeLancar: boolean };

function FichaEmbalagem({ produto, embalagens }: { produto?: Produto; embalagens: Opcao[] }) {
  const atuais = produto?.embalagens ?? [];
  return (
    <SecaoForm titulo="Embalagens usadas">
      <input type="hidden" name="ficha_embalagem" value="1" />
      <p className="text-sm text-texto-suave">
        O que vai em cada unidade vendida (ex.: caixa de 20 kg = 1 caixa de isopor + 6 kg de gelo). Ao faturar a venda,
        essas embalagens saem do estoque sozinhas.
      </p>
      {embalagens.length === 0 ? (
        <p className="text-sm text-texto-suave">Cadastre antes as embalagens como produto do tipo embalagem.</p>
      ) : (
        Array.from({ length: Math.max(LINHAS_FICHA, atuais.length + 1) }, (_, i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Selecao rotulo={`Embalagem ${i + 1}`} id={`p_emb_${i}`} name="emb_id"
              defaultValue={atuais[i]?.embalagem_id ?? ""}>
              <option value="">Nenhuma</option>
              {embalagens.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </Selecao>
            <Campo rotulo="Qtd. por unidade" id={`p_emb_qtd_${i}`} name="emb_qtd"
              inputMode="decimal" defaultValue={atuais[i] ? formatarNumero(atuais[i].quantidade) : ""} placeholder="1" />
          </div>
        ))
      )}
    </SecaoForm>
  );
}

type PropsForm = { grupo: GrupoProduto; classes: Opcao[]; categorias: Categoria[]; embalagens: Opcao[]; fases: string[]; podeEditar: boolean; podePreco: boolean };

// Ficha técnica da ração: é o que a entrada de ração, o FEFO e a previsão de compra usam
function FichaRacao({ produto, fases }: { produto?: Produto; fases: string[] }) {
  return (
    <SecaoForm titulo="Ficha técnica da ração">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Fabricante" id="p_fabricante" name="fabricante" defaultValue={produto?.fabricante ?? ""} placeholder="Ex.: Guabi, Nutripiscis" />
        <Campo rotulo="Proteína bruta (%)" id="p_pb" name="proteina_pct" inputMode="decimal"
          defaultValue={produto?.proteina_pct == null ? "" : formatarNumero(produto.proteina_pct, 1)} placeholder="Ex.: 32" />
        <Campo rotulo="Granulometria" id="p_granulo" name="granulometria" defaultValue={produto?.granulometria ?? ""} placeholder="Ex.: 4–6 mm" />
        <Campo rotulo="Peso do saco (kg)" id="p_saco" name="saco_kg" inputMode="decimal"
          defaultValue={produto?.saco_kg == null ? "" : formatarNumero(produto.saco_kg, 1)} placeholder="25" />
      </div>
      <Selecao rotulo="Fase indicada" id="p_fase" name="fase_recomendada" defaultValue={produto?.fase_recomendada ?? ""}
        ajuda="Da tabela de arraçoamento">
        <option value="">Não informada</option>
        {[...new Set([...fases, ...(produto?.fase_recomendada ? [produto.fase_recomendada] : [])])].map((f) => <option key={f} value={f}>{f}</option>)}
      </Selecao>
    </SecaoForm>
  );
}

function FormProduto({ produto, grupo, classes, categorias, embalagens, fases, podeEditar, podePreco }: PropsForm & { produto?: Produto }) {
  const [tipo, setTipo] = useState(produto?.tipo ?? (grupo === "venda" ? "outro" : "racao"));
  const [marcado, setMarcado] = useState(produto?.para_venda ?? grupo === "venda");
  const peixe = tipo === "peixe";
  // produto que guarda o estoque da classe, em kg: não vai para a venda (vende-se o kg e a caixa da classe)
  const travado = Boolean(produto?.base_estoque);
  const paraVenda = travado ? false : peixe || marcado;
  const nomeCategoria = new Map(categorias.map((c) => [c.id, c.nome]));
  // receita para o que se vende, despesa para o que se compra e consome
  const opcoesCategoria = categorias.filter((c) => c.sentido === (paraVenda ? "entrada" : "saida"));

  return (
    <FormPainel acao={salvarProduto} excluir={produto && !travado ? excluirProduto : undefined} somenteLeitura={!podeEditar}
      confirmacao={`Excluir ${produto?.nome ?? "o produto"}? Produto com movimento de estoque não pode ser excluído; desative.`}>
      {produto && <input type="hidden" name="id" value={produto.id} />}
      {travado && <Aviso tipo="info">Este é o produto que guarda o estoque de pescado da classe, em kg. Só o nome, o código e os dados fiscais mudam.</Aviso>}

      <SecaoForm titulo="Identificação">
        <Campo rotulo="Nome" id="p_nome" name="nome" defaultValue={produto?.nome} placeholder="Ex.: Ração 32% PB, Caixa de isopor 20 kg" required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Selecao rotulo="Tipo" id="p_tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={travado}>
            {Object.entries(TIPOS_PRODUTO_TODOS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
          <Campo rotulo="Código (SKU)" id="p_sku" name="sku" defaultValue={produto?.sku ?? ""} placeholder="Opcional" />
        </div>
        {travado && <input type="hidden" name="tipo" value={tipo} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Unidade" id="p_unidade" name="unidade" list="unidades-produto" defaultValue={produto?.unidade ?? "kg"}
            required readOnly={travado} ajuda="kg, cx, un, mil, l…" />
          {peixe ? (
            <Campo rotulo="kg por unidade" id="p_fator" name="fator_kg" inputMode="decimal" defaultValue={produto?.fator_kg ?? 1}
              required readOnly={travado} ajuda="kg = 1, caixa de 20 kg = 20" />
          ) : (
            <Campo rotulo="Estoque mínimo" id="p_minimo" name="estoque_minimo" inputMode="decimal"
              defaultValue={produto?.estoque_minimo ?? ""} placeholder="Avisa quando baixar" />
          )}
        </div>
        <datalist id="unidades-produto">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
        {peixe && (
          <Selecao rotulo="Classe do peixe" id="p_classe" name="classe_peixe_id" defaultValue={produto?.classe_peixe_id ?? ""} required disabled={travado}
            ajuda="O estoque é da classe, em kg: vender uma caixa de 20 kg baixa 20 kg da classe.">
            <option value="" disabled>Escolha…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
        )}
        {travado && <input type="hidden" name="classe_peixe_id" value={produto?.classe_peixe_id ?? ""} />}
      </SecaoForm>

      <SecaoForm titulo="Venda">
        {travado ? (
          <p className="text-sm text-texto-suave">Não vai para a venda: venda pelos produtos de kg e caixa desta classe.</p>
        ) : peixe ? <input type="hidden" name="para_venda" value="on" /> : (
          <Marcar rotulo="Vendo este produto" name="para_venda" checked={marcado} onChange={(e) => setMarcado(e.target.checked)}
            ajuda="Só produto de venda aparece na tabela de preços, nas vendas e nas notas. Insumo consumido na piscicultura (ração, calcário, medicamento) fica desmarcado." />
        )}
        {!travado && paraVenda && (podePreco ? (
            <Campo rotulo="Preço de venda" id="p_preco" name="preco_venda" inputMode="decimal"
              defaultValue={centavosParaCampo(produto?.preco_venda)} placeholder="0,00"
              ajuda="R$, na tabela padrão" />
          ) : (
            <p className="text-sm">Preço de venda: {produto?.preco_venda == null ? "sem preço" : formatarMoeda(produto.preco_venda)}</p>
          ))}
      </SecaoForm>

      {peixe && !travado && <FichaEmbalagem produto={produto} embalagens={embalagens} />}
      {tipo === "racao" && <FichaRacao produto={produto} fases={fases} />}

      <SecaoForm titulo="Fiscal e financeiro">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="NCM" id="p_ncm" name="ncm" inputMode="numeric" defaultValue={produto?.ncm ?? (peixe ? "0302.89.90" : "")} placeholder="0000.00.00" />
          <Campo rotulo="CFOP padrão" id="p_cfop" name="cfop_padrao" inputMode="numeric" defaultValue={produto?.cfop_padrao ?? ""} placeholder={peixe ? "5101" : "1101"} />
        </div>
        <Selecao rotulo={paraVenda ? "Categoria da venda" : "Categoria da compra"} id="p_categoria" name="categoria_financeira_id"
          defaultValue={produto?.categoria_financeira_id ?? ""}>
          <option value="">Nenhuma</option>
          {opcoesCategoria.map((c) => (
            <option key={c.id} value={c.id}>{c.parent_id ? `${nomeCategoria.get(c.parent_id) ?? ""} › ${c.nome}` : c.nome}</option>
          ))}
        </Selecao>
      </SecaoForm>

      <SecaoForm titulo="Outros">
        <AreaTexto rotulo="Observações" id="p_obs" name="observacoes" defaultValue={produto?.observacoes ?? ""} className="font-sans" />
        <Marcar rotulo="Ativo" ajuda="Inativo some das telas de lançamento, mas fica no histórico." name="ativo" defaultChecked={produto?.ativo ?? true} />
      </SecaoForm>
    </FormPainel>
  );
}

// Painel do produto: aba Cadastro (dados) e aba Estoque (lançar entrada, saída ou ajuste)
function PainelProduto({ produto, produtos, estoque, ...cadastro }: PropsForm & { produto: Produto; produtos: Produto[]; estoque: DadosEstoque }) {
  const [aba, setAba] = useState<"cadastro" | "estoque">("cadastro");
  if (!estoque.podeLancar) return <FormProduto produto={produto} {...cadastro} />;
  const itens = produtos.map((p) => ({ ...p, saldo: p.saldo ?? 0, valor_cents: null, custo_medio_cents: Number(p.custo_medio_cents) }));
  return (
    <>
      <div className="px-5 pt-3">
        <AbasFiltro rotulo="Seção do produto" valor={aba} aoMudar={setAba}
          opcoes={[{ valor: "cadastro", nome: "Dados" }, { valor: "estoque", nome: "Estoque" }]} />
      </div>
      {aba === "cadastro" ? (
        <FormProduto produto={produto} {...cadastro} />
      ) : (
        <FormMovimento produtos={itens} produtoId={produto.id} depositos={estoque.depositos} saldos={estoque.saldos} lotes={estoque.lotes} />
      )}
    </>
  );
}

// `produtos` traz todos (a ficha de embalagem e o lançamento de estoque precisam deles); a lista mostra só os do grupo.
export function ListaProdutos({ grupo, produtos, classes, categorias, fases = [], podeEditar, podePreco, estoque }: { grupo: GrupoProduto; produtos: Produto[]; classes: Opcao[]; categorias: Categoria[]; fases?: string[]; podeEditar: boolean; podePreco: boolean; estoque: DadosEstoque }) {
  const [aba, setAba] = useState<AbaProduto>("todos");
  const venda = grupo === "venda";
  // o produto que guarda o estoque da classe não se vende, mas fica junto do pescado
  const doGrupo = produtos.filter((p) => (p.para_venda || (p.tipo === "peixe" && p.base_estoque)) === venda);
  const grupos = (Object.keys(ABAS_PRODUTO) as AbaProduto[]).filter((a) => a !== "todos");
  const grupoDe = (tipo: string) => grupos.find((g) => produtoNaAba(tipo, g)) ?? "outros";
  const contagem = (a: AbaProduto) => doGrupo.filter((p) => produtoNaAba(p.tipo, a)).length;
  const visiveis = doGrupo.filter((p) => produtoNaAba(p.tipo, aba))
    .sort((a, b) => grupos.indexOf(grupoDe(a.tipo)) - grupos.indexOf(grupoDe(b.tipo)) || a.nome.localeCompare(b.nome, "pt-BR"));
  const itensEstoque = produtos.map((p) => ({ ...p, saldo: p.saldo ?? 0, valor_cents: null, custo_medio_cents: Number(p.custo_medio_cents) }));
  const porId = new Map(doGrupo.map((p) => [p.id, p]));
  const classe = new Map(classes.map((c) => [c.id, c.nome]));
  const embalagens = produtos.filter((p) => p.tipo === "embalagem" && p.ativo).map((p) => ({ id: p.id, nome: `${p.nome} (${p.unidade})` }));
  const novoTitulo = venda ? "Novo produto de venda" : "Novo insumo";
  const cadastro = { grupo, classes, categorias, embalagens, fases, podeEditar, podePreco };

  return (
    <ListaCadastro
      colunas={["Produto", "Estoque", "Custo médio", ...(venda ? ["Preço de venda"] : [])]}
      direita={["Estoque", "Custo médio", "Preço de venda"]}
      buscaPlaceholder="Buscar por nome, código ou NCM"
      vazio={`Nada neste filtro. Use “${novoTitulo}” para cadastrar.`}
      filtros={<AbasFiltro rotulo="Tipo de produto" valor={aba} aoMudar={setAba}
        opcoes={(Object.keys(ABAS_PRODUTO) as AbaProduto[]).filter((a) => a === "todos" || contagem(a) > 0).map((a) => ({
          valor: a,
          nome: <>{ABAS_PRODUTO[a].nome} <span className="tabular-nums opacity-60">{contagem(a)}</span></>,
        }))} />}
      rapidas={estoque.podeLancar ? (id) => {
        const p = porId.get(id);
        if (!p || !p.ativo) return [];
        const painel = (operacao: "entrada" | "saida", titulo: string) => ({
          titulo: `${titulo} · ${p.nome}`,
          conteudo: <FormMovimento produtos={itensEstoque} produtoId={p.id} depositos={estoque.depositos} saldos={estoque.saldos} lotes={estoque.lotes} operacaoInicial={operacao} />,
        });
        return [
          { rotulo: "Entrada", icone: <ArrowDownToLine size={14} strokeWidth={1.75} aria-hidden />, painel: painel("entrada", "Entrada") },
          { rotulo: "Saída", icone: <ArrowUpFromLine size={14} strokeWidth={1.75} aria-hidden />, painel: painel("saida", "Saída") },
        ];
      } : undefined}
      emLote={podeEditar ? {
        nome: venda ? ["produto", "produtos"] : ["insumo", "insumos"],
        acoes: (ids, concluir) => {
          const marcados = ids.map((id) => porId.get(id)).filter((p) => p !== undefined);
          const ativos = marcados.filter((p) => p.ativo).length;
          const inativos = marcados.length - ativos;
          const qtd = (n: number) => (n === 1 ? (venda ? "1 produto" : "1 insumo") : `${n} ${venda ? "produtos" : "insumos"}`);
          return (
            <>
              <BotaoLote acao={ativarProdutosEmLote} campos={{ acao: "ativar", ids }} rotulo="Ativar" variante="primario" oculto={inativos === 0}
                confirmar={`Ativar ${qtd(inativos)}?`} aoConcluir={concluir} />
              <BotaoLote acao={ativarProdutosEmLote} campos={{ acao: "desativar", ids }} rotulo="Desativar" variante="perigo" oculto={ativos === 0}
                confirmar={`Desativar ${qtd(ativos)}? Somem das vendas e lançamentos; o histórico fica.`} aoConcluir={concluir} />
            </>
          );
        },
      } : undefined}
      rotuloNovo={novoTitulo}
      novo={podeEditar ? { titulo: novoTitulo, conteudo: <FormProduto {...cadastro} podeEditar /> } : null}
      editar={(id) => {
        const p = porId.get(id);
        return p ? { titulo: p.nome, conteudo: <PainelProduto produto={p} produtos={produtos} estoque={estoque} {...cadastro} /> } : null;
      }}
      linhas={visiveis.map((p) => {
        const baixo = p.estoque_minimo !== null && p.saldo !== null && p.saldo !== undefined && p.saldo < Number(p.estoque_minimo);
        return {
          id: p.id,
          busca: [p.nome, p.sku, p.ncm, TIPOS_PRODUTO_TODOS[p.tipo]].filter(Boolean).join(" "),
          inativa: !p.ativo,
          rotulo: p.nome,
          // o produto que guarda o estoque da classe de peixe fica sempre ativo
          selecionavel: !p.base_estoque,
          secao: ABAS_PRODUTO[grupoDe(p.tipo)].nome,
          ordem: [p.nome, p.saldo ?? null, Number(p.custo_medio_cents) || null, ...(venda ? [p.preco_venda ?? null] : [])],
          celulas: [
            <span key="n" className="flex flex-col">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-texto">{p.nome}</span>
                {!p.ativo && <Etiqueta>Inativo</Etiqueta>}
                {baixo && <Etiqueta tom="alerta">Repor</Etiqueta>}
              </span>
              <span className="text-xs text-texto-suave">
                {[TIPOS_PRODUTO_TODOS[p.tipo] ?? p.tipo, p.unidade, p.sku, p.classe_peixe_id && `classe ${classe.get(p.classe_peixe_id) ?? ""}`,
                  p.fator_kg && p.tipo === "peixe" && Number(p.fator_kg) > 1 && `${formatarNumero(p.fator_kg)} kg`].filter(Boolean).join(" · ")}
              </span>
            </span>,
            <span key="e" className={baixo || Number(p.saldo) < 0 ? "font-medium text-perigo" : ""} title={baixo ? `Abaixo do mínimo de ${formatarQuantidade(p.estoque_minimo)}` : undefined}>
              {formatarQuantidade(p.tipo === "peixe" && p.base_estoque ? p.saldo ?? 0 : Math.round((p.saldo ?? 0) * 100) / 100)} {unidadeSaldo(p)}
            </span>,
            Number(p.custo_medio_cents) > 0 ? formatarMoeda(Math.round(Number(p.custo_medio_cents))) : <span key="c" className="text-texto-suave">–</span>,
            ...(venda ? [p.preco_venda != null ? formatarMoeda(p.preco_venda)
              : !p.base_estoque ? <span key="v" className="text-alerta">sem preço</span> : <span key="v" className="text-texto-suave">–</span>] : []),
          ],
        };
      })}
    />
  );
}
