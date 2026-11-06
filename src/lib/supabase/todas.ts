// O Supabase (PostgREST) devolve no máximo 1.000 linhas por consulta (max_rows em supabase/config.toml,
// igual na nuvem) e ignora um .limit() maior sem avisar. Toda soma ou relatório que pode passar disso lê
// por aqui, em páginas de 1.000. A consulta precisa de uma ordem estável (termine num campo único, como
// o id), senão uma linha pode cair em duas páginas ou em nenhuma.
export const PAGINA_SUPABASE = 1000;

type Resposta<T> = { data: T[] | null; error: { message: string } | null };
type Paginavel<T> = { range(de: number, ate: number): PromiseLike<Resposta<T>> };

// `montar` cria a consulta de novo a cada página (o builder do supabase-js só roda uma vez).
export async function lerTodas<T>(montar: () => Paginavel<T>, teto = 50_000): Promise<Resposta<T>> {
  const linhas: T[] = [];
  for (let de = 0; de < teto; de += PAGINA_SUPABASE) {
    const ate = Math.min(de + PAGINA_SUPABASE, teto) - 1;
    const { data, error } = await montar().range(de, ate);
    if (error) return { data: null, error };
    linhas.push(...(data ?? []));
    if ((data?.length ?? 0) < ate - de + 1) break;
  }
  return { data: linhas, error: null };
}
