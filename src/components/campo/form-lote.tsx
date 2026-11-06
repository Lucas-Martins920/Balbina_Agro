"use client";

import { useId, useState, type FormEvent } from "react";
import { lerCentavos } from "@/lib/formato";
import type { ItemFila } from "@/lib/campo/fila";
import type { Tanque } from "@/lib/campo/tipos";
import { validarAbrirLote, validarFecharLote } from "@/lib/campo/validar";
import { novoId, useCampo } from "./contexto";
import {
  AvisoCampo, BotaoGrande, CampoNumero, dataCurta, Entrada, fmt, lerNumero, Numero, Observacoes, RodapeFolha, Segmentado, Selecao, useDoisToques,
} from "./pecas";

// "Tanque 02" em 05/11/2026 -> "TANQUE02-261105": único o bastante e fácil de achar depois (dá para trocar)
export function codigoSugerido(nome: string, hoje: string) {
  const base = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "").toUpperCase().slice(0, 12) || "LOTE";
  return `${base}-${hoje.slice(2, 4)}${hoje.slice(5, 7)}${hoje.slice(8, 10)}`;
}

// Povoamento do viveiro vazio: quantos peixes entraram, com que peso, de que espécie.
export function FormAbrirLote({ tanque, aoSalvar }: { tanque: Tanque; aoSalvar: () => void }) {
  const campo = useCampo();
  const idForm = useId();
  const { especies } = campo.dados.painel;
  const [codigo, setCodigo] = useState(() => codigoSugerido(tanque.nome, campo.hoje));
  const [especie, setEspecie] = useState(() => (especies.find((e) => /tambaqui/i.test(e.nome)) ?? especies[0])?.id ?? "");
  const [data, setData] = useState(campo.hoje);
  const [quantidadeTexto, setQuantidadeTexto] = useState("");
  const [pesoTexto, setPesoTexto] = useState("");
  const [alvoTexto, setAlvoTexto] = useState("");
  const [custoTexto, setCustoTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const jaNaFila = campo.pendentes(tanque.id).some((i) => i.tipo === "abrir_lote");

  const quantidade = lerNumero(quantidadeTexto);
  const peso = lerNumero(pesoTexto);
  const biomassa = quantidade && peso ? (quantidade * peso) / 1000 : null;

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (jaNaFila) return setErro("Este viveiro já tem um lote esperando envio. Veja em Envios.");
    const custo = custoTexto.trim() ? lerCentavos(custoTexto) : 0;
    if (custo === null) return setErro("Custo dos alevinos: informe em reais (ex.: 1.250,00).");
    const client_id = novoId();
    const corpo = {
      client_id, viveiro_id: tanque.id, data, codigo: codigo.trim(), especie_id: especie, quantidade, peso_inicial_g: peso,
      peso_alvo_g: alvoTexto.trim() ? lerNumero(alvoTexto) ?? -1 : null, custo_cents: custo,
    };
    const v = validarAbrirLote(corpo, campo.hoje);
    if ("erro" in v) return setErro(v.erro);
    const item: ItemFila = {
      client_id, tipo: "abrir_lote", corpo, criado_em: new Date().toISOString(),
      rotulo: `Abrir lote ${v.ok.codigo} · ${tanque.rotulo} · ${fmt(v.ok.quantidade, 0)} peixes de ${fmt(v.ok.peso_inicial_g, 1)} g`,
    };
    if (campo.salvar(item)) aoSalvar();
    else setErro("O celular está sem espaço para guardar. Libere espaço ou lance com sinal.");
  }

  return (
    <form id={idForm} onSubmit={salvar} noValidate className="flex flex-col gap-5 pt-1">
      {jaNaFila && <AvisoCampo tom="alerta">Este viveiro já tem um lote esperando envio.</AvisoCampo>}
      <div className="grid grid-cols-2 gap-3">
        <CampoNumero rotulo="Peixes povoados" inputMode="numeric" value={quantidadeTexto} onChange={(e) => setQuantidadeTexto(e.target.value)} placeholder="0" className="col-span-2" />
        <CampoNumero rotulo="Peso médio" unidade="g" value={pesoTexto} onChange={(e) => setPesoTexto(e.target.value)} placeholder="0" />
        <CampoNumero rotulo="Peso de despesca" unidade="g" value={alvoTexto} onChange={(e) => setAlvoTexto(e.target.value)} placeholder="opcional" />
      </div>
      {quantidade !== null && quantidade > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Numero titulo="Densidade" valor={quantidade && tanque.area_m2 ? `${fmt(quantidade / tanque.area_m2, 1)} /m²` : "—"}
            detalhe={tanque.area_m2 ? `${fmt(tanque.area_m2, 0)} m² de lâmina` : "cadastre a área do viveiro"} />
          <Numero titulo="Biomassa inicial" valor={biomassa !== null ? `${fmt(biomassa, 1)} kg` : "—"}
            detalhe={biomassa !== null && tanque.volume_m3 ? `${fmt(biomassa / tanque.volume_m3, 2)} kg/m³` : undefined} />
        </div>
      )}
      {especies.length > 1 && (
        <Selecao rotulo="Espécie" value={especie} onChange={(e) => setEspecie(e.target.value)}>
          {especies.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </Selecao>
      )}
      <Entrada rotulo="Código do lote" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={40} autoCapitalize="characters" />
      <CampoNumero rotulo="Custo dos alevinos" unidade="R$" value={custoTexto} onChange={(e) => setCustoTexto(e.target.value)} placeholder="opcional"
        ajuda="Entra no custo do lote." />
      <Entrada rotulo="Data do povoamento" type="date" value={data} max={campo.hoje} onChange={(e) => setData(e.target.value)} />
      {erro && <AvisoCampo tom="perigo">{erro}</AvisoCampo>}
      <RodapeFolha>
        <BotaoGrande type="submit" form={idForm} disabled={jaNaFila}>Abrir lote</BotaoGrande>
      </RodapeFolha>
    </form>
  );
}

