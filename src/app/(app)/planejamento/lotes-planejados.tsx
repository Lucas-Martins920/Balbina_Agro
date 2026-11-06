"use client";

import { FormPainel, ListaCadastro, SecaoForm } from "@/components/cadastro";
import { AreaTexto, Campo, Etiqueta, Selecao } from "@/components/ui";
import { formatarData, formatarInteiro } from "@/lib/formato";
import { excluirLotePlanejado, salvarLotePlanejado } from "./actions";

export type LinhaPlano = {
  id: string; codigo: string; origem: "planejado" | "sugerido"; situacao: string; data: string; peixes: number;
  especieId: string | null; alevinagem: string | null; recria: string | null; engorda: string | null;
  inicioEngorda: string; despesca: string; observacoes: string | null; conflito: boolean;
  alevinagemPrevisto: string | null; engordaPrevista: string | null;
};

type Opcao = { id: string; nome: string; finalidade?: string };

const SITUACOES: Record<string, string> = { planejado: "Planejado", confirmado: "Confirmado (alevinos encomendados)", povoado: "Já povoado", cancelado: "Cancelado" };

function FormPlano({ linha, especies, viveiros, podeEditar, codigoSugerido }: {
  linha?: LinhaPlano; especies: Opcao[]; viveiros: Opcao[]; podeEditar: boolean; codigoSugerido: string;
}) {
  const sugestao = linha?.origem === "sugerido";
  const deTipo = (tipos: string[]) => viveiros.filter((g) => tipos.includes(g.finalidade ?? ""));
  return (
    <FormPainel acao={salvarLotePlanejado} excluir={linha && !sugestao ? excluirLotePlanejado : undefined} somenteLeitura={!podeEditar}
      botao={sugestao ? "Incluir no plano" : "Salvar"} confirmacao={`Tirar o lote ${linha?.codigo ?? ""} do plano?`}>
      {linha && !sugestao && <input type="hidden" name="id" value={linha.id} />}
      {sugestao && (
        <p className="rounded-xl bg-elevado/60 px-3.5 py-2.5 text-sm">
          Esta é a próxima data em que os viveiros de cada fase (alevinagem, recria e engorda) estarão livres, contando o vazio sanitário.
          Ajuste o que quiser e inclua no plano.
        </p>
      )}
      <SecaoForm titulo="Lote">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Código" id="lp_codigo" name="codigo" defaultValue={sugestao ? codigoSugerido : linha?.codigo ?? codigoSugerido} required />
          <Campo rotulo="Povoamento dos alevinos" id="lp_data" name="data_povoamento" type="date" defaultValue={linha?.data} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Alevinos (peixes)" id="lp_qtd" name="qtd_peixes" inputMode="numeric" defaultValue={linha?.peixes ?? ""} required />
          <Selecao rotulo="Espécie" id="lp_especie" name="especie_id" defaultValue={linha?.especieId ?? ""}>
            <option value="">A padrão do planejamento</option>
            {especies.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </Selecao>
        </div>
        {!sugestao && (
          <Selecao rotulo="Situação" id="lp_sit" name="situacao" defaultValue={linha?.situacao ?? "planejado"}>
            {Object.entries(SITUACOES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
        )}
      </SecaoForm>
      <SecaoForm titulo="Viveiros">
        <Selecao rotulo="Alevinagem" id="lp_pint" name="viveiro_alevinagem_id" defaultValue={linha?.alevinagem ?? ""}>
          <option value="">Automático (o primeiro livre)</option>
          {deTipo(["alevinagem", "alevinagem_recria"]).map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </Selecao>
        {deTipo(["alevinagem", "alevinagem_recria"]).length === 0 && (
          <p className="text-xs text-texto-suave">
            Nenhum viveiro está marcado como alevinagem. Em Piscicultura, abra o viveiro e mude a finalidade para Alevinagem, ou deixe a
            alevinagem com 0 semanas nos parâmetros se o lote chega como juvenil.
          </p>
        )}
        <Selecao rotulo="Recria" id="lp_recria" name="viveiro_recria_id" defaultValue={linha?.recria ?? ""}>
          <option value="">Automático</option>
          {deTipo(["recria", "alevinagem_recria"]).map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </Selecao>
        <Selecao rotulo="Viveiro de engorda" id="lp_post" name="viveiro_engorda_id" defaultValue={linha?.engorda ?? ""}>
          <option value="">Automático</option>
          {deTipo(["engorda"]).map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </Selecao>
      </SecaoForm>
      <AreaTexto rotulo="Observações" id="lp_obs" name="observacoes" defaultValue={linha?.observacoes ?? ""} className="font-sans" />
    </FormPainel>
  );
}

export function LotesPlanejados({ linhas, especies, viveiros, podeEditar, codigoSugerido }: {
  linhas: LinhaPlano[]; especies: Opcao[]; viveiros: Opcao[]; podeEditar: boolean; codigoSugerido: string;
}) {
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const nome = new Map(viveiros.map((g) => [g.id, g.nome]));
  return (
    <ListaCadastro
      colunas={["Lote", "Povoamento", "Alevinos", "Viveiro de engorda", "Engorda a partir de", "Despesca", "Situação"]}
      direita={["Alevinos"]}
      buscaPlaceholder="Buscar lote"
      vazio="Nenhum lote planejado. Cadastre os viveiros de alevinagem, recria e engorda para o sistema sugerir datas."
      rotuloNovo="Planejar lote"
      novo={podeEditar ? { titulo: "Planejar lote", conteudo: <FormPlano especies={especies} viveiros={viveiros} podeEditar codigoSugerido={codigoSugerido} /> } : null}
      editar={(id) => {
        const l = porId.get(id);
        if (!l) return null;
        return { titulo: l.origem === "sugerido" ? `${l.codigo}: incluir no plano` : `Lote planejado ${l.codigo}`, conteudo: <FormPlano linha={l} especies={especies} viveiros={viveiros} podeEditar={podeEditar} codigoSugerido={codigoSugerido} /> };
      }}
      linhas={linhas.map((l) => ({
        id: l.id,
        busca: l.codigo,
        inativa: l.situacao === "cancelado" || l.situacao === "povoado",
        celulas: [
          <span key="c" className="font-medium text-texto">{l.codigo}</span>,
          formatarData(l.data),
          formatarInteiro(l.peixes),
          (l.engordaPrevista && nome.get(l.engordaPrevista)?.replace(" (Engorda)", "")) ?? <span key="g" className="text-texto-suave">sem vaga</span>,
          formatarData(l.inicioEngorda),
          formatarData(l.despesca),
          l.origem === "sugerido" ? <Etiqueta key="s" tom="info">Sugestão</Etiqueta>
            : l.conflito ? <Etiqueta key="s" tom="perigo">Conflito</Etiqueta>
            : <Etiqueta key="s" tom={l.situacao === "confirmado" ? "positivo" : "neutro"}>{SITUACOES[l.situacao]?.split(" (")[0] ?? l.situacao}</Etiqueta>,
        ],
      }))}
    />
  );
}
