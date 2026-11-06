"use client";

import { useActionState, useEffect, useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { AbasFiltro, FormPainel, ListaCadastro, Marcar, SecaoForm, useFecharPainel, type LinhaCadastro } from "@/components/cadastro";
import { FormAcao } from "@/components/form-acao";
import { chavesDoValorCargo, nomeDoCargo, OpcoesCargo, valorCargo, type Cargo } from "@/components/permissoes-cargos";
import { EscolhaPermissoes } from "@/components/permissoes-visual";
import { Aviso, AreaTexto, Botao, Campo, Etiqueta, Selecao } from "@/components/ui";
import type { EstadoAcao } from "@/lib/acao";
import { formatarData } from "@/lib/formato";
import { CATALOGO, PERFIS, podeDispensar2fa, temPermissao, type Acesso } from "@/lib/permissoes-regras";
import {
  apagarCargo, atualizarUsuario, cancelarConvite, convidarUsuario, criarLoginLocal, definirDispensa2fa, novaSenhaLoginLocal,
  removerUsuario, salvarCargo, zerarAppLoginLocal,
} from "./actions";

export type Membro = { user_id: string; email: string | null; nome: string | null; perfil: string; cargo_id: string | null; is_admin: boolean; ativo: boolean; permissoes: string[]; created_at: string };
export type Convite = { id: string; email: string; nome: string | null; perfil: string; cargo_id: string | null; is_admin: boolean; created_at: string };
export type LoginLocal = { user_id: string; login: string; dispensa_2fa: boolean; trocar_senha: boolean };

type Base = { cargos: Cargo[]; chavesPerfil: Record<string, string[]> };

const traco = <span className="text-texto-suave">–</span>;

function descricaoCargo(valor: string, cargos: Cargo[]) {
  if (valor.startsWith("cargo:")) return cargos.find((x) => `cargo:${x.id}` === valor)?.descricao ?? "Cargo criado pela empresa.";
  return PERFIS[valor]?.descricao ?? "";
}

// Cargo do formulário com a explicação do que ele faz logo abaixo; avisa quem está em volta quando muda.
function EscolhaCargo({ id, valor, aoMudar, cargos }: { id: string; valor: string; aoMudar: (v: string) => void; cargos: Cargo[] }) {
  return (
    <Selecao rotulo="Cargo" id={id} name="cargo" value={valor} onChange={(e) => aoMudar(e.target.value)} ajuda={descricaoCargo(valor, cargos)}>
      <OpcoesCargo cargos={cargos} />
    </Selecao>
  );
}

// ---------- Usuários ----------

function FormAcesso({ u, login, cargos, chavesPerfil, voce }: Base & { u: Membro; login?: LoginLocal; voce: boolean }) {
  const [cargo, setCargo] = useState(valorCargo(u));
  const [master, setMaster] = useState(u.is_admin);
  const perfil = cargo.startsWith("cargo:") ? "personalizado" : cargo;
  return (
    <FormPainel acao={atualizarUsuario} excluir={removerUsuario} botao="Salvar acesso"
      confirmacao={login ? `Remover ${u.nome ?? login.login} e apagar o login? Não dá para desfazer.` : `Remover ${u.nome ?? u.email ?? "esta pessoa"} da empresa?`}>
      <input type="hidden" name="user_id" value={u.user_id} />
      <SecaoForm titulo="Pessoa">
        <Campo rotulo="Nome" id={`nome-${u.user_id}`} name="nome" defaultValue={u.nome ?? ""} maxLength={120} />
        <p className="flex items-center gap-2 text-sm text-texto-suave">
          {login ? <KeyRound size={16} strokeWidth={1.75} aria-hidden /> : <Mail size={16} strokeWidth={1.75} aria-hidden />}
          {login ? <span>Entra com o usuário <span className="font-mono text-texto">{login.login}</span></span> : <span>Entra com o e-mail <span className="text-texto">{u.email ?? "–"}</span></span>}
        </p>
      </SecaoForm>
      <SecaoForm titulo="Cargo e acesso">
        <EscolhaCargo id={`cargo-${u.user_id}`} valor={cargo} aoMudar={setCargo} cargos={cargos} />
        <Marcar rotulo="Master" ajuda="Gerencia usuários e cargos e pode tudo no sistema." name="master" checked={master} onChange={(e) => setMaster(e.target.checked)} />
        <Marcar rotulo="Acesso ativo" ajuda={voce ? "Este é o seu acesso: cuidado para não se bloquear." : "Desmarque para bloquear a entrada sem apagar a pessoa."} name="ativo" defaultChecked={u.ativo} />
      </SecaoForm>
      <EscolhaPermissoes marcadas={u.permissoes} prefixo={u.user_id} herdadas={chavesDoValorCargo(cargo, cargos, chavesPerfil)}
        tudo={master || perfil === "sem_restricao"} ajuda="Somam ao cargo. Abra um grupo para marcar o que mais esta pessoa pode fazer." />
    </FormPainel>
  );
}

function FormLogin({ u, login, acesso }: { u: Membro; login: LoginLocal; acesso: Acesso }) {
  const pode = podeDispensar2fa(acesso);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
      <SecaoForm titulo="Senha">
        <FormAcao acao={novaSenhaLoginLocal} botao="Definir senha nova">
          <input type="hidden" name="user_id" value={u.user_id} />
          <Campo rotulo="Senha nova" id={`senha-${u.user_id}`} name="senha" type="password" autoComplete="new-password" minLength={8} required
            ajuda="Para quem esqueceu a senha. A pessoa troca por uma dela no próximo acesso." />
        </FormAcao>
      </SecaoForm>
      <SecaoForm titulo="Segundo fator">
        <FormAcao acao={definirDispensa2fa} botao="Salvar 2º fator" variante="secundario" limparAoSalvar={false}>
          <input type="hidden" name="user_id" value={u.user_id} />
          <Marcar rotulo="Liberar sem 2º fator" name="sem_2fa" defaultChecked={login.dispensa_2fa && pode} disabled={!pode}
            ajuda={pode ? "Só para cargo operacional (viveiro, ração, manutenção)." : "Este acesso mexe em financeiro, notas ou configurações: o app autenticador é obrigatório."} />
        </FormAcao>
      </SecaoForm>
      <SecaoForm titulo="Perdeu o celular">
        <p className="text-sm text-texto-suave">Apaga o app autenticador cadastrado. No próximo acesso a pessoa cadastra o app de novo.</p>
        <FormAcao acao={zerarAppLoginLocal} botao="Zerar app autenticador" variante="secundario">
          <input type="hidden" name="user_id" value={u.user_id} />
        </FormAcao>
      </SecaoForm>
    </div>
  );
}

