import { Campo, classeBotao, Etiqueta, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { KG_CAIXA, numeroKg, textoKg } from "@/lib/pescado";
import { formatarData, formatarInteiro, formatarMoeda, formatarNumero, hojeISO } from "@/lib/formato";
import { ultimosMeses } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";
import { lerTodas } from "@/lib/supabase/todas";
import { clientesSemComprar, curvaAbc, linkWhatsapp, resumoVendas, type ClienteContato, type ItemVendido, type CompraCliente } from "@/lib/vendas";
import { exigirAcesso } from "@/lib/permissoes";
import { AbasRelatorio } from "../abas";

const mesValido = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? v : null);
const diasValidos = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 3650 ? n : 60;
};
const TOM_ABC = { A: "positivo", B: "info", C: "neutro" } as const;

export default async function RelatoriosVendas({ searchParams }: PageProps<"/relatorios/vendas">) {
  await exigirAcesso("vendas");
  const filtros = await searchParams;
  const { atual } = await getEmpresaAtual();
  const ate = mesValido(filtros.ate) ?? hojeISO(atual.fuso).slice(0, 7);
  const de = mesValido(filtros.de) ?? ultimosMeses(ate, 3)[0].slice(0, 7);
  const dias = diasValidos(filtros.dias);
  const hoje = hojeISO(atual.fuso);
  const supabase = await createClient();
  const [a, m] = ate.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const [{ data, error }, { data: clientes, error: e2 }, { data: pedidos, error: e3 }] = await Promise.all([
    lerTodas(() => supabase.from("vendas_itens").select("mes, cliente_id, cliente, produto, classe, kg, total_cents")
      .eq("empresa_id", atual.id).gte("data", `${de}-01`).lte("data", fim)
      .order("mes").order("cliente_id").order("produto").order("classe").order("kg").order("total_cents")),
    lerTodas(() => supabase.from("contatos").select("id, nome, cidade, uf, telefone, arquivado").eq("empresa_id", atual.id).contains("tipos", ["cliente"]).order("id"), 20000),
    lerTodas(() => supabase.from("clientes_compras").select("cliente_id, ultima_compra, pedidos, total_cents").eq("empresa_id", atual.id).order("cliente_id"), 20000),
  ]);
  const erro = error ?? e2 ?? e3;
  if (erro) throw new Error(`Erro ao carregar as vendas: ${erro.message}`);
  const contato = new Map((clientes ?? []).map((c) => [c.id, c]));
  const r = resumoVendas(((data ?? []) as ItemVendido[]).map((i) => ({ ...i, cidade: contato.get(i.cliente_id)?.cidade, uf: contato.get(i.cliente_id)?.uf })));
  const abc = curvaAbc(r.clientes);
  const parados = clientesSemComprar((pedidos ?? []) as CompraCliente[], (clientes ?? []).filter((c) => !c.arquivado) as ClienteContato[], hoje, dias);

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo descricao={`Pedidos faturados e entregues: ${formatarMoeda(r.total)} · ${textoKg(r.kg, 0)} de peixe (${formatarNumero(r.kg / KG_CAIXA, 1)} caixas de ${KG_CAIXA} kg) · ${r.kg ? formatarMoeda(r.total / r.kg) : "–"} o kg em média`}>
        Relatório comercial
      </Titulo>
      <AbasRelatorio atual="/relatorios/vendas" />
      <div className="flex flex-wrap items-end gap-3">
        <form className="flex flex-wrap items-end gap-2">
          <Campo rotulo="De" id="de" name="de" type="month" defaultValue={de} />
          <Campo rotulo="Até" id="ate" name="ate" type="month" defaultValue={ate} />
          <input type="hidden" name="dias" value={dias} />
          <button type="submit" className="h-10 rounded-xl border border-borda bg-superficie px-3 text-sm">Aplicar</button>
        </form>
      </div>

      {r.total === 0 ? (
        <p className="text-sm text-texto-suave">Nenhuma venda faturada no período.</p>
      ) : (
        <>
          <Ranking titulo="Por mês" nome="Mês" linhas={r.meses} />
          <Ranking titulo="Por cliente (curva ABC)" nome="Cliente" linhas={abc}
            nota={`A: ${abc.filter((c) => c.abc === "A").length} clientes que somam 80% do faturamento · B: ${abc.filter((c) => c.abc === "B").length} até 95% · C: ${abc.filter((c) => c.abc === "C").length} no resto`} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Ranking titulo="Por classe de peixe" nome="Classe" linhas={r.classes} />
            <Ranking titulo="Por produto" nome="Produto" linhas={r.produtos} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Ranking titulo="Por cidade" nome="Cidade" linhas={r.cidades} />
            <Ranking titulo="Por estado" nome="UF" linhas={r.estados} />
          </div>
        </>
      )}

      <section id="sem-comprar" className="flex scroll-mt-6 flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Clientes sem comprar</h2>
            <p className="text-sm text-texto-suave">Quem já comprou e está há mais de {dias} dias sem pedido faturado. Vale uma ligação ou mensagem.</p>
          </div>
          <form className="flex items-end gap-2">
            <input type="hidden" name="de" value={de} />
            <input type="hidden" name="ate" value={ate} />
            <Campo rotulo="Há mais de (dias)" id="dias" name="dias" type="number" min={1} max={3650} defaultValue={dias} className="w-32" />
            <button type="submit" className="h-10 rounded-xl border border-borda bg-superficie px-3 text-sm">Aplicar</button>
          </form>
        </div>
        <Tabela cabecalho={["Cliente", "Cidade", "Última compra", "Dias sem comprar", "Pedidos", "Total comprado", ""]}
          direita={["Dias sem comprar", "Pedidos", "Total comprado"]} total={parados.length}
          vazio={`Nenhum cliente parado há mais de ${dias} dias.`}>
          {parados.map((c) => (
            <tr key={c.id} className="tabular-nums">
              <td>{c.nome}</td>
              <td>{[c.cidade, c.uf].filter(Boolean).join("/") || "–"}</td>
              <td>{formatarData(c.ultimaCompra)}</td>
              <td className="text-right">{formatarInteiro(c.dias)}</td>
              <td className="text-right">{formatarInteiro(c.pedidos)}</td>
              <td className="text-right">{formatarMoeda(c.total)}</td>
              <td className="text-right">
                {c.telefone ? (
                  <a href={linkWhatsapp(c.telefone, `Olá, ${c.nome}! Tudo bem? Faz um tempo que não recebemos seu pedido de peixe. Posso separar o de sempre?`)}
                    target="_blank" rel="noopener noreferrer" className={classeBotao("secundario", "sm")}>WhatsApp</a>
                ) : null}
              </td>
            </tr>
          ))}
        </Tabela>
      </section>
    </div>
  );
}

