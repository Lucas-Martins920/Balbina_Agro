# Convenções: como escrever código no Balbina

O sistema inteiro está em **português do Brasil**: telas, nomes de função, de tabela, de variável e os comentários. Siga o padrão dos arquivos vizinhos. Antes de criar um utilitário, procure no [mapa](../mapa-codigo/indice.md). Data, mês e texto, por exemplo, já estão em `src/lib/formato.ts`.

## Uma tela nova

```
src/app/(app)/<modulo>/
  page.tsx      Server Component: exigirAcesso + consultas + layout
  actions.ts    "use server": gravações
  lista.tsx     (opcional) parte interativa, "use client"
```

1. **Registre o módulo** em `GRUPOS` (`src/lib/modulos.ts`), que é o menu e a base das permissões. Se precisar de ações além de `ver` e `editar`, declare em `ACOES` (`src/lib/permissoes-regras.ts`). A permissão também precisa existir no banco (perfis em `app.permissoes_perfil` e plano em `niveis_plano`), por migration.
2. **`page.tsx`** começa assim:

   ```tsx
   export default async function PaginaX() {
     await exigirAcesso("x");                 // sem x.ver → /sem-acesso
     const { pode } = await getPermissoes();  // para esconder botões
     const { atual } = await getEmpresaAtual();
     const supabase = await createClient();   // JWT do usuário: passa pelo RLS
     const { data } = await supabase.from("x").select("...").eq("empresa_id", atual.id);
     return <Titulo descricao="...">X</Titulo>;
   }
   ```

3. **Visual**: só os primitivos de `src/components/ui.tsx` (`Titulo`, `Secao`, `Cartao`, `Tabela`, `Campo`, `Selecao`, `Botao`, `Aviso`, `Etiqueta`, `CartaoKpi`...) e os tokens de `globals.css`. Nada de cor fixa. Regras em [`DESIGN.md`](../../DESIGN.md).
4. **Lançamentos** seguem o padrão do botão no alto + gaveta (`src/components/lancamento.tsx`). Uma lista de cadastro tem "+ Novo", ordenação e contagem.
5. Inclua a tela em `e2e/telas.spec.ts` (o teste de fumaça abre todas) e, se fizer sentido, um tutorial em `src/lib/tutoriais.ts`.
6. Rode `npm run mapa` para o mapa do código pegar a tela nova.

## Uma server action

```ts
"use server";
export async function salvarX(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome) return falha("Informe o nome.");             // mensagem para a pessoa, em português
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("x").insert({ empresa_id: atual.id, nome });
  if (error) return falha(mensagemBanco(error));          // 23505, RLS etc. viram texto legível
  revalidatePath("/x");
  return sucesso("Salvo.");
}
```

- Na tela, use `<FormAcao acao={salvarX} botao="Salvar">` (`src/components/form-acao.tsx`). Ele mostra erro e sucesso e limpa o formulário.
- **Nunca confie na tela.** A regra que importa vai também no banco (constraint, trigger ou função). A action só dá a mensagem mais cedo.
- Operação com várias tabelas ou que precisa ser atômica vira uma **função SQL** chamada por `.rpc()`, e não várias chamadas do app.
- Antes de chamar um serviço externo (Asaas, Focus, Pluggy, IA), cheque `getPermissoes().pode(...)` ou `foraDoPlano(...)`.
- Arquivos com segredo ou acesso ao banco começam com `import "server-only"`.

## Regras puras em `src/lib`

Cálculos sem banco (rateio, OFX, boleto, custo, indicadores, textos de WhatsApp...) ficam em `src/lib/<assunto>.ts`, com o teste ao lado em `<assunto>.test.ts` (`node:test`, sem framework):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerRateio } from "./rateio.ts";   // import com .ts: roda com --experimental-strip-types
test("rateio soma o total", () => { assert.equal(/* ... */, /* ... */); });
```

O padrão de nomes é `<assunto>.ts` para a regra pura, `<assunto>-dados.ts` para as consultas ao banco e `<assunto>-mapa.ts` para converter de/para um provedor externo.

## Uma migration

Arquivo novo em `supabase/migrations/AAAAMMDDHHMMSS_descricao.sql`. O **prefixo da versão precisa ser único** (dois arquivos com a mesma versão quebram o deploy). **Nunca edite uma migration antiga**: crie outra. A última definição de uma função é a que vale.

Toda tabela nova com `empresa_id`:

```sql
create table x (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  valor_cents bigint not null default 0,          -- dinheiro em centavos
  created_at timestamptz not null default now()
);
create index on x (empresa_id);                    -- toda FK com índice (99_lapidacao.sql confere)
alter table x enable row level security;
-- uma só policy permissiva (membros); as travas de escrita são restritivas, uma por ação
create policy membros on x using (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on x as restrictive for insert with check (app.pode(empresa_id, 'x.editar'));
create policy escrita_alterar on x as restrictive for update using (app.pode(empresa_id, 'x.editar'));
create policy escrita_apagar  on x as restrictive for delete using (app.pode(empresa_id, 'x.editar'));

select app.travar_referencias();   -- obrigatório no fim: FKs presas à mesma empresa
```

- `select app.travar_referencias();` no fim é obrigatório. O teste `99_isolamento_empresas.sql` falha sem ele.
- `99_lapidacao.sql` confere índice em toda FK, `auth.uid()` embrulhado em `(select auth.uid())` nas policies e uma única policy permissiva por ação.
- O histórico de alterações liga sozinho em toda tabela com `empresa_id` (`app.ligar_historico`). Para ficar de fora, use `app.tabelas_sem_historico()`. Dê um nome legível à tabela em `TABELAS` (`src/lib/historico.ts`).
- Funções `security definer` levam `set search_path = public` e conferem a permissão por dentro (`app.pode`/`app.exige_master`). Revogue o acesso público quando a função não é para ser chamada pelo app (`revoke all on function ... from public`). `99_funcoes_sem_anon.sql` confere que `anon` não executa nada.
- "Hoje" é sempre `app.hoje(empresa_id)`, nunca `current_date`.
- Cada regra nova ganha um teste em `supabase/tests/99_<assunto>.sql` (ver [testes-e-operacao.md](testes-e-operacao.md)).

## Textos e mensagens

- A interface fala com o produtor: frases curtas, sem termo técnico ("Seu usuário não tem permissão para esta ação..."). O banco já levanta exceções em português, e elas aparecem para a pessoa.
- Comentários explicam o **porquê** (a regra de negócio, o pedido do Nicolas, o bug que motivou). Não explicam o óbvio.

## Commits

O fluxo não usa PR por feature. A **mensagem do commit é o registro da mudança**: escreva em português, dizendo o que mudou e por quê. Detalhes em [`docs/fluxo-de-trabalho.md`](../fluxo-de-trabalho.md).
