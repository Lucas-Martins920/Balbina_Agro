import { AcaoConfirmada } from "@/components/acao-confirmada";
import { Cartao, Titulo } from "@/components/ui";
import { BotaoCopiar } from "@/components/vendas/botao-copiar";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { mudarLinkPedido } from "./actions";

// D3: link de pedido de cada cliente (docs/automacoes.md).
export default async function PaginaLinksPedido() {
  await exigirAcesso("vendas");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data: clientes } = await supabase.from("contatos").select("id, nome, portal_token")
    .eq("empresa_id", atual.id).eq("arquivado", false).contains("tipos", ["cliente"]).order("nome").limit(500);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const podeMudar = pode("vendas.lancar");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Titulo descricao="Mande o link para o cliente fazer o pedido sozinho, com os preços da tabela dele. O pedido cai em Vendas em aberto e quem lança vendas recebe aviso no celular.">
        Links de pedido dos clientes
      </Titulo>
      {!site && <p className="text-sm text-alerta">Falta configurar NEXT_PUBLIC_SITE_URL no servidor para montar o link completo.</p>}
      <Cartao titulo="Clientes">
        <ul className="flex flex-col divide-y divide-linha text-sm">
          {(clientes ?? []).map((c) => {
            const link = c.portal_token ? `${site}/pedido/${c.portal_token}` : null;
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium">{c.nome}</span>
                <span className="flex flex-wrap gap-2">
                  {link && <BotaoCopiar texto={link} rotulo="Link de pedido" />}
                  {podeMudar && (
                    <AcaoConfirmada acao={mudarLinkPedido} botao={link ? "Trocar link" : "Criar link"}
                      pergunta={link ? "O link antigo para de funcionar. Mande o novo para o cliente." : "Cria o link de pedido deste cliente."}>
                      <input type="hidden" name="id" value={c.id} />
                    </AcaoConfirmada>
                  )}
                  {podeMudar && link && (
                    <AcaoConfirmada acao={mudarLinkPedido} botao="Desligar" pergunta="O cliente não consegue mais pedir pelo link.">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="acao" value="desligar" />
                    </AcaoConfirmada>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Cartao>
    </div>
  );
}