type Linha = ReturnType<typeof resumoVendas>["clientes"][number] & { abc?: "A" | "B" | "C" };

function Ranking({ titulo, nome, linhas, nota }: { titulo: string; nome: string; linhas: Linha[]; nota?: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {nota && <p className="-mt-1 text-sm text-texto-suave">{nota}</p>}
      <div className="relative overflow-x-auto vidro rounded-2xl border border-borda">
        <table className="w-full text-right text-sm tabular-nums">
          <thead className="bg-elevado/40 text-xs text-texto-suave">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{nome}</th>
              <th className="px-3 py-2 font-medium">Faturado</th>
              <th className="px-3 py-2 font-medium">% do total</th>
              <th className="px-3 py-2 font-medium">Kg</th>
              <th className="px-3 py-2 font-medium">Caixas de {KG_CAIXA} kg</th>
              <th className="px-3 py-2 font-medium">Preço médio do kg</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} className="border-t border-borda/50">
                <td className="px-3 py-1.5 text-left">
                  {l.abc && <Etiqueta tom={TOM_ABC[l.abc]} className="mr-2">{l.abc}</Etiqueta>}{l.nome}
                </td>
                <td className="px-3 py-1.5">{formatarMoeda(l.total)}</td>
                <td className="px-3 py-1.5">{formatarNumero(l.participacao, 1)}%</td>
                <td className="px-3 py-1.5">{numeroKg(l.kg, 1)}</td>
                <td className="px-3 py-1.5">{formatarNumero(l.kg / KG_CAIXA, 1)}</td>
                <td className="px-3 py-1.5">{l.precoKg === null ? "–" : formatarMoeda(l.precoKg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
