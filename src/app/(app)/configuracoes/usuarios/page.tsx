import { colunasDosCargos, MatrizPermissoes, type Cargo } from "@/components/permissoes-cargos";
import { Segmentos, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirMaster } from "@/lib/permissoes";
import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ListaCargos, ListaUsuarios, type Convite, type LoginLocal, type Membro } from "./lista";

const ABAS = { usuarios: "Usuários", cargos: "Cargos", permissoes: "Quem pode o quê" } as const;
type Aba = keyof typeof ABAS;

export default async function PaginaUsuarios({ searchParams }: PageProps<"/configuracoes/usuarios">) {
  await exigirMaster();
  const { aba: pedida } = await searchParams;
  const aba: Aba = typeof pedida === "string" && pedida in ABAS ? (pedida as Aba) : "usuarios";
  const usuario = await getUsuario();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: m }, { data: c }, { data: presets }, { data: g }, { data: l }] = await Promise.all([
    supabase.from("usuarios_empresa").select("user_id, email, nome, perfil, cargo_id, is_admin, ativo, permissoes, created_at").eq("empresa_id", atual.id).order("created_at"),
    supabase.from("convites").select("id, email, nome, perfil, cargo_id, is_admin, created_at").eq("empresa_id", atual.id).order("created_at"),
    supabase.rpc("permissoes_dos_perfis"),
    supabase.from("cargos").select("id, nome, descricao, permissoes").eq("empresa_id", atual.id).order("nome"),
    supabase.from("logins_locais").select("user_id, login, dispensa_2fa, trocar_senha").eq("empresa_id", atual.id),
  ]);
  const membros = (m ?? []) as Membro[];
  const convites = (c ?? []) as Convite[];
  const cargos = (g ?? []) as Cargo[];
  const logins = (l ?? []) as LoginLocal[];
  const chavesPerfil = (presets ?? {}) as Record<string, string[]>;

  const contagem: Record<Aba, number | null> = { usuarios: membros.length + convites.length, cargos: cargos.length || null, permissoes: null };

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo descricao="Quem acessa a empresa, com que cargo e o que cada cargo pode fazer. Só o usuário master vê esta tela.">
        Usuários e cargos
      </Titulo>

      <Segmentos rotulo="Parte da tela" opcoes={(Object.keys(ABAS) as Aba[]).map((a) => ({
        href: a === "usuarios" ? "/configuracoes/usuarios" : `/configuracoes/usuarios?aba=${a}`,
        ativo: a === aba,
        nome: <>{ABAS[a]}{contagem[a] !== null && <span className="ml-1.5 text-texto-suave tabular-nums">{contagem[a]}</span>}</>,
      }))} />

      {aba === "usuarios" && (
        <ListaUsuarios membros={membros} convites={convites} logins={logins} cargos={cargos} chavesPerfil={chavesPerfil} eu={usuario.id} />
      )}
      {aba === "cargos" && <ListaCargos cargos={cargos} chavesPerfil={chavesPerfil} membros={membros} />}
      {aba === "permissoes" && <MatrizPermissoes colunas={colunasDosCargos(cargos, chavesPerfil)} />}
    </div>
  );
}
