import Link from "next/link";
import { cancelarNfe, consultarNfe, corrigirNfe, emitirNfe } from "@/app/(app)/notas/actions";
import { FormAcao } from "@/components/form-acao";
import { Campo, CLASSE_BOTAO_TEXTO, classeBotao } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

const ROTULO: Record<string, string> = {
  processando: "em processamento", autorizada: "autorizada", rejeitada: "rejeitada", cancelada: "cancelada", denegada: "denegada", cancelando: "cancelando",
};
const RESUMO = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";

// Emissão e situação da NF-e (ou NFC-e do balcão) de um pedido. Server component: pode entrar em qualquer página do pedido.
export async function BotaoNfe({ pedidoId, pedidoStatus }: { pedidoId: string; pedidoStatus: string }) {
  const supabase = await createClient();
  const { data: nota } = await supabase.from("notas_fiscais")
    .select("id, modelo, status, numero, serie, ambiente, danfe_path, xml_path, xml_cancelamento_path, cce_numero, cce_pdf_path, cce_xml_path, motivo_rejeicao")
    .eq("pedido_venda_id", pedidoId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const podeEmitir = ["faturado", "entregue"].includes(pedidoStatus) && (!nota || ["rejeitada", "cancelada", "denegada"].includes(nota.status));
  const arquivo = (tipo: string) => `/api/notas/${nota!.id}/${tipo}`;
  const modelo = nota?.modelo === "nfce" ? "NFC-e" : "NF-e";

  return (
    <div className="flex flex-col gap-2 text-sm">
      {nota && (
        <p className={nota.status === "rejeitada" || nota.status === "denegada" ? "text-perigo" : ""}>
          {modelo} {ROTULO[nota.status] ?? nota.status}{nota.numero && ` nº ${nota.numero}/${nota.serie}`}
          {nota.ambiente === "homologacao" && <span className="ml-1 text-xs text-alerta">(homologação, sem valor fiscal)</span>}
          {nota.motivo_rejeicao && <span className="block text-xs">{nota.motivo_rejeicao}</span>}
        </p>
      )}
      {nota && ["autorizada", "cancelada"].includes(nota.status) && (
        <div className="flex flex-wrap gap-3">
          {nota.danfe_path && <a href={arquivo("danfe")} target="_blank" rel="noreferrer" className={CLASSE_BOTAO_TEXTO}>DANFE (PDF)</a>}
          {nota.xml_path && <a href={arquivo("xml")} className={CLASSE_BOTAO_TEXTO}>XML</a>}
          {nota.xml_cancelamento_path && <a href={arquivo("cancelamento")} className={CLASSE_BOTAO_TEXTO}>XML do cancelamento</a>}
          {nota.cce_pdf_path && <a href={arquivo("cce-pdf")} target="_blank" rel="noreferrer" className={CLASSE_BOTAO_TEXTO}>Carta de correção {nota.cce_numero ?? ""}</a>}
          {nota.cce_xml_path && <a href={arquivo("cce-xml")} className={CLASSE_BOTAO_TEXTO}>XML da correção</a>}
        </div>
      )}
      {nota?.status === "autorizada" && (
        <div className="flex flex-wrap gap-2">
          {nota.modelo === "nfe" && (
            <details>
              <summary className={`${classeBotao("secundario", "sm")} ${RESUMO}`}>Carta de correção</summary>
              <div className="mt-2 w-80 max-w-full">
                <FormAcao acao={corrigirNfe} botao="Enviar correção" variante="secundario">
                  <input type="hidden" name="nota_id" value={nota.id} />
                  <Campo rotulo="O que corrigir (15 a 1000 caracteres)" id={`cce_${nota.id}`} name="correcao" required minLength={15} maxLength={1000} />
                  <p className="text-xs text-texto-suave">Não corrige valores, impostos, emitente, destinatário nem data. Vale a última carta enviada.</p>
                </FormAcao>
              </div>
            </details>
          )}
          <details>
            <summary className={`${classeBotao("secundario", "sm")} ${RESUMO}`}>Cancelar nota</summary>
            <div className="mt-2 w-72 max-w-full">
              <FormAcao acao={cancelarNfe} botao={`Cancelar ${modelo}`} variante="secundario">
                <input type="hidden" name="nota_id" value={nota.id} />
                <Campo rotulo="Justificativa (mín. 15 caracteres)" id={`just_${nota.id}`} name="justificativa" required minLength={15} />
                <p className="text-xs text-texto-suave">{nota.modelo === "nfce" ? "Na maioria dos estados a NFC-e só pode ser cancelada até 30 minutos depois da emissão." : "A NF-e pode ser cancelada em até 24 horas."}</p>
              </FormAcao>
            </div>
          </details>
        </div>
      )}
      {nota && ["processando", "cancelando"].includes(nota.status) && (
        <FormAcao acao={consultarNfe} botao="Atualizar situação" variante="secundario">
          <input type="hidden" name="nota_id" value={nota.id} />
        </FormAcao>
      )}
      {podeEmitir && (
        <FormAcao acao={emitirNfe} botao={nota ? "Emitir NF-e de novo" : "Emitir NF-e"} variante="secundario">
          <input type="hidden" name="pedido_id" value={pedidoId} />
        </FormAcao>
      )}
      {!nota && !podeEmitir && <p className="text-xs text-texto-suave">Fature o pedido para emitir a NF-e.</p>}
      {nota?.status === "rejeitada" && <Link href="/contatos" className={classeBotao("secundario", "sm")}>Corrigir o cadastro do cliente</Link>}
    </div>
  );
}