function PainelUsuario(props: Base & { u: Membro; login?: LoginLocal; voce: boolean }) {
  const [aba, setAba] = useState<"acesso" | "login">("acesso");
  const { u, login, cargos, chavesPerfil } = props;
  if (!login) return <FormAcesso {...props} />;
  const acesso: Acesso = {
    master: u.is_admin, perfil: u.perfil, total: u.perfil === "sem_restricao",
    chaves: [...(chavesPerfil[u.perfil] ?? []), ...(cargos.find((x) => x.id === u.cargo_id)?.permissoes ?? []), ...u.permissoes],
  };
  return (
    <>
      <div className="px-5 pt-3">
        <AbasFiltro rotulo="Parte do cadastro" valor={aba} aoMudar={setAba}
          opcoes={[{ valor: "acesso", nome: "Cargo e permissões" }, { valor: "login", nome: "Senha e 2º fator" }]} />
      </div>
      {aba === "acesso" ? <FormAcesso {...props} /> : <FormLogin u={u} login={login} acesso={acesso} />}
    </>
  );
}

function FormNovoUsuario({ cargos, chavesPerfil }: Base) {
  const [modo, setModo] = useState<"login" | "email">("login");
  const [cargo, setCargo] = useState("tratador");
  const [master, setMaster] = useState(false);
  const herdadas = chavesDoValorCargo(cargo, cargos, chavesPerfil);
  const perfil = cargo.startsWith("cargo:") ? "personalizado" : cargo;
  const pode = podeDispensar2fa({ master: false, perfil, chaves: herdadas });
  const [semFator, setSemFator] = useState(true);

  return (
    <>
      <div className="flex flex-col gap-2 px-5 pt-3">
        <AbasFiltro rotulo="Como a pessoa entra" valor={modo} aoMudar={setModo}
          opcoes={[{ valor: "login", nome: "Usuário e senha" }, { valor: "email", nome: "Convite por e-mail" }]} />
        <p className="text-xs text-texto-suave">
          {modo === "login"
            ? "Para quem não tem e-mail: a pessoa entra digitando o usuário no lugar do e-mail e troca a senha no primeiro acesso."
            : "Quem já tem conta entra na hora. Quem não tem recebe um e-mail com o link para definir a senha."}
        </p>
      </div>
      {modo === "login" ? (
        <FormPainel acao={criarLoginLocal} botao="Criar login">
          <SecaoForm titulo="Pessoa">
            <Campo rotulo="Nome" id="loc_nome" name="nome" placeholder="Zé do viveiro 2" maxLength={120} required />
            <Campo rotulo="Usuário" id="loc_login" name="login" placeholder="ze.viveiro" autoComplete="off" autoCapitalize="none" spellCheck={false}
              pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,29}" maxLength={30} required
              ajuda="De 3 a 30 letras sem acento, números, ponto ou hífen. É com ele que a pessoa entra." />
            <Campo rotulo="Senha inicial" id="loc_senha" name="senha" type="password" autoComplete="new-password" minLength={8} required
              ajuda="Passe para a pessoa; no primeiro acesso ela troca por uma senha dela." />
          </SecaoForm>
          <SecaoForm titulo="Cargo e segurança">
            <EscolhaCargo id="loc_cargo" valor={cargo} aoMudar={setCargo} cargos={cargos} />
            <Marcar rotulo="Liberar sem 2º fator" name="sem_2fa" checked={pode && semFator} disabled={!pode} onChange={(e) => setSemFator(e.target.checked)}
              ajuda={pode
                ? "Só para cargo operacional (viveiro, ração, manutenção)."
                : "Este cargo mexe em financeiro, notas ou configurações: a pessoa sempre usa o app autenticador, que funciona sem internet."} />
          </SecaoForm>
        </FormPainel>
      ) : (
        <FormPainel acao={convidarUsuario} botao="Convidar">
          <SecaoForm titulo="Pessoa">
            <Campo rotulo="Nome" id="conv_nome" name="nome" placeholder="Zé do viveiro 2" maxLength={120} />
            <Campo rotulo="E-mail" id="conv_email" name="email" type="email" placeholder="pessoa@piscicultura.com.br" required />
          </SecaoForm>
          <SecaoForm titulo="Cargo e acesso">
            <EscolhaCargo id="conv_cargo" valor={cargo} aoMudar={setCargo} cargos={cargos} />
            <Marcar rotulo="Master" ajuda="Gerencia usuários e cargos e pode tudo no sistema." name="master" checked={master} onChange={(e) => setMaster(e.target.checked)} />
          </SecaoForm>
          <EscolhaPermissoes prefixo="conv" herdadas={herdadas} tudo={master || perfil === "sem_restricao"}
            ajuda="Somam ao cargo. Abra um grupo para marcar o que mais esta pessoa pode fazer." />
        </FormPainel>
      )}
    </>
  );
}

