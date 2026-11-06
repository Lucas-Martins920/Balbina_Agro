"use client";

import { useState } from "react";
import { AbasFiltro, FormPainel, ListaCadastro, Marcar, SecaoForm } from "@/components/cadastro";
import { Campo, Etiqueta, Selecao } from "@/components/ui";
import { formatarInteiro, formatarNumero } from "@/lib/formato";
import { faixaClasse } from "@/lib/pescado";
import { FINALIDADES_VIVEIRO as FINALIDADES, SISTEMAS_VIVEIRO as SISTEMAS } from "@/lib/rotulos";
import { excluirViveiro, excluirSetor, salvarClasse, salvarViveiro, salvarSetor } from "./actions";

export type Setor = { id: string; nome: string; licenca_ambiental: string | null; endereco: { logradouro?: string; cidade?: string; uf?: string } | null; ativo: boolean };
export type Viveiro = {
  id: string; nome: string; setor_id: string; finalidade: string; sistema: string; capacidade_peixes: number;
  area_m2: number | string | null; volume_m3: number | string | null; profundidade_m: number | string | null;
  aeracao: boolean; ativo: boolean; lote?: string | null;
};
export type Classe = {
  id: string; nome: string; peso_min_g: number | string | null; peso_max_g: number | string | null;
  comercializavel: boolean; ordem: number; sem_classificacao: boolean;
};

type Aba = "viveiros" | "setores" | "classes";

// Tanque-rede e tanques de alvenaria/lona se medem em m³ (kg/m³); viveiro escavado e barragem em m² (peixes/m²)
const MEDE_VOLUME = new Set(["tanque_rede", "alvenaria", "lona"]);

// Valor do banco no campo do formulário: 1200 -> "1200"; 1.35 -> "1,35"
function campoNumero(v: number | string | null | undefined) {
  return v === null || v === undefined || v === "" ? "" : String(Number(v)).replace(".", ",");
}

function tamanho(g: Viveiro) {
  const area = Number(g.area_m2) || null, volume = Number(g.volume_m3) || null;
  const m2 = area ? `${formatarNumero(area, 0)} m²` : null, m3 = volume ? `${formatarNumero(volume, 1)} m³` : null;
  return (MEDE_VOLUME.has(g.sistema) ? m3 ?? m2 : m2 ?? m3) ?? null;
}

function FormSetor({ setor, podeEditar }: { setor?: Setor; podeEditar: boolean }) {
  const e = setor?.endereco ?? {};
  return (
    <FormPainel acao={salvarSetor} excluir={setor ? excluirSetor : undefined} somenteLeitura={!podeEditar}
      confirmacao={`Excluir o setor ${setor?.nome ?? ""}? Só dá para excluir setor sem viveiros.`}>
      {setor && <input type="hidden" name="id" value={setor.id} />}
      <SecaoForm titulo="Setor">
        <Campo rotulo="Nome" id="n_nome" name="nome" defaultValue={setor?.nome} placeholder="Ex.: Sede, Setor 2" required />
        <Campo rotulo="Licença ambiental" id="n_licenca" name="licenca_ambiental" defaultValue={setor?.licenca_ambiental ?? ""}
          placeholder="Número da licença de operação (LO) ou da outorga de água" />
      </SecaoForm>
      <SecaoForm titulo="Localização">
        <Campo rotulo="Endereço" id="n_end" name="logradouro" defaultValue={e.logradouro ?? ""} placeholder="Estrada, ramal ou comunidade" />
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-3"><Campo rotulo="Cidade" id="n_cidade" name="cidade" defaultValue={e.cidade ?? ""} /></div>
          <Campo rotulo="UF" id="n_uf" name="uf" maxLength={2} defaultValue={e.uf ?? ""} className="uppercase" />
        </div>
        <Marcar rotulo="Ativo" name="ativo" defaultChecked={setor?.ativo ?? true} />
      </SecaoForm>
      <p className="text-xs text-texto-suave">O centro de custo do setor e dos viveiros dele acompanha o nome.</p>
    </FormPainel>
  );
}

