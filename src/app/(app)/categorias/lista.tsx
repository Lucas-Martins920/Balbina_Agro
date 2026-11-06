"use client";

import { useState, useTransition } from "react";
import { ArrowUpDown, ListTree, Lock } from "lucide-react";
import { AbasFiltro, FormPainel, ListaCadastro, Marcar, SecaoForm } from "@/components/cadastro";
import { ArvoreOrdenavel } from "@/components/ordenar";
import { Aviso, Botao, Campo, Etiqueta, Selecao } from "@/components/ui";
import { compararOrdem } from "@/lib/ordem";
import { COMPONENTES_CUSTO, GRUPOS_CATEGORIA } from "@/lib/titulos";
import { aplicarPlanoPadrao, excluirCategoria, reordenarCategorias, salvarCategoria } from "./actions";

export type Categoria = {
  id: string;
  nome: string;
  grupo: string;
  sentido: string;
  parent_id: string | null;
  ordem: number;
  codigo: string | null;
  componente_custo: string | null;
  sistema: boolean;
  ativa: boolean;
};

type Filtro = "todas" | "entrada" | "saida";

function FormCategoria({ categoria, categorias, podeEditar }: { categoria?: Categoria; categorias: Categoria[]; podeEditar: boolean }) {
  const [pai, setPai] = useState(categoria?.parent_id ?? "");
  const [grupo, setGrupo] = useState(categoria?.grupo ?? "despesa_operacional");
  const temFilhas = Boolean(categoria && categorias.some((c) => c.parent_id === categoria.id));
  const sistema = Boolean(categoria?.sistema);
  const categoriaPai = categorias.find((c) => c.id === pai);
  // Só categorias principais podem receber subcategorias; quem tem filhas não pode virar subcategoria.
  const opcoesPai = categorias.filter((c) => !c.parent_id && c.id !== categoria?.id && (c.ativa || c.id === categoria?.parent_id));

  return (
    <FormPainel acao={salvarCategoria} excluir={categoria && !sistema ? excluirCategoria : undefined} somenteLeitura={!podeEditar}
      confirmacao={`Excluir ${categoria?.nome ?? "a categoria"}? Se já tiver lançamentos, desative em vez de excluir.`}>
      {categoria && <input type="hidden" name="id" value={categoria.id} />}
      {sistema && <Aviso tipo="info">Categoria usada pelo sistema no faturamento das vendas. Só o código pode mudar.</Aviso>}

      <SecaoForm titulo="Categoria">
        <Campo rotulo="Nome" id="c_nome" name="nome" defaultValue={categoria?.nome} placeholder="Ex.: Combustível" required readOnly={sistema} />
        <Selecao rotulo="Dentro de" id="c_pai" name="parent_id" value={pai} onChange={(e) => setPai(e.target.value)} disabled={temFilhas || sistema}
          ajuda={temFilhas ? "tem subcategorias" : undefined}>
          <option value="">Nenhuma (categoria principal)</option>
          {opcoesPai.map((c) => <option key={c.id} value={c.id}>{c.nome} · {c.sentido === "entrada" ? "entrada" : "saída"}</option>)}
        </Selecao>
        {categoriaPai ? (
          <p className="text-xs text-texto-suave">
            Fica em {GRUPOS_CATEGORIA[categoriaPai.grupo]}, como {categoriaPai.sentido === "entrada" ? "entrada" : "saída"}, igual à categoria principal.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Selecao rotulo="Grupo do DRE" id="c_grupo" name="grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)} disabled={sistema}>
              {Object.entries(GRUPOS_CATEGORIA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </Selecao>
            <Selecao rotulo="Sentido" id="c_sentido" name="sentido" defaultValue={categoria?.sentido ?? (grupo === "receita_operacional" ? "entrada" : "saida")}
              key={grupo} disabled={sistema}>
              <option value="saida">Saída (despesa)</option>
              <option value="entrada">Entrada (receita)</option>
            </Selecao>
          </div>
        )}
        {(temFilhas || sistema) && pai && <input type="hidden" name="parent_id" value={pai} />}
        {sistema && (
          <>
            <input type="hidden" name="grupo" value={grupo} />
            <input type="hidden" name="sentido" value={categoria?.sentido} />
          </>
        )}
      </SecaoForm>

      <SecaoForm titulo="Detalhes">
        <Campo rotulo="Código" id="c_codigo" name="codigo" defaultValue={categoria?.codigo ?? ""} placeholder="Ex.: 4.1.02" ajuda="para exportar ao contador" />
        {!categoriaPai && grupo === "custo_operacional" && (
          <Selecao rotulo="No custo do kg entra como" id="c_componente" name="componente_custo" defaultValue={categoria?.componente_custo ?? "outros"}>
            {Object.entries(COMPONENTES_CUSTO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
        )}
        {categoriaPai?.grupo === "custo_operacional" && (
          <Selecao rotulo="No custo do kg entra como" id="c_componente" name="componente_custo" key={categoriaPai.id}
            defaultValue={categoria?.parent_id === categoriaPai.id ? categoria?.componente_custo ?? "" : ""}>
            <option value="">Igual a {categoriaPai.nome} ({COMPONENTES_CUSTO[categoriaPai.componente_custo ?? "outros"]})</option>
            {Object.entries(COMPONENTES_CUSTO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
        )}
        {!sistema && <Marcar rotulo="Ativa" ajuda="Inativa some das telas de lançamento, mas os lançamentos antigos continuam nela." name="ativa" defaultChecked={categoria?.ativa ?? true} />}
        {sistema && <input type="hidden" name="ativa" value="on" />}
      </SecaoForm>
    </FormPainel>
  );
}

export function ListaCategorias({ categorias, podeEditar }: { categorias: Categoria[]; podeEditar: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [ordenando, setOrdenando] = useState(false);
  const [aplicando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<{ tipo: "erro" | "sucesso"; texto: string } | null>(null);
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const filhas = (id: string) => categorias.filter((c) => c.parent_id === id).sort(compararOrdem);

  if (ordenando) {
    return (
      <ArvoreOrdenavel
        itens={categorias}
        secoes={Object.entries(GRUPOS_CATEGORIA).map(([chave, nome]) => ({ chave, nome }))}
        secaoDe={(c) => c.grupo}
        salvar={reordenarCategorias}
        aoConcluir={() => setOrdenando(false)}
        dica="Arraste pela alça para mudar a ordem. A categoria principal leva as subcategorias junto; para trocar de grupo, edite a categoria."
        render={(c) => (
          <>
            <span className={`truncate ${c.parent_id ? "" : "font-medium"} ${c.ativa ? "" : "text-texto-suave"}`}>{c.nome}</span>
            {c.sistema && <Lock size={13} strokeWidth={1.75} aria-label="usada pelo sistema" className="shrink-0 text-texto-suave" />}
            {!c.ativa && <Etiqueta className="ml-auto">Inativa</Etiqueta>}
          </>
        )}
      />
    );
  }

  // Árvore: grupo do DRE > categoria principal > subcategorias, na ordem escolhida
  const ordenadas: { c: Categoria; nivel: number }[] = [];
  for (const g of Object.keys(GRUPOS_CATEGORIA)) {
    for (const raiz of categorias.filter((c) => !c.parent_id && c.grupo === g).sort(compararOrdem)) {
      if (filtro !== "todas" && raiz.sentido !== filtro) continue;
      ordenadas.push({ c: raiz, nivel: 0 });
      for (const f of filhas(raiz.id)) ordenadas.push({ c: f, nivel: 1 });
    }
  }

  function aplicarPlano() {
    if (!confirm("Deixar só as categorias padrão da piscicultura de engorda?\n\n"
      + "As categorias que não são do plano padrão serão APAGADAS. As que já têm lançamentos não podem sumir: "
      + "ficam desativadas (fora das listas), com o histórico e o DRE como estão. Não dá para desfazer.")) return;
    setResultado(null);
    iniciar(async () => {
      const r = await aplicarPlanoPadrao();
      setResultado(r.erro ? { tipo: "erro", texto: r.erro } : { tipo: "sucesso", texto: r.mensagem ?? "Plano aplicado." });
    });
  }

  return (
    <div className="flex flex-col gap-4">
    {resultado && <Aviso tipo={resultado.tipo}>{resultado.texto}</Aviso>}
    <ListaCadastro
      colunas={["Categoria", "Sentido", "Custo do kg", "Código"]}
      buscaPlaceholder="Buscar categoria ou código"
      vazio="Nenhuma categoria neste filtro."
      filtros={<>
        <AbasFiltro rotulo="Sentido" valor={filtro} aoMudar={setFiltro}
          opcoes={[
            { valor: "todas", nome: <>Todas <span className="tabular-nums opacity-60">{categorias.length}</span></> },
            { valor: "entrada", nome: <>Entradas <span className="tabular-nums opacity-60">{categorias.filter((c) => c.sentido === "entrada").length}</span></> },
            { valor: "saida", nome: <>Saídas <span className="tabular-nums opacity-60">{categorias.filter((c) => c.sentido === "saida").length}</span></> },
          ]} />
        {podeEditar && categorias.length > 1 && (
          <Botao type="button" variante="secundario" tamanho="sm" onClick={() => setOrdenando(true)}>
            <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden /> Reordenar
          </Botao>
        )}
        {podeEditar && (
          <Botao type="button" variante="secundario" tamanho="sm" onClick={aplicarPlano} disabled={aplicando}
            title="Deixa só as categorias padrão da piscicultura de engorda (apaga as outras)">
            <ListTree size={16} strokeWidth={1.75} aria-hidden /> {aplicando ? "Aplicando..." : "Categorias padrão"}
          </Botao>
        )}
      </>}
      rotuloNovo="Nova categoria"
      novo={podeEditar ? { titulo: "Nova categoria", conteudo: <FormCategoria categorias={categorias} podeEditar /> } : null}
      editar={(id) => {
        const c = porId.get(id);
        return c ? { titulo: c.nome, conteudo: <FormCategoria categoria={c} categorias={categorias} podeEditar={podeEditar} /> } : null;
      }}
      linhas={ordenadas.map(({ c, nivel }) => {
        const pai = c.parent_id ? porId.get(c.parent_id) : undefined;
        const componente = c.componente_custo ?? pai?.componente_custo;
        return {
          id: c.id,
          secao: GRUPOS_CATEGORIA[c.grupo],
          busca: [c.nome, c.codigo, pai?.nome].filter(Boolean).join(" "),
          inativa: !c.ativa,
          celulas: [
            <span key="n" className={`flex items-center gap-1.5 ${nivel ? "pl-5" : "font-medium text-texto"}`}>
              {nivel > 0 && <span aria-hidden className="text-texto-suave/60">└</span>}
              {c.nome}
              {c.sistema && <Lock size={13} strokeWidth={1.75} aria-label="usada pelo sistema" className="text-texto-suave" />}
              {!c.ativa && <Etiqueta>Inativa</Etiqueta>}
            </span>,
            c.sentido === "entrada" ? <Etiqueta key="s" tom="positivo">Entrada</Etiqueta> : <Etiqueta key="s">Saída</Etiqueta>,
            c.grupo === "custo_operacional" ? COMPONENTES_CUSTO[componente ?? "outros"] : <span key="x" className="text-texto-suave">–</span>,
            c.codigo ?? <span key="cd" className="text-texto-suave">–</span>,
          ],
        };
      })}
    />
    </div>
  );
}