// Despesca total (kg retirados do viveiro) ou encerramento sem despesca. Fecha o lote e o viveiro fica vazio.
export function FormFecharLote({ tanque, aoSalvar }: { tanque: Tanque; aoSalvar: () => void }) {
  const campo = useCampo();
  const idForm = useId();
  const lote = tanque.lote!;
  const [modo, setModo] = useState<"despesca" | "encerrar">("despesca");
  const [data, setData] = useState(campo.hoje);
  const [kgTexto, setKgTexto] = useState("");
  const [peixesTexto, setPeixesTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [armado, tocar] = useDoisToques(5000);

  const kg = lerNumero(kgTexto);
  const peixes = lerNumero(peixesTexto);
  const emCarencia = lote.carencia_ate !== null && lote.carencia_ate >= data;
  const pesoMedio = kg && peixes ? (kg * 1000) / peixes : null;

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const client_id = novoId();
    const corpo = {
      client_id, viveiro_id: tanque.id, data, modo, kg: modo === "despesca" ? kg : null, peixes: modo === "despesca" ? peixes : null,
      motivo: modo === "encerrar" ? motivo.trim() : "", observacoes: observacoes.trim(),
    };
    const v = validarFecharLote(corpo, campo.hoje);
    if ("erro" in v) return setErro(v.erro);
    tocar(() => {
      const item: ItemFila = {
        client_id, tipo: "fechar_lote", lote_id: lote.id, corpo, criado_em: new Date().toISOString(),
        rotulo: modo === "despesca" ? `Despesca do lote ${lote.codigo} · ${tanque.rotulo} · ${fmt(v.ok.kg, 1)} kg` : `Encerrar lote ${lote.codigo} · ${tanque.rotulo}`,
      };
      if (campo.salvar(item)) aoSalvar();
      else setErro("O celular está sem espaço para guardar. Libere espaço ou lance com sinal.");
    });
  }

  return (
    <form id={idForm} onSubmit={salvar} noValidate className="flex flex-col gap-5 pt-1">
      <Segmentado rotulo="Como o lote sai do viveiro" valor={modo} mudar={setModo}
        opcoes={[{ valor: "despesca", nome: "Despesca total" }, { valor: "encerrar", nome: "Sem despesca" }]} />
      {emCarencia && (
        <AvisoCampo tom="perigo" titulo={`Lote em carência até ${dataCurta(lote.carencia_ate)}`}>
          Houve medicamento: o peixe não pode ir para a venda antes dessa data.
        </AvisoCampo>
      )}
      {modo === "despesca" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Numero titulo="Estimado no viveiro" valor={lote.biomassa_kg !== null ? `${fmt(lote.biomassa_kg, 0)} kg` : "—"}
              detalhe={`${fmt(lote.peixes, 0)} peixes${lote.peso_g !== null ? ` de ${fmt(lote.peso_g, 0)} g` : ""}`} />
            <Numero titulo="Peso médio na despesca" valor={pesoMedio !== null ? `${fmt(pesoMedio, 0)} g` : "—"} detalhe="kg ÷ peixes" />
          </div>
          <CampoNumero rotulo="Peixe despescado" unidade="kg" value={kgTexto} onChange={(e) => setKgTexto(e.target.value)} placeholder="0" />
          <CampoNumero rotulo="Peixes contados" inputMode="numeric" value={peixesTexto} onChange={(e) => setPeixesTexto(e.target.value)} placeholder="opcional"
            ajuda="Sem a contagem, o sistema usa os peixes do lote." />
        </>
      ) : (
        <Observacoes rotulo="Por que o lote está sendo encerrado?" valor={motivo} mudar={setMotivo} ajuda="Ex.: mortalidade total, lote lançado por engano." />
      )}
      {modo === "despesca" && <Observacoes valor={observacoes} mudar={setObservacoes} />}
      <Entrada rotulo="Data" type="date" value={data} max={campo.hoje} onChange={(e) => setData(e.target.value)} />
      {erro && <AvisoCampo tom="perigo">{erro}</AvisoCampo>}
      <RodapeFolha>
        {armado && <p role="status" className="text-center text-sm text-texto-suave">O lote {lote.codigo} fecha e o viveiro fica vazio.</p>}
        <BotaoGrande type="submit" form={idForm} variante={armado ? "perigo" : "primario"}>
          {armado ? "Toque de novo para confirmar" : modo === "despesca" ? "Registrar despesca" : "Encerrar lote"}
        </BotaoGrande>
      </RodapeFolha>
    </form>
  );
}
