import Link from "next/link";
import { BadgeDollarSign, Rocket, Sparkles, ChevronRight, Contact, Eraser, FileUp, FolderTree, Package, Pill, PlugZap, Tags, TriangleAlert, UsersRound, Warehouse, type LucideIcon } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Botao, Cartao, Selecao, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { FUSOS_BRASIL } from "@/lib/formato";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { retomarAssistente } from "../primeiros-passos/actions";
import { salvarApontarAgua, salvarFuso } from "./actions";

const ATALHOS: { href: string; nome: string; descricao: string; icone: LucideIcon; permissao?: string }[] = [
  { href: "/contatos", nome: "Clientes e fornecedores", descricao: "Documentos, endereços e produtor rural.", icone: Contact, permissao: "contatos" },
  { href: "/produtos", nome: "Produtos de venda", descricao: "Peixe por kg e em caixa, alevinos e outros itens com preço de venda.", icone: Package, permissao: "produtos" },
  { href: "/insumos", nome: "Insumos da piscicultura", descricao: "Ingredientes e ração, embalagens, vacinas e medicamentos.", icone: Package, permissao: "produtos" },
  { href: "/medicamentos", nome: "Medicamentos e vitaminas", descricao: "Dose por kg de ração ou por m³ de água, carência antes da despesca e baixa no estoque.", icone: Pill, permissao: "sanidade" },
  { href: "/tabelas-de-preco", nome: "Tabelas de preço", descricao: "Preço de venda: tabela padrão e tabelas por tipo de cliente.", icone: BadgeDollarSign, permissao: "vendas" },
  { href: "/categorias", nome: "Categorias", descricao: "Plano de categorias de entradas e saídas, que vira o DRE.", icone: Tags, permissao: "categorias" },
  { href: "/centros-de-custo", nome: "Centros de custo", descricao: "Onde cada gasto cai, até o custo por lote.", icone: FolderTree, permissao: "centros-de-custo" },
  { href: "/piscicultura", nome: "Piscicultura", descricao: "Setores e viveiros, com capacidade e sistema.", icone: Warehouse, permissao: "piscicultura" },
];

export default async function PaginaConfiguracoes() {
  await exigirAcesso("configuracoes");
  const { master, pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const itens = [
    ...ATALHOS.filter((a) => !a.permissao || pode(`${a.permissao}.ver`)),
    ...(pode("configuracoes.editar") ? [
      { href: "/configuracoes/automacoes", nome: "Automações", descricao: "O que o Balbina faz sozinho: apontamento pré-preenchido, lembretes, sugestões.", icone: Sparkles },
    ] : []),
    ...(master ? [
      { href: "/configuracoes/usuarios", nome: "Usuários e cargos", descricao: "Cadastre as pessoas da piscicultura e dê um cargo a cada uma: tratador, gerente, financeiro...", icone: UsersRound },
      { href: "/configuracoes/importar", nome: "Importar dados", descricao: "Planilha modelo para baixar, preencher e enviar, e listagem de clientes de outros sistemas.", icone: FileUp },
      { href: "/configuracoes/api", nome: "API e integrações", descricao: "Chaves de API e webhooks para ligar outros sistemas ao Balbina.", icone: PlugZap },
      { href: "/configuracoes/zerar-financeiro", nome: "Zerar financeiro", descricao: "Apaga lançamentos e conciliação e deixa todas as contas com saldo zero.", icone: Eraser },
      { href: "/configuracoes/zerar-sistema", nome: "Zerar todo o sistema", descricao: "Apaga produção, estoque, vendas, notas e financeiro desta empresa. Cadastros, usuários e configurações ficam.", icone: TriangleAlert },
    ] : []),
  ];

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Titulo descricao="Os cadastros que o resto do sistema usa.">Configurações</Titulo>
      <ul className="vidro divide-y divide-linha overflow-hidden rounded-2xl border border-borda">
        {itens.map(({ href, nome, descricao, icone: Icone }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-elevado/50">
              <Icone size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-texto-suave" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{nome}</span>
                <span className="text-[13px] text-texto-suave">{descricao}</span>
              </span>
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="text-texto-suave" />
            </Link>
          </li>
        ))}
      </ul>
      {master && (
        <Cartao
          titulo="Primeiros passos"
          descricao="O assistente que guia a piscicultura nova: viveiros, lotes, estoque inicial, contas, primeiro apontamento e equipe."
          icone={Rocket}
        >
          <form action={retomarAssistente}>
            <Botao type="submit" variante="secundario" tamanho="sm">Retomar o assistente</Botao>
          </form>
        </Cartao>
      )}
      <Cartao titulo="Qualidade da água no apontamento" descricao="Oxigênio, temperatura, pH, transparência e amônia medidos no viveiro. Entram nos alertas: com oxigênio abaixo de 3 mg/L o sistema avisa para suspender a ração e ligar o aerador.">
        {pode("configuracoes.editar") ? (
          <FormAcao acao={salvarApontarAgua} botao="Salvar" limparAoSalvar={false}>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" id="apontar_qualidade_agua" name="apontar_qualidade_agua" defaultChecked={atual.apontar_qualidade_agua} className="size-4 accent-marca" />
              Pedir a qualidade da água no apontamento (cada campo é opcional para quem lança)
            </label>
          </FormAcao>
        ) : (
          <p className="text-sm text-texto-suave">{atual.apontar_qualidade_agua ? "O apontamento pede a qualidade da água (opcional)." : "O apontamento não pede a qualidade da água."}</p>
        )}
      </Cartao>
      <Cartao titulo="Fuso horário">
        {pode("configuracoes.editar") ? (
          <FormAcao acao={salvarFuso} botao="Salvar" limparAoSalvar={false}>
            <Selecao rotulo="Fuso da piscicultura" id="fuso" name="fuso" defaultValue={atual.fuso} className="max-w-sm"
              ajuda="Define a virada do dia: vencimentos, painel, estoque, carência e relatórios.">
              {!(atual.fuso in FUSOS_BRASIL) && <option value={atual.fuso}>{atual.fuso}</option>}
              {Object.entries(FUSOS_BRASIL).map(([chave, nome]) => <option key={chave} value={chave}>{nome}</option>)}
            </Selecao>
          </FormAcao>
        ) : (
          <p className="text-sm text-texto-suave">{FUSOS_BRASIL[atual.fuso] ?? atual.fuso}</p>
        )}
      </Cartao>
    </div>
  );
}
