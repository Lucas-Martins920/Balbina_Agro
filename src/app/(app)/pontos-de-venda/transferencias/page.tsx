import { AcaoConfirmada } from "@/components/acao-confirmada";
import { BotaoLancamento } from "@/components/lancamento";
import { Campo, Cartao, Etiqueta, LinkBotao, Selecao, Tabela, Titulo, type TomEtiqueta } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { diasAtrasISO, formatarData, formatarMoeda, hojeISO } from "@/lib/formato";
import { textoKg } from "@/lib/pescado";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { fretePorUnidade, STATUS_TRANSFERENCIA } from "@/lib/pontos";
import { carregarPontos } from "@/lib/pontos-dados";
import { createClient } from "@/lib/supabase/server";
import { cancelarTransferencia, receberTransferencia, transferirPeixe } from "../actions";

const TOM: Record<string, TomEtiqueta> = { em_transito: "alerta", recebida: "positivo", cancelada: "neutro" };

type Item = { classe_peixe_id: string; kg_enviados: number; perda_kg: number; classes_peixe: { nome: string } | null };

export default async function PaginaTransferencias() {
  await exigirAcesso("estoque");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const hoje = hojeISO(atual.fuso);
  const supabase = await createClient();
  const [pontos, { data: estoque }, { data: transportadores }, { data: transferencias }] = await Promise.all([
    carregarPontos(atual.id),
    supabase.from("estoque_peixe_ponto").select("ponto_venda_id, classe_id, classe_nome, ordem, disponivel, comercializavel, sem_classificacao")
      .eq("empresa_id", atual.id).order("ordem"),
    supabase.from("contatos").select("id, nome").eq("empresa_id", atual.id).contains("tipos", ["fornecedor"]).eq("arquivado", false).order("nome"),
    supabase.from("transferencias_peixe")
      .select("id, numero, data, status, recebida_em, kg_enviados, kg_recebidos, perda_kg, frete_cents, observacoes, origem:pontos_venda!origem_id(nome), destino:pontos_venda!destino_id(nome), transferencia_peixe_itens(classe_peixe_id, kg_enviados, perda_kg, classes_peixe(nome))")
      .eq("empresa_id", atual.id).or(`status.eq.em_transito,data.gte.${diasAtrasISO(90, atual.fuso)}`)
      .order("data", { ascending: false }).order("numero", { ascending: false }).limit(100),
  ]);
  const ativos = pontos.filter((p) => p.ativo);
  const sede = ativos.find((p) => p.sede);
  const destinoPadrao = ativos.find((p) => !p.sede);
  // classes que dá para mandar: as da piscicultura (todas com saldo ou comercializáveis)
  const classes = (estoque ?? []).filter((e) => e.ponto_venda_id === sede?.id && (e.comercializavel || Number(e.disponivel) > 0));
  const disponivel = (ponto: string | undefined, classe: string) =>
    Number((estoque ?? []).find((e) => e.ponto_venda_id === ponto && e.classe_id === classe)?.disponivel ?? 0);
  const podeLancar = pode("estoque.editar");
  const aCaminho = (transferencias ?? []).filter((t) => t.status === "em_transito");
  const nome = (x: unknown) => (x as { nome: string } | null)?.nome ?? "–";

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo descricao="Leve peixe da piscicultura para um ponto de venda (ou de volta). O peixe sai da origem na hora e entra no destino quando chega; o frete vira conta a pagar e custo por kg no ponto."
        acoes={
          <>
            <LinkBotao href="/pontos-de-venda" variante="fantasma">Pontos de venda</LinkBotao>
            {ativos.length >= 2 && podeLancar && (
              <BotaoLancamento rotulo="Nova transferência" acao={transferirPeixe} botao="Transferir">
            <div className="grid gap-3 grid-cols-2">
              <Selecao rotulo="Sai de" id="origem_id" name="origem_id" defaultValue={sede?.id}>
                {ativos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </Selecao>
              <Selecao rotulo="Vai para" id="destino_id" name="destino_id" defaultValue={destinoPadrao?.id}>
                {ativos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </Selecao>
              <Campo rotulo="Data da saída" id="data" name="data" type="date" defaultValue={hoje} max={hoje} required />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Kg de peixe por classe</legend>
              {classes.map((c) => (
                <div key={c.classe_id} className="grid grid-cols-[1fr_7rem] items-end gap-2">
                  <span className="pb-2 text-sm">
                    {c.classe_nome}
                    <span className="block text-xs text-texto-suave">{textoKg(disponivel(sede?.id, c.classe_id))} disponíveis na piscicultura</span>
                  </span>
                  <Campo rotulo="kg" id={`classe_${c.classe_id}`} name={`classe_${c.classe_id}`} inputMode="decimal" placeholder="0" />
                </div>
              ))}
            </fieldset>
            <div className="grid gap-3 grid-cols-2">
              <Campo rotulo="Frete (R$)" id="frete" name="frete" inputMode="decimal" placeholder="0,00"
                ajuda="Combustível, gelo, carreto ou transportadora; vira custo por kg no destino" />
              <Selecao rotulo="Transportador (opcional)" id="transportador_id" name="transportador_id" defaultValue="">
                <option value="">Veículo próprio / sem fornecedor</option>
                {(transportadores ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
              <Campo rotulo="Vencimento do frete" id="vencimento_frete" name="vencimento_frete" type="date" defaultValue={hoje} />
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="frete_a_pagar" defaultChecked /> Lançar o frete em contas a pagar</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="a_caminho" /> Ainda está a caminho (recebo depois, conferindo a perda)</label>
            </div>
            <Campo rotulo="Observação" id="observacoes" name="observacoes" />
          </BotaoLancamento>
            )}
          </>
        }>
        Transferência de peixe
      </Titulo>

      {ativos.length < 2 ? (
        <Cartao titulo="Cadastre um ponto de venda primeiro">
          <p className="text-sm text-texto-suave">A transferência leva peixe da piscicultura para outro ponto. Cadastre a loja, feira ou entreposto em Pontos de venda.</p>
        </Cartao>
      ) : null}

      {aCaminho.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">A caminho</h2>
          {aCaminho.map((t) => {
            const itens = (t.transferencia_peixe_itens ?? []) as unknown as Item[];
            return (
              <Cartao key={t.id} titulo={`Nº ${t.numero} · ${nome(t.origem)} → ${nome(t.destino)}`}
                descricao={`Saiu em ${formatarData(t.data)} com ${textoKg(t.kg_enviados, 3)} de peixe${Number(t.frete_cents) ? ` · frete ${formatarMoeda(Number(t.frete_cents))}` : ""}`}>
                {podeLancar && (
                  <div className="flex flex-wrap gap-3">
                    <AcaoConfirmada acao={receberTransferencia} botao="Receber" confirmar="Confirmar recebimento"
                      pergunta="O peixe entra no estoque do destino; o que chegou sem condição de venda sai como perda.">
                      <input type="hidden" name="id" value={t.id} />
                      <Campo rotulo="Data da chegada" id={`data_${t.id}`} name="data" type="date" defaultValue={hoje} min={t.data} max={hoje} />
                      {itens.map((i) => (
                        <Campo key={i.classe_peixe_id} rotulo={`Perda em kg: ${i.classes_peixe?.nome ?? ""} (de ${textoKg(i.kg_enviados, 3)})`}
                          id={`perda_${t.id}_${i.classe_peixe_id}`} name={`perda_${i.classe_peixe_id}`} inputMode="decimal" placeholder="0" />
                      ))}
                    </AcaoConfirmada>
                    <AcaoConfirmada acao={cancelarTransferencia} botao="Cancelar" confirmar="Cancelar transferência" variante="perigo"
                      pergunta="O peixe volta para a origem e o frete em aberto é cancelado.">
                      <input type="hidden" name="id" value={t.id} />
                    </AcaoConfirmada>
                  </div>
                )}
              </Cartao>
            );
          })}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Transferências dos últimos 90 dias</h2>
        <Tabela cabecalho={["Nº", "Saída", "De → para", "Enviados", "Recebidos", "Perda", "Frete", "Frete por kg", "Situação", ""]} principal="De → para"
          direita={["Enviados", "Recebidos", "Perda", "Frete", "Frete por kg"]} total={transferencias?.length ?? 0} vazio="Nenhuma transferência ainda.">
          {(transferencias ?? []).map((t) => {
            const frete = fretePorUnidade(Number(t.frete_cents), Number(t.kg_recebidos ?? 0));
            return (
              <tr key={t.id} className={`tabular-nums ${t.status === "cancelada" ? "text-texto-suave line-through" : ""}`}>
                <td>{t.numero}</td>
                <td>{formatarData(t.data)}</td>
                <td>{nome(t.origem)} → {nome(t.destino)}{t.observacoes && <span className="block text-xs text-texto-suave">{t.observacoes}</span>}</td>
                <td className="text-right">{textoKg(t.kg_enviados)}</td>
                <td className="text-right">{t.kg_recebidos === null ? "–" : textoKg(t.kg_recebidos)}</td>
                <td className="text-right">{Number(t.perda_kg) ? textoKg(t.perda_kg) : "–"}</td>
                <td className="text-right">{Number(t.frete_cents) ? formatarMoeda(Number(t.frete_cents)) : "–"}</td>
                <td className="text-right">{frete === null ? "–" : formatarMoeda(frete)}</td>
                <td><Etiqueta tom={TOM[t.status]}>{STATUS_TRANSFERENCIA[t.status] ?? t.status}</Etiqueta></td>
                <td>
                  {podeLancar && t.status === "recebida" && (
                    <AcaoConfirmada acao={cancelarTransferencia} botao="Desfazer" confirmar="Desfazer transferência" variante="perigo"
                      pergunta="O peixe sai do destino e volta para a origem. Só passa se o destino ainda tiver esse peixe.">
                      <input type="hidden" name="id" value={t.id} />
                    </AcaoConfirmada>
                  )}
                </td>
              </tr>
            );
          })}
        </Tabela>
      </section>
    </div>
  );
}
