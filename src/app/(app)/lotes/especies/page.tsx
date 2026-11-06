import Link from "next/link";
import { BotaoLancamento } from "@/components/lancamento";
import { AreaTexto, Campo, classeBotao, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";
import { criarEspecie, salvarCurva } from "../actions";
import { exigirAcesso } from "@/lib/permissoes";
import { textoPeso } from "@/lib/pescado";

export default async function PaginaEspecies() {
  await exigirAcesso("lotes");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: especies }, { data: curvas }] = await Promise.all([
    supabase.from("especies").select("id, nome, nome_cientifico, empresa_id").or(`empresa_id.is.null,empresa_id.eq.${atual.id}`).order("nome"),
    supabase.from("curvas_crescimento").select("especie_id, semana, peso_g").limit(5000),
  ]);
  const semanas = new Map<string, { n: number; max: number }>();
  for (const c of curvas ?? []) {
    const v = semanas.get(c.especie_id) ?? { n: 0, max: 0 };
    semanas.set(c.especie_id, { n: v.n + 1, max: Math.max(v.max, Number(c.peso_g ?? 0)) });
  }
  const proprias = (especies ?? []).filter((l) => l.empresa_id === atual.id);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Titulo descricao="A curva de crescimento é o peso esperado por semana de cultivo. Ela estima o peso do lote entre uma biometria e outra, sugere a ração e prevê a despesca. A do tambaqui vem pronta (Embrapa); para outra espécie, crie a sua e cole a curva."
        acoes={
          <>
            <Link href="/lotes" className={classeBotao("secundario", "sm")}>Voltar aos lotes</Link>
            {proprias.length > 0 && (
              <BotaoLancamento rotulo="Colar curva de crescimento" titulo="Curva de crescimento" acao={salvarCurva} botao="Salvar curva" variante="secundario" icone={null}>
              <Selecao rotulo="Espécie" id="curva_especie" name="especie_id" required>
                {proprias.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </Selecao>
              <AreaTexto rotulo="Uma semana por linha: semana; peso (g); ração (% do peso vivo por dia); refeições por dia; proteína (%); ração (g/peixe/dia); sobrevivência (%)"
                id="curva" name="curva" rows={10} placeholder={"1;0,5;20;6;55\n10;31,4;5,7;4;40\n20;324;2,1;3;28"} required />
              <p className="text-xs text-texto-suave">Só semana e peso são obrigatórios. Semana 1 é a do povoamento de pós-larva; lote povoado maior entra na curva pelo próprio peso. Dá para colar direto de uma planilha (colunas separadas por tab). Semanas que já existem são atualizadas.</p>
            </BotaoLancamento>
            )}
            <BotaoLancamento rotulo="Nova espécie" acao={criarEspecie} botao="Criar espécie"
              descricao="Só o tambaqui do catálogo tem curva. Para acompanhar outra espécie ou a sua própria curva (ex.: “Tambaqui viveiro 3 com aeração”), crie a espécie e cole a curva.">
            <Campo rotulo="Nome" id="especie_nome" name="nome" required />
            <Campo rotulo="Nome científico" id="especie_cientifico" name="nome_cientifico" placeholder="Ex.: Colossoma macropomum" />
          </BotaoLancamento>
          </>
        }>
        Espécies e curvas padrão
      </Titulo>

      <Tabela cabecalho={["Espécie", "Nome científico", "Origem", "Semanas na curva", "Peso no fim da curva"]} direita={["Semanas na curva", "Peso no fim da curva"]} total={especies?.length ?? 0}>
        {(especies ?? []).map((l) => (
          <tr key={l.id}>
            <td className="font-medium">{l.nome}</td>
            <td className="italic text-texto-suave">{l.nome_cientifico ?? "–"}</td>
            <td>{l.empresa_id ? "Sua" : "Catálogo"}</td>
            <td className="text-right tabular-nums">{semanas.get(l.id)?.n ?? 0}</td>
            <td className="text-right tabular-nums">{semanas.get(l.id) ? textoPeso(semanas.get(l.id)!.max) : "–"}</td>
          </tr>
        ))}
      </Tabela>
      <p className="text-xs text-texto-suave">
        Curva do tambaqui: ajustada aos pontos publicados pela Embrapa (Corrêa et al., Criação de tambaquis, 2018: alevinagem e tabela de arraçoamento;
        Izel et al., Circular Técnica 39, 2013: de 160 g a 2,62 kg em 10 meses em viveiro escavado com aeração). É uma referência: ajuste à sua realidade criando a sua.
      </p>

    </div>
  );
}