// Convite pendente: só dá para ver e cancelar.
function PainelConvite({ cv, nomeCargo }: { cv: Convite; nomeCargo: string }) {
  const fechar = useFecharPainel();
  const [estado, enviar, enviando] = useActionState<EstadoAcao, FormData>(cancelarConvite, {});
  useEffect(() => {
    if (estado.versao) fechar(estado.ok);
  }, [estado.versao]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={enviar} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="id" value={cv.id} />
      <dl className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4 text-sm">
        {[["E-mail", cv.email], ["Nome", cv.nome ?? "–"], ["Cargo", nomeCargo + (cv.is_admin ? " · master" : "")], ["Convidado em", formatarData(cv.created_at.slice(0, 10))]].map(([r, v]) => (
          <div key={r} className="flex flex-col">
            <dt className="text-xs text-texto-suave">{r}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <p className="text-xs text-texto-suave">A pessoa entra na empresa quando criar a conta (ou entrar) com este e-mail. Cancelando, o convite deixa de valer.</p>
      </dl>
      <footer className="flex flex-col gap-3 border-t border-linha px-5 py-3">
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        <div className="flex items-center gap-2">
          <Botao type="button" variante="fantasma" onClick={() => fechar()}>Fechar</Botao>
          <Botao type="submit" variante="perigo" tamanho="sm" className="ml-auto" disabled={enviando}>{enviando ? "Cancelando…" : "Cancelar convite"}</Botao>
        </div>
      </footer>
    </form>
  );
}

export function ListaUsuarios({ membros, convites, logins, cargos, chavesPerfil, eu }: Base & {
  membros: Membro[]; convites: Convite[]; logins: LoginLocal[]; eu: string;
}) {
  const loginDe = new Map(logins.map((l) => [l.user_id, l]));
  const membroDe = new Map(membros.map((u) => [u.user_id, u]));
  const conviteDe = new Map(convites.map((c) => [`convite-${c.id}`, c]));
  const nomeCargo = (u: { perfil: string; cargo_id: string | null }) => nomeDoCargo(u, cargos) ?? "–";
  const comSecao = convites.length > 0;

  const linhasMembros: LinhaCadastro[] = membros.map((u) => {
    const login = loginDe.get(u.user_id);
    const nome = u.nome ?? login?.login ?? u.email ?? "–";
    return {
      id: u.user_id,
      secao: comSecao ? "Na empresa" : undefined,
      inativa: !u.ativo,
      busca: [u.nome, u.email, login?.login, nomeCargo(u), u.is_admin ? "master" : ""].filter(Boolean).join(" "),
      ordem: [nome, login?.login ?? u.email, nomeCargo(u), u.ativo ? "Ativo" : "Bloqueado"],
      celulas: [
        <span key="p" className="flex flex-col">
          <span className="flex flex-wrap items-center gap-1.5 font-medium text-texto">{nome}{u.user_id === eu && <Etiqueta>você</Etiqueta>}</span>
          <span className="text-xs text-texto-suave">desde {formatarData(u.created_at.slice(0, 10))}</span>
        </span>,
        <span key="a" className="flex max-w-full min-w-0 flex-col gap-1 text-[13px]">
          <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
            {login ? <KeyRound size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-texto-suave" /> : <Mail size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-texto-suave" />}
            <span className={`truncate ${login ? "font-mono" : ""}`}>{login ? login.login : u.email ?? "–"}</span>
          </span>
          {login && (
            <span className="flex flex-wrap gap-1">
              {login.dispensa_2fa ? <Etiqueta tom="alerta">sem 2º fator</Etiqueta> : <Etiqueta>app autenticador</Etiqueta>}
              {login.trocar_senha && <Etiqueta tom="info">troca a senha</Etiqueta>}
            </span>
          )}
        </span>,
        <span key="c" className="flex flex-wrap items-center gap-1.5">
          <span>{nomeCargo(u)}</span>
          {u.is_admin && <Etiqueta tom="info">master</Etiqueta>}
          {u.permissoes.length > 0 && <Etiqueta>+{u.permissoes.length} extra{u.permissoes.length === 1 ? "" : "s"}</Etiqueta>}
        </span>,
        u.ativo ? <Etiqueta key="s" tom="positivo">Ativo</Etiqueta> : <Etiqueta key="s" tom="perigo">Bloqueado</Etiqueta>,
      ],
    };
  });

  const linhasConvites: LinhaCadastro[] = convites.map((cv) => ({
    id: `convite-${cv.id}`,
    secao: "Convites pendentes",
    busca: [cv.nome, cv.email, nomeCargo(cv), "convite"].filter(Boolean).join(" "),
    ordem: [cv.nome ?? cv.email, cv.email, nomeCargo(cv), "Aguardando"],
    celulas: [
      <span key="p" className="flex flex-col">
        <span className="font-medium text-texto">{cv.nome ?? cv.email}</span>
        <span className="text-xs text-texto-suave">convidado em {formatarData(cv.created_at.slice(0, 10))}</span>
      </span>,
      <span key="a" className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-[13px]">
        <Mail size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-texto-suave" /><span className="truncate">{cv.email}</span>
      </span>,
      <span key="c" className="flex flex-wrap items-center gap-1.5">
        <span>{nomeCargo(cv)}</span>{cv.is_admin && <Etiqueta tom="info">master</Etiqueta>}
      </span>,
      <Etiqueta key="s" tom="alerta">Aguardando</Etiqueta>,
    ],
  }));

  return (
    <ListaCadastro
      colunas={["Pessoa", "Como entra", "Cargo", "Situação"]}
      buscaPlaceholder="Buscar por nome, e-mail, usuário ou cargo"
      vazio="Ninguém além de você ainda."
      rotuloNovo="Novo usuário"
      novo={{ titulo: "Novo usuário", conteudo: <FormNovoUsuario cargos={cargos} chavesPerfil={chavesPerfil} /> }}
      editar={(id) => {
        const cv = conviteDe.get(id);
        if (cv) return { titulo: `Convite para ${cv.nome ?? cv.email}`, conteudo: <PainelConvite cv={cv} nomeCargo={nomeCargo(cv)} /> };
        const u = membroDe.get(id);
        if (!u) return null;
        const login = loginDe.get(u.user_id);
        return {
          titulo: u.nome ?? login?.login ?? u.email ?? "Usuário",
          conteudo: <PainelUsuario u={u} login={login} cargos={cargos} chavesPerfil={chavesPerfil} voce={u.user_id === eu} />,
        };
      }}
      linhas={[...linhasMembros, ...linhasConvites]}
    />
  );
}

// ---------- Cargos ----------

// "Lança em 4 módulos · só vê 12": resumo do que o cargo pode, contado por módulo.
function resumoCargo(acesso: Acesso) {
  if (acesso.total) return "Tudo, menos gerenciar usuários";
  let lanca = 0;
  let ve = 0;
  for (const m of CATALOGO) {
    if (m.acoes.some((a) => !a.chave.endsWith(".ver") && temPermissao(acesso, a.chave))) lanca++;
    else if (m.acoes.some((a) => temPermissao(acesso, a.chave))) ve++;
  }
  const partes = [lanca && `lança em ${lanca} ${lanca === 1 ? "módulo" : "módulos"}`, ve && `só vê ${ve}`].filter(Boolean) as string[];
  if (partes.length === 0) return "Nada marcado";
  const texto = partes.join(" · ");
  return texto[0].toUpperCase() + texto.slice(1);
}

function FormCargo({ cargo, chavesPerfil }: { cargo?: Cargo; chavesPerfil: Record<string, string[]> }) {
  const [base, setBase] = useState("");
  return (
    <FormPainel acao={salvarCargo} excluir={cargo ? apagarCargo : undefined} botao={cargo ? "Salvar cargo" : "Criar cargo"}
      confirmacao={`Apagar o cargo ${cargo?.nome ?? ""}? Só dá para apagar cargo que ninguém usa.`}>
      {cargo && <input type="hidden" name="id" value={cargo.id} />}
      <SecaoForm titulo="Cargo">
        <Campo rotulo="Nome do cargo" id={cargo ? `cargo-nome-${cargo.id}` : "cargo-novo-nome"} name="nome" defaultValue={cargo?.nome}
          placeholder="Veterinário, Motorista, Encarregado..." maxLength={60} required />
        <AreaTexto rotulo="Descrição" id={cargo ? `cargo-desc-${cargo.id}` : "cargo-novo-desc"} name="descricao" defaultValue={cargo?.descricao ?? ""}
          placeholder="O que essa pessoa faz na piscicultura" maxLength={300} rows={2} className="font-sans" />
        {!cargo && (
          <Selecao rotulo="Começar de um cargo pronto" id="cargo-novo-base" name="base" value={base} onChange={(e) => setBase(e.target.value)}
            ajuda="O cargo novo recebe as permissões do cargo pronto mais as que você marcar abaixo.">
            <option value="">Nenhum (só o que eu marcar)</option>
            <OpcoesCargo cargos={[]} prontos={false} />
          </Selecao>
        )}
      </SecaoForm>
      <EscolhaPermissoes marcadas={cargo?.permissoes} prefixo={cargo ? `cargo-${cargo.id}` : "cargo-novo"} titulo="Permissões do cargo"
        herdadas={cargo ? undefined : chavesPerfil[base] ?? []}
        ajuda={cargo ? "Mudar o cargo muda o acesso de todos que o têm." : "Somam às do cargo pronto de partida."} />
    </FormPainel>
  );
}

export function ListaCargos({ cargos, chavesPerfil, membros }: Base & { membros: Membro[] }) {
  const porId = new Map(cargos.map((x) => [x.id, x]));
  const pessoas = (n: number) => (n === 0 ? traco : <span className="tabular-nums">{n}</span>);

  const daEmpresa: LinhaCadastro[] = cargos.map((x) => ({
    id: x.id,
    secao: "Cargos da empresa",
    busca: [x.nome, x.descricao].filter(Boolean).join(" "),
    ordem: [x.nome, null, membros.filter((u) => u.cargo_id === x.id).length],
    celulas: [
      <span key="n" className="flex flex-col">
        <span className="font-medium text-texto">{x.nome}</span>
        {x.descricao && <span className="text-xs text-texto-suave">{x.descricao}</span>}
      </span>,
      <span key="r" className="text-[13px]">{resumoCargo({ master: false, perfil: "personalizado", total: false, chaves: x.permissoes })}</span>,
      pessoas(membros.filter((u) => u.cargo_id === x.id).length),
    ],
  }));

  const prontos: LinhaCadastro[] = Object.entries(PERFIS).filter(([p]) => p !== "personalizado").map(([p, info]) => ({
    id: `pronto-${p}`,
    secao: "Cargos prontos (não mudam)",
    fixa: true,
    busca: `${info.nome} ${info.descricao}`,
    ordem: [info.nome, null, membros.filter((u) => !u.cargo_id && u.perfil === p).length],
    celulas: [
      <span key="n" className="flex flex-col">
        <span className="font-medium text-texto">{info.nome}</span>
        <span className="text-xs text-texto-suave">{info.descricao}</span>
      </span>,
      <span key="r" className="text-[13px]">{resumoCargo({ master: false, perfil: p, total: p === "sem_restricao", chaves: chavesPerfil[p] ?? [] })}</span>,
      pessoas(membros.filter((u) => !u.cargo_id && u.perfil === p).length),
    ],
  }));

  return (
    <ListaCadastro
      colunas={["Cargo", "O que pode", "Pessoas"]}
      direita={["Pessoas"]}
      buscaPlaceholder="Buscar cargo"
      rotuloNovo="Novo cargo"
      novo={{ titulo: "Novo cargo", conteudo: <FormCargo chavesPerfil={chavesPerfil} /> }}
      editar={(id) => {
        const x = porId.get(id);
        return x ? { titulo: x.nome, conteudo: <FormCargo cargo={x} chavesPerfil={chavesPerfil} /> } : null;
      }}
      linhas={[...daEmpresa, ...prontos]}
      rodape={<span>Os cargos prontos já vêm com as permissões certas. Para outra função, crie um cargo da empresa.</span>}
    />
  );
}
