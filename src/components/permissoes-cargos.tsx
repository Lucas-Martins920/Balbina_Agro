// Peças de cargo da tela Usuários e cargos: opções de cargo, nomes e colunas da matriz
// (a escolha de permissões e a matriz ficam em permissoes-visual.tsx).
import { PERFIS } from "@/lib/permissoes-regras";
import type { ColunaMatriz } from "@/components/permissoes-visual";

export { EscolhaPermissoes, MatrizPermissoes, nivelDoModulo, type ColunaMatriz } from "@/components/permissoes-visual";

export type Cargo = { id: string; nome: string; descricao: string | null; permissoes: string[] };

// Cargos prontos e, se houver, os cargos criados pela empresa (valor "cargo:<id>").
export function OpcoesCargo({ cargos, prontos = true }: { cargos: Cargo[]; prontos?: boolean }) {
  const opcoesProntas = Object.entries(PERFIS).map(([v, p]) => <option key={v} value={v}>{p.nome}</option>);
  if (!prontos) return <>{opcoesProntas.filter((o) => o.key !== "personalizado" && o.key !== "sem_restricao")}</>;
  if (cargos.length === 0) return <>{opcoesProntas}</>;
  return (
    <>
      <optgroup label="Cargos da empresa">
        {cargos.map((g) => <option key={g.id} value={`cargo:${g.id}`}>{g.nome}</option>)}
      </optgroup>
      <optgroup label="Cargos prontos">{opcoesProntas}</optgroup>
    </>
  );
}

export const valorCargo = (u: { perfil: string | null; cargo_id: string | null }) => (u.cargo_id ? `cargo:${u.cargo_id}` : u.perfil ?? "");

export function nomeDoCargo(u: { perfil: string | null; cargo_id: string | null }, cargos: Cargo[]) {
  return (u.cargo_id && cargos.find((x) => x.id === u.cargo_id)?.nome) || (u.perfil ? PERFIS[u.perfil]?.nome ?? u.perfil : null);
}

// Colunas de cargo: os criados pela empresa e os prontos (menos o personalizado).
export function colunasDosCargos(cargos: Cargo[], chavesPerfil: Record<string, string[]>): ColunaMatriz[] {
  return [
    ...cargos.map((x) => ({ chave: x.id, nome: x.nome, acesso: { master: false, perfil: "personalizado", total: false, chaves: x.permissoes } })),
    ...Object.keys(PERFIS).filter((p) => p !== "personalizado")
      .map((p) => ({ chave: p, nome: PERFIS[p].nome, acesso: { master: false, perfil: p, total: p === "sem_restricao", chaves: chavesPerfil[p] ?? [] } })),
  ];
}

// Chaves que o cargo escolhido no formulário ("cargo:<id>" ou um cargo pronto) já dá.
export function chavesDoValorCargo(valor: string, cargos: Cargo[], chavesPerfil: Record<string, string[]>): string[] {
  if (valor.startsWith("cargo:")) return cargos.find((x) => `cargo:${x.id}` === valor)?.permissoes ?? [];
  return chavesPerfil[valor] ?? [];
}