function FormViveiro({ viveiro, setores, podeEditar }: { viveiro?: Viveiro; setores: Setor[]; podeEditar: boolean }) {
  return (
    <FormPainel acao={salvarViveiro} excluir={viveiro ? excluirViveiro : undefined} somenteLeitura={!podeEditar}
      confirmacao={`Excluir o viveiro ${viveiro?.nome ?? ""}? Viveiro que já teve lote não pode ser excluído; desative.`}>
      {viveiro && <input type="hidden" name="id" value={viveiro.id} />}
      <SecaoForm titulo="Viveiro">
        <div className="grid gap-3 sm:grid-cols-2">
          <Selecao rotulo="Setor" id="g_setor" name="setor_id" defaultValue={viveiro?.setor_id ?? setores[0]?.id} required>
            {setores.filter((n) => n.ativo || n.id === viveiro?.setor_id).map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
          </Selecao>
          <Campo rotulo="Nome" id="g_nome" name="nome" defaultValue={viveiro?.nome} placeholder="Ex.: V1, Tanque 3" required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Selecao rotulo="Finalidade" id="g_fin" name="finalidade" defaultValue={viveiro?.finalidade ?? ""} required
            ajuda="Alevinagem recebe os alevinos, recria leva o juvenil até a engorda e engorda leva o peixe ao peso de despesca. O lote povoado entra na fase do viveiro.">
            <option value="" disabled>Escolha…</option>
            {Object.entries(FINALIDADES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
          <Selecao rotulo="Sistema" id="g_sis" name="sistema" defaultValue={viveiro?.sistema ?? "escavado"}>
            {Object.entries(SISTEMAS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
        </div>
        <Campo rotulo="Capacidade (peixes)" id="g_cap" name="capacidade_peixes" inputMode="numeric" defaultValue={viveiro?.capacidade_peixes ?? ""} required
          ajuda="Quantos peixes o viveiro comporta na fase dele. O sistema não deixa povoar ou transferir acima disso." />
      </SecaoForm>
      <SecaoForm titulo="Medidas">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Área (m²)" id="g_area" name="area_m2" inputMode="decimal" defaultValue={campoNumero(viveiro?.area_m2)}
            ajuda="Lâmina d'água. Dá a densidade em peixes/m²." />
          <Campo rotulo="Volume (m³)" id="g_vol" name="volume_m3" inputMode="decimal" defaultValue={campoNumero(viveiro?.volume_m3)}
            ajuda="Volume útil. Dá a densidade em kg/m³ (tanque-rede)." />
          <Campo rotulo="Profundidade (m)" id="g_prof" name="profundidade_m" inputMode="decimal" defaultValue={campoNumero(viveiro?.profundidade_m)}
            ajuda="Profundidade média da água." />
        </div>
        <Marcar rotulo="Aeração" ajuda="Tem aerador, soprador ou chafariz para segurar o oxigênio de madrugada." name="aeracao" defaultChecked={viveiro?.aeracao ?? false} />
        <Marcar rotulo="Ativo" ajuda="Inativo não aparece para povoar lote." name="ativo" defaultChecked={viveiro?.ativo ?? true} />
      </SecaoForm>
    </FormPainel>
  );
}

function FormClasse({ classe, podeEditar, proximaOrdem }: { classe?: Classe; podeEditar: boolean; proximaOrdem: number }) {
  return (
    <FormPainel acao={salvarClasse} somenteLeitura={!podeEditar}>
      {classe && <input type="hidden" name="id" value={classe.id} />}
      <SecaoForm titulo="Classe">
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-3">
            <Campo rotulo="Nome" id="c_nome" name="nome" defaultValue={classe?.nome} placeholder="Ex.: Grande" required
              ajuda="Só o tamanho: o produto vira Peixe grande (kg) e Caixa 20 kg · peixe grande." />
          </div>
          <Campo rotulo="Ordem" id="c_ordem" name="ordem" inputMode="numeric" defaultValue={classe?.ordem ?? proximaOrdem} />
        </div>
        {classe?.sem_classificacao ? (
          <p className="text-sm text-texto-suave">Recebe a despesca sem separação por tamanho, então não tem faixa de peso.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Peso mínimo (g)" id="c_min" name="peso_min_g" inputMode="decimal" defaultValue={campoNumero(classe?.peso_min_g)}
              ajuda="Em branco: sem mínimo." />
            <Campo rotulo="Peso máximo (g)" id="c_max" name="peso_max_g" inputMode="decimal" defaultValue={campoNumero(classe?.peso_max_g)}
              ajuda="Em branco: sem máximo." />
          </div>
        )}
        <Marcar rotulo="Comercializável" ajuda="Desmarcado (ex.: descarte), a classe guarda estoque mas não aparece para vender."
          name="comercializavel" defaultChecked={classe?.comercializavel ?? true} />
      </SecaoForm>
      <p className="text-xs text-texto-suave">Classe não se exclui, porque o estoque dela fica no histórico. Para deixar de vender, desmarque Comercializável.</p>
    </FormPainel>
  );
}

export function CadastroPiscicultura({ setores, viveiros, classes, podeEditar, podeEditarClasses }: {
  setores: Setor[]; viveiros: Viveiro[]; classes: Classe[]; podeEditar: boolean; podeEditarClasses: boolean;
}) {
  const [aba, setAba] = useState<Aba>(setores.length === 0 ? "setores" : "viveiros");
  const nomeSetor = new Map(setores.map((n) => [n.id, n.nome]));
  const conta = (n: number) => <span className="tabular-nums opacity-60">{n}</span>;
  const abas = <AbasFiltro rotulo="Cadastro" valor={aba} aoMudar={setAba}
    opcoes={[
      { valor: "viveiros", nome: <>Viveiros {conta(viveiros.length)}</> },
      { valor: "setores", nome: <>Setores {conta(setores.length)}</> },
      { valor: "classes", nome: <>Classes de peixe {conta(classes.length)}</> },
    ]} />;

  if (aba === "classes") {
    const porId = new Map(classes.map((c) => [c.id, c]));
    const proximaOrdem = Math.max(0, ...classes.filter((c) => c.ordem < 9).map((c) => c.ordem)) + 1;
    return (
      <ListaCadastro
        key="classes"
        colunas={["Classe", "Peso por peixe", "Venda"]}
        filtros={abas}
        buscaPlaceholder="Buscar classe"
        vazio="Nenhuma classe ainda."
        rotuloNovo="Nova classe"
        novo={podeEditarClasses ? { titulo: "Nova classe", conteudo: <FormClasse podeEditar proximaOrdem={proximaOrdem} /> } : null}
        editar={(id) => {
          const c = porId.get(id);
          return c ? { titulo: `Classe ${c.nome}`, conteudo: <FormClasse classe={c} podeEditar={podeEditarClasses} proximaOrdem={proximaOrdem} /> } : null;
        }}
        linhas={classes.map((c) => ({
          id: c.id,
          busca: c.nome,
          ordem: [c.ordem, Number(c.peso_min_g ?? c.peso_max_g ?? 0), c.comercializavel ? 0 : 1],
          celulas: [
            <span key="n" className="font-medium text-texto">{c.nome}</span>,
            c.sem_classificacao ? "sem separar por tamanho" : faixaClasse(c.peso_min_g, c.peso_max_g) || <span key="f" className="text-texto-suave">–</span>,
            c.comercializavel ? "kg e caixa de 20 kg" : <Etiqueta key="v">Não vende</Etiqueta>,
          ],
        }))}
      />
    );
  }

  if (aba === "setores") {
    const porId = new Map(setores.map((n) => [n.id, n]));
    return (
      <ListaCadastro
        key="setores"
        colunas={["Setor", "Viveiros", "Capacidade", "Local"]}
        direita={["Viveiros", "Capacidade"]}
        filtros={abas}
        buscaPlaceholder="Buscar setor"
        vazio="Nenhum setor ainda. Comece criando o primeiro."
        rotuloNovo="Novo setor"
        novo={podeEditar ? { titulo: "Novo setor", conteudo: <FormSetor podeEditar /> } : null}
        editar={(id) => {
          const n = porId.get(id);
          return n ? { titulo: `Setor ${n.nome}`, conteudo: <FormSetor setor={n} podeEditar={podeEditar} /> } : null;
        }}
        linhas={setores.map((n) => {
          const dele = viveiros.filter((g) => g.setor_id === n.id);
          const e = n.endereco ?? {};
          return {
            id: n.id,
            busca: [n.nome, e.cidade, n.licenca_ambiental].filter(Boolean).join(" "),
            ordem: [n.nome, dele.length, dele.reduce((s, g) => s + g.capacidade_peixes, 0), e.cidade ?? null],
            inativa: !n.ativo,
            celulas: [
              <span key="n" className="flex flex-wrap items-center gap-1.5"><span className="font-medium text-texto">{n.nome}</span>{!n.ativo && <Etiqueta>Inativo</Etiqueta>}</span>,
              dele.length,
              formatarInteiro(dele.reduce((s, g) => s + g.capacidade_peixes, 0)),
              e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ""}` : <span key="l" className="text-texto-suave">–</span>,
            ],
          };
        })}
      />
    );
  }

  const porId = new Map(viveiros.map((g) => [g.id, g]));
  const ordenados = [...viveiros].sort((a, b) => (nomeSetor.get(a.setor_id) ?? "").localeCompare(nomeSetor.get(b.setor_id) ?? "") || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  return (
    <ListaCadastro
      key="viveiros"
      colunas={["Viveiro", "Finalidade", "Sistema", "Tamanho", "Capacidade", "Lote atual"]}
      direita={["Tamanho", "Capacidade"]}
      filtros={abas}
      buscaPlaceholder="Buscar viveiro, setor ou lote"
      vazio={setores.length ? "Nenhum viveiro ainda." : "Crie um setor primeiro, na aba Setores."}
      rotuloNovo="Novo viveiro"
      novo={podeEditar && setores.length ? { titulo: "Novo viveiro", conteudo: <FormViveiro setores={setores} podeEditar /> } : null}
      editar={(id) => {
        const g = porId.get(id);
        return g ? { titulo: `Viveiro ${g.nome}`, conteudo: <FormViveiro viveiro={g} setores={setores} podeEditar={podeEditar} /> } : null;
      }}
      linhas={ordenados.map((g) => ({
        id: g.id,
        secao: nomeSetor.get(g.setor_id) ?? "",
        busca: [g.nome, nomeSetor.get(g.setor_id), g.lote, FINALIDADES[g.finalidade], SISTEMAS[g.sistema]].filter(Boolean).join(" "),
        ordem: [g.nome, FINALIDADES[g.finalidade] ?? g.finalidade, SISTEMAS[g.sistema] ?? g.sistema, Number(g.area_m2 ?? g.volume_m3 ?? 0), g.capacidade_peixes, g.lote ?? null],
        inativa: !g.ativo,
        celulas: [
          <span key="n" className="flex flex-wrap items-center gap-1.5"><span className="font-medium text-texto">{g.nome}</span>{!g.ativo && <Etiqueta>Inativo</Etiqueta>}</span>,
          FINALIDADES[g.finalidade] ?? g.finalidade,
          SISTEMAS[g.sistema] ?? g.sistema,
          tamanho(g) ?? <span key="t" className="text-texto-suave">–</span>,
          formatarInteiro(g.capacidade_peixes),
          g.lote ?? <span key="l" className="text-texto-suave">vazio</span>,
        ],
      }))}
    />
  );
}
