"use client";

import { useId, useState, type FormEvent } from "react";
import { VIAS_MEDICAMENTO } from "@/lib/rotulos";
import { somarDias } from "@/lib/formato";
import type { ItemFila } from "@/lib/campo/fila";
import { pendenciaDoCartao, rotuloCartao, type CartaoInsumo } from "@/lib/campo/propostas";
import { validarInsumoCampo, type TipoInsumo } from "@/lib/campo/validar";
import { novoId, useCampo } from "./contexto";
import {
  AvisoCampo, BotaoGrande, CampoNumero, dataCurta, Entrada, Escolha, fmt, lerNumero, Observacoes, Passo, RodapeFolha, Selecao,
} from "./pecas";

const NOMES: Record<TipoInsumo, string> = {
  calagem: "Calagem", adubacao: "Adubação", medicamento: "Medicamento", banho: "Banho", limpeza: "Limpeza", outro: "Outro",
};

// Corretivo, fertilizante, medicamento e outros insumos aplicados no viveiro (com ou sem peixe).
// Sai do estoque do produto; medicamento segue o cadastro (dose, via e carência).
export function FormInsumo({ tanqueId, aoSalvar }: { tanqueId: string; aoSalvar: () => void }) {
  const campo = useCampo();
  const idForm = useId();
  const { dados } = campo;
  const { tanques, insumos } = dados.painel;
  const [viveiro, setViveiro] = useState(tanqueId);
  const tanque = tanques.find((t) => t.id === viveiro);
  const [tipo, setTipo] = useState<TipoInsumo>("calagem");
  const [produto, setProduto] = useState("");
  const [medicamento, setMedicamento] = useState("");
  const [quantidadeTexto, setQuantidadeTexto] = useState("");
  const [baseTexto, setBaseTexto] = useState("");
  const [dias, setDias] = useState(1);
  const [baixar, setBaixar] = useState(true);
  const [data, setData] = useState(campo.hoje);
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const ehMedicamento = tipo === "medicamento";
  // corretivos primeiro: são o que mais se aplica no viveiro
  const produtos = [...insumos].sort((a, b) => Number(b.tipo === "corretivo") - Number(a.tipo === "corretivo"));
  const p = insumos.find((i) => i.id === produto);
  const m = dados.medicamentos.find((x) => x.id === medicamento);
  const quantidade = lerNumero(quantidadeTexto);
  const base = lerNumero(baseTexto);
  const naRacao = m?.via === "racao";
  const totalMedicamento = m?.dose && base ? m.dose * base : null;
  const semSaldo = !ehMedicamento && baixar && p && p.saldo !== null && quantidade !== null && quantidade > p.saldo;
  const fimCarencia = m && m.carencia > 0 && /^\d{4}-\d{2}-\d{2}$/.test(data) ? somarDias(data, dias - 1 + m.carencia) : null;

  function trocarTipo(t: TipoInsumo) {
    setTipo(t);
    setErro(null);
  }

  function escolherMedicamento(id: string) {
    setMedicamento(id);
    const novo = dados.medicamentos.find((x) => x.id === id);
    // na água do viveiro a base é o volume do viveiro inteiro
    setBaseTexto(novo?.via === "agua" && tanque?.volume_m3 ? fmt(tanque.volume_m3, 1) : "");
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (quantidadeTexto.trim() && quantidade === null) return setErro("Quantidade: informe um número (ex.: 200 ou 12,5).");
    if (baseTexto.trim() && base === null) return setErro(`${naRacao ? "Ração medicada" : "Água tratada"}: informe um número.`);
    const cartao: CartaoInsumo = {
      tipo: "insumo", viveiro_id: viveiro || null, insumo_tipo: tipo, produto_id: ehMedicamento ? null : produto || null,
      medicamento_id: ehMedicamento ? medicamento || null : null, quantidade: ehMedicamento ? null : quantidade, observacoes: observacoes.trim(),
    };
    const pendencia = pendenciaDoCartao(cartao, campo.cartoes);
    if (pendencia) return setErro(pendencia);
    const client_id = novoId();
    const corpo = {
      client_id, viveiro_id: viveiro, data, tipo, observacoes: cartao.observacoes,
      produto_id: cartao.produto_id, quantidade: ehMedicamento ? (m?.dose ? null : quantidade) : quantidade,
      medicamento_id: cartao.medicamento_id, dias: ehMedicamento ? dias : 1, base: ehMedicamento ? base : null,
      baixar_estoque: ehMedicamento ? undefined : baixar ? undefined : false,
    };
    const v = validarInsumoCampo(corpo, campo.hoje);
    if ("erro" in v) return setErro(v.erro);
    const item: ItemFila = { client_id, tipo: "insumo", corpo, rotulo: rotuloCartao(cartao, campo.cartoes), criado_em: new Date().toISOString() };
    if (campo.salvar(item)) aoSalvar();
    else setErro("O celular está sem espaço para guardar. Libere espaço ou lance com sinal.");
  }

  return (
    <form id={idForm} onSubmit={salvar} noValidate className="flex flex-col gap-5 pt-1">
      {!tanqueId && (
        <Selecao rotulo="Viveiro" value={viveiro} onChange={(e) => setViveiro(e.target.value)}>
          <option value="">Escolha o viveiro</option>
          {tanques.map((t) => <option key={t.id} value={t.id}>{t.rotulo}{t.lote ? ` · lote ${t.lote.codigo}` : " · vazio"}</option>)}
        </Selecao>
      )}
      <Escolha rotulo="O que foi aplicado" valor={tipo} mudar={trocarTipo} colunas={3}
        opcoes={(Object.keys(NOMES) as TipoInsumo[]).map((t) => ({ valor: t, nome: NOMES[t] }))} />

      {ehMedicamento ? (
        dados.medicamentos.length === 0 ? (
          <AvisoCampo titulo="Nenhum medicamento cadastrado">No computador, cadastre em Sanidade o medicamento com a dose e a carência que o técnico indicou.</AvisoCampo>
        ) : (
          <>
            <Selecao rotulo="Medicamento ou vitamina" value={medicamento} onChange={(e) => escolherMedicamento(e.target.value)}>
              <option value="">Escolha</option>
              {dados.medicamentos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </Selecao>
            {m && (
              <>
                <p className="-mt-2 px-1 text-sm text-texto-suave">
                  {[m.via ? VIAS_MEDICAMENTO[m.via] ?? m.via : null,
                    m.dose ? `dose do cadastro: ${fmt(m.dose, 3)} ${m.unidade} por ${naRacao ? "kg de ração" : "m³ de água"}` : "sem dose no cadastro"].filter(Boolean).join(" · ")}
                </p>
                {m.dose ? (
                  <CampoNumero rotulo={naRacao ? "Ração medicada" : "Água tratada"} unidade={naRacao ? "kg" : "m³"} value={baseTexto}
                    onChange={(e) => setBaseTexto(e.target.value)}
                    ajuda={totalMedicamento !== null ? `Total: ${fmt(totalMedicamento, 3)} ${m.unidade} de ${m.nome}.` : "O total do medicamento sai da dose do cadastro."} />
                ) : (
                  <CampoNumero rotulo="Quantidade aplicada" unidade={m.unidade} value={quantidadeTexto} onChange={(e) => setQuantidadeTexto(e.target.value)} />
                )}
                <Passo rotulo="Dias de tratamento" valor={dias} mudar={(v) => setDias(Math.min(120, Math.max(1, Math.round(v))))} min={1} />
                {fimCarencia && (
                  <AvisoCampo tom="alerta" titulo={`Carência de ${m.carencia} dias`}>
                    O lote não pode ser despescado para venda antes de {dataCurta(fimCarencia)}.
                  </AvisoCampo>
                )}
              </>
            )}
          </>
        )
      ) : insumos.length === 0 ? (
        <AvisoCampo titulo="Nenhum insumo cadastrado">
          No computador, cadastre calcário, adubo e sal em Estoque, nos produtos do tipo Corretivo e fertilizante. {tipo === "limpeza" || tipo === "outro" ? "Dá para lançar sem produto, só com a observação." : ""}
        </AvisoCampo>
      ) : (
        <>
          <Selecao rotulo="Produto" value={produto} onChange={(e) => setProduto(e.target.value)}
            ajuda={tipo === "limpeza" || tipo === "outro" ? "Opcional." : undefined}>
            <option value="">{tipo === "limpeza" || tipo === "outro" ? "Sem produto" : "Escolha"}</option>
            {produtos.map((x) => <option key={x.id} value={x.id}>{x.nome}{x.saldo !== null ? ` (${fmt(x.saldo, 1)} ${x.unidade})` : ""}</option>)}
          </Selecao>
          {p && <CampoNumero rotulo="Quantidade aplicada" unidade={p.unidade} value={quantidadeTexto} onChange={(e) => setQuantidadeTexto(e.target.value)} placeholder="0" />}
          {p && (
            <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-elevado/60 px-4 text-[15px]">
              Tirar do estoque
              <input type="checkbox" checked={baixar} onChange={(e) => setBaixar(e.target.checked)} className="size-5 accent-marca" />
            </label>
          )}
          {semSaldo && (
            <AvisoCampo tom="alerta" titulo="Saldo menor que a quantidade">
              O estoque tem {fmt(p.saldo, 1)} {p.unidade}. Lance a compra no computador ou desligue “Tirar do estoque”.
            </AvisoCampo>
          )}
        </>
      )}
      {tanque && !tanque.lote && (tipo === "banho" || ehMedicamento) && (
        <AvisoCampo tom="perigo">Este viveiro está vazio: {ehMedicamento ? "medicamento" : "banho"} é aplicado nos peixes.</AvisoCampo>
      )}

      <Observacoes valor={observacoes} mudar={setObservacoes} />
      <Entrada rotulo="Data" type="date" value={data} max={campo.hoje} onChange={(e) => setData(e.target.value)} />
      {erro && <AvisoCampo tom="perigo">{erro}</AvisoCampo>}
      <RodapeFolha>
        <BotaoGrande type="submit" form={idForm}>Salvar {NOMES[tipo].toLowerCase()}</BotaoGrande>
      </RodapeFolha>
    </form>
  );
}
