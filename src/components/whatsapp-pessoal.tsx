import { MessageCircle } from "lucide-react";
import { desligarWhatsApp, avisosWhatsApp, pedirCodigoWhatsApp } from "@/app/(app)/seguranca/whatsapp-actions";
import { FormAcao } from "@/components/form-acao";
import { Campo, Cartao, Etiqueta, classeBotao } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";
import { numeroDoBalbina, whatsappConfigurado } from "@/lib/whatsapp";
import { formatarCelular } from "@/lib/whatsapp-texto";

// H2: o celular da própria pessoa no WhatsApp do Balbina (avisos e envio de documentos).
export async function WhatsAppPessoal() {
  if (!whatsappConfigurado()) return null;
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data: v } = await supabase.from("whatsapp_vinculos")
    .select("telefone, codigo, confirmado_em, avisos").eq("empresa_id", atual.id).maybeSingle();
  const balbina = numeroDoBalbina();
  const mensagem = v?.codigo ? `Balbina ${v.codigo}` : "";

  return (
    <Cartao titulo="WhatsApp" icone={MessageCircle} cor="verde"
      descricao="Receba os avisos do Balbina no seu WhatsApp e mande fotos de boletos e notas para lançar.">
      <div className="flex flex-col gap-4 text-sm">
        {v?.confirmado_em && (
          <div className="flex flex-wrap items-center gap-2">
            <span>Ligado ao celular <span className="font-medium tabular-nums">{formatarCelular(v.telefone)}</span>.</span>
            <Etiqueta tom={v.avisos ? "positivo" : "neutro"}>{v.avisos ? "avisos ligados" : "avisos desligados"}</Etiqueta>
          </div>
        )}
        {v?.confirmado_em && (
          <div className="flex flex-wrap gap-3">
            <FormAcao acao={avisosWhatsApp} botao={v.avisos ? "Desligar avisos" : "Ligar avisos"} variante="secundario" limparAoSalvar={false}>
              <input type="hidden" name="ligar" value={v.avisos ? "" : "1"} />
            </FormAcao>
            <FormAcao acao={desligarWhatsApp} botao="Desligar este celular" variante="secundario" limparAoSalvar={false}>
              <span className="sr-only">Desligar o celular do Balbina</span>
            </FormAcao>
          </div>
        )}
        {!v?.confirmado_em && v?.codigo && (
          <div className="flex flex-col gap-2">
            <p>
              Do celular <span className="font-medium tabular-nums">{formatarCelular(v.telefone)}</span>, mande{" "}
              <span className="font-mono font-medium">{mensagem}</span>
              {balbina ? <> para o WhatsApp do Balbina, <span className="font-medium tabular-nums">{formatarCelular(balbina)}</span></> : null}. O código vale 30 minutos.
            </p>
            {balbina && (
              <a href={`https://wa.me/${balbina}?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer" className={`${classeBotao("primario", "sm")} self-start`}>
                Abrir o WhatsApp com a mensagem
              </a>
            )}
            <p className="text-xs text-texto-suave">Depois de mandar, recarregue esta página.</p>
          </div>
        )}
        <FormAcao acao={pedirCodigoWhatsApp} botao={v ? "Gerar novo código" : "Ligar meu WhatsApp"} variante={v?.confirmado_em ? "secundario" : "primario"} limparAoSalvar={false}>
          <div className="w-60">
            <Campo rotulo={v?.confirmado_em ? "Trocar para o celular" : "Seu celular"} id="telefone" name="telefone" type="tel" inputMode="tel"
              placeholder="(92) 99123-4567" defaultValue={v && !v.confirmado_em ? formatarCelular(v.telefone) : ""} required />
          </div>
        </FormAcao>
        <p className="text-xs text-texto-suave">
          Os avisos são os mesmos do celular (lembrete de apontamento, resumo do dia, notas de compra...), só dos assuntos que você acessa.
          Para parar pelo próprio WhatsApp, mande SAIR.
        </p>
      </div>
    </Cartao>
  );
}
