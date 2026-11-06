"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowUpDown, ListTree } from "lucide-react";
import { FormPainel, ListaCadastro, Marcar, SecaoForm } from "@/components/cadastro";
import { ArvoreOrdenavel } from "@/components/ordenar";
import { Aviso, Botao, Campo, CLASSE_BOTAO_TEXTO, Etiqueta, Selecao } from "@/components/ui";
import { ordenarArvore } from "@/lib/ordem";
import { aplicarCentrosPadrao, excluirCentroCusto, reordenarCentrosCusto, salvarCentroCusto } from "./actions";

export type Centro = { id: string; nome: string; tipo: string; parent_id: string | null; ordem: number; ativo: boolean };

const TIPOS: Record<string, string> = {
  geral: "Geral", fabrica_racao: "Fábrica de ração", comercial: "Comercial", administrativo: "Administrativo",
  setor: "Setor", viveiro: "Viveiro", lote: "Lote",
};
const MANUAIS = ["geral", "fabrica_racao", "comercial", "administrativo"];
const ONDE_EDITAR: Record<string, { href: string; nome: string }> = {
  setor: { href: "/piscicultura", nome: "Piscicultura" }, viveiro: { href: "/piscicultura", nome: "Piscicultura" }, lote: { href: "/lotes", nome: "Lotes" },
};

function descendentes(id: string, centros: Centro[]): Set<string> {
  const saida = new Set<string>([id]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const c of centros) if (c.parent_id && saida.has(c.parent_id) && !saida.has(c.id)) { saida.add(c.id); mudou = true; }
  }
  return saida;
}

function FormCentro({ centro, centros, podeEditar }: { centro?: Centro; centros: Centro[]; podeEditar: boolean }) {
  const automatico = Boolean(centro && !MANUAIS.includes(centro.tipo));
  const proibidos = centro ? descendentes(centro.id, centros) : new Set<string>();
  const opcoesPai = centros.filter((c) => !proibidos.has(c.id) && (c.ativo || c.id === centro?.parent_id));

  return (
    <FormPainel acao={salvarCentroCusto} excluir={centro && !automatico ? excluirCentroCusto : undefined} somenteLeitura={!podeEditar || automatico}
      confirmacao={`Excluir ${centro?.nome ?? "o centro de custo"}? Se já tiver lançamentos, desative em vez de excluir.`}>
      {centro && <input type="hidden" name="id" value={centro.id} />}
      {automatico && centro && (
        <Aviso tipo="info">
          Criado automaticamente. O nome acompanha o cadastro em{" "}
          <Link href={ONDE_EDITAR[centro.tipo].href} className={CLASSE_BOTAO_TEXTO}>{ONDE_EDITAR[centro.tipo].nome}</Link>.
        </Aviso>
      )}
      <SecaoForm titulo="Centro de custo">
        <Campo rotulo="Nome" id="cc_nome" name="nome" defaultValue={centro?.nome} placeholder="Ex.: Entregas, Escritório" required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Selecao rotulo="Tipo" id="cc_tipo" name="tipo" defaultValue={centro?.tipo ?? "geral"}>
            {(automatico ? Object.keys(TIPOS) : MANUAIS).map((t) => <option key={t} value={t}>{TIPOS[t]}</option>)}
          </Selecao>
          <Selecao rotulo="Dentro de" id="cc_pai" name="parent_id" defaultValue={centro?.parent_id ?? ""}>
            <option value="">Nenhum</option>
            {opcoesPai.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
        </div>
        <Marcar rotulo="Ativo" ajuda="Inativo some das telas de lançamento." name="ativo" defaultChecked={centro?.ativo ?? true} />
      </SecaoForm>
    </FormPainel>
  );
}

export function ListaCentros({ centros, podeEditar }: { centros: Centro[]; podeEditar: boolean }) {
  const [ordenando, setOrdenando] = useState(false);
  const [aplicando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<{ tipo: "erro" | "sucesso"; texto: string } | null>(null);
  const porId = new Map(centros.map((c) => [c.id, c]));
  const ordenados = ordenarArvore(centros).map(({ item, nivel }) => ({ c: item, nivel }));

  if (ordenando) {
    return (
      <ArvoreOrdenavel
        itens={centros}
        salvar={reordenarCentrosCusto}
        aoConcluir={() => setOrdenando(false)}
        dica="Arraste pela alça para mudar a ordem. Um centro leva junto os que estão dentro dele; para mudar de pai, edite o centro."
        render={(c) => (
          <>
            <span className={`truncate ${c.parent_id ? "" : "font-medium"} ${c.ativo ? "" : "text-texto-suave"}`}>{c.nome}</span>
            <span className="shrink-0 text-xs text-texto-suave">{TIPOS[c.tipo] ?? c.tipo}</span>
            {!c.ativo && <Etiqueta className="ml-auto">Inativo</Etiqueta>}
          </>
        )}
      />
    );
  }

  function aplicarPadrao() {
    if (!confirm("Deixar só os centros de custo padrão da piscicultura de engorda?\n\n"
      + "Os centros de setores, viveiros e lotes ficam. Os outros que não são padrão serão APAGADOS; os que já têm "
      + "lançamentos ficam desativados (fora das listas), com o histórico como está. Não dá para desfazer.")) return;
    setResultado(null);
    iniciar(async () => {
      const r = await aplicarCentrosPadrao();
      setResultado(r.erro ? { tipo: "erro", texto: r.erro } : { tipo: "sucesso", texto: r.mensagem ?? "Centros padrão aplicados." });
    });
  }

  return (
    <div className="flex flex-col gap-4">
    {resultado && <Aviso tipo={resultado.tipo}>{resultado.texto}</Aviso>}
    <ListaCadastro
      colunas={["Centro de custo", "Tipo"]}
      buscaPlaceholder="Buscar centro de custo"
      vazio="Nenhum centro de custo ainda."
      rotuloNovo="Novo centro de custo"
      filtros={podeEditar ? (<>
        {centros.length > 1 && (
          <Botao type="button" variante="secundario" tamanho="sm" onClick={() => setOrdenando(true)}>
            <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden /> Reordenar
          </Botao>
        )}
        <Botao type="button" variante="secundario" tamanho="sm" onClick={aplicarPadrao} disabled={aplicando}
          title="Deixa só os centros de custo padrão da piscicultura de engorda (apaga os outros)">
          <ListTree size={16} strokeWidth={1.75} aria-hidden /> {aplicando ? "Aplicando..." : "Centros padrão"}
        </Botao>
      </>) : undefined}
      novo={podeEditar ? { titulo: "Novo centro de custo", conteudo: <FormCentro centros={centros} podeEditar /> } : null}
      editar={(id) => {
        const c = porId.get(id);
        return c ? { titulo: c.nome, conteudo: <FormCentro centro={c} centros={centros} podeEditar={podeEditar} /> } : null;
      }}
      linhas={ordenados.map(({ c, nivel }) => ({
        id: c.id,
        busca: `${c.nome} ${TIPOS[c.tipo] ?? ""}`,
        inativa: !c.ativo,
        celulas: [
          <span key="n" className={`flex items-center gap-1.5 ${nivel === 0 ? "font-medium text-texto" : ""}`} style={{ paddingLeft: `${nivel * 1.25}rem` }}>
            {nivel > 0 && <span aria-hidden className="text-texto-suave/60">└</span>}
            {c.nome}
            {!c.ativo && <Etiqueta>Inativo</Etiqueta>}
          </span>,
          TIPOS[c.tipo] ?? c.tipo,
        ],
      }))}
    />
    </div>
  );
}
