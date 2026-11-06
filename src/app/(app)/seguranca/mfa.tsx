"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Aviso, Botao, Campo, Cartao, Etiqueta } from "@/components/ui";
import { clienteNavegador } from "@/lib/supabase/client";
import { formatarData } from "@/lib/formato";
import { manterSessaoAoDesativarApp } from "./actions";

type Fator = { id: string; criado: string };
type Cadastro = { id: string; qr: string; segredo: string };

// Autenticador confirmado da conta (só um por pessoa).
async function lerFator(): Promise<Fator | null> {
  const { data } = await clienteNavegador().auth.mfa.listFactors();
  const f = data?.totp[0];
  return f ? { id: f.id, criado: f.created_at } : null;
}

// Verificação em duas etapas com app autenticador (Google Authenticator, Microsoft Authenticator,
// Authy…). Depois de ativada, todo login pede o código do app, e o banco só libera os dados com ele.
export function VerificacaoDuasEtapas() {
  const router = useRouter();
  const [fator, setFator] = useState<Fator | null | undefined>(undefined);
  const [cadastro, setCadastro] = useState<Cadastro | null>(null);
  const [erro, setErro] = useState("");
  const [pendente, setPendente] = useState(false);

  async function carregar() {
    setFator(await lerFator());
  }

  useEffect(() => {
    lerFator().then(setFator);
  }, []);

  async function ativar() {
    setErro("");
    setPendente(true);
    const supabase = clienteNavegador();
    // cadastro anterior que ficou pela metade (QR gerado e nunca confirmado)
    const { data: todos } = await supabase.auth.mfa.listFactors();
    for (const f of todos?.all ?? []) {
      if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Balbina", issuer: "Balbina" });
    setPendente(false);
    if (error || !data) return setErro(`Não foi possível iniciar o cadastro: ${error?.message ?? "tente de novo"}`);
    setCadastro({ id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret });
  }

  async function confirmar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cadastro) return;
    const codigo = String(new FormData(e.currentTarget).get("codigo") ?? "").replace(/\D/g, "");
    if (codigo.length !== 6) return setErro("Digite os 6 números que aparecem no app autenticador.");
    setErro("");
    setPendente(true);
    const { error } = await clienteNavegador().auth.mfa.challengeAndVerify({ factorId: cadastro.id, code: codigo });
    setPendente(false);
    if (error) return setErro("Código inválido ou expirado. Confira o horário do celular e tente o código atual.");
    setCadastro(null);
    await carregar();
    router.refresh();
  }

  async function desativar() {
    if (!fator || !confirm("Desativar o app autenticador? O login passará a pedir um código enviado para o seu e-mail.")) return;
    setErro("");
    setPendente(true);
    await manterSessaoAoDesativarApp();
    const supabase = clienteNavegador();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: fator.id });
    setPendente(false);
    if (error) return setErro(`Não foi possível desativar: ${error.message}`);
    await supabase.auth.refreshSession();
    await carregar();
    router.refresh();
  }

  if (fator === undefined) {
    return <Cartao titulo="Verificação em duas etapas"><p className="text-sm text-texto-suave">Carregando…</p></Cartao>;
  }

  if (fator) {
    return (
      <Cartao
        titulo="Verificação em duas etapas"
        icone={ShieldCheck}
        cor="verde"
        acoes={<Etiqueta tom="positivo">Ativa</Etiqueta>}
      >
        <div className="flex flex-col gap-4 text-sm">
          <p>
            Desde {formatarData(fator.criado.slice(0, 10))}, cada login pede a senha e o código do app autenticador do seu celular. O código por e-mail não vale para a sua conta enquanto o app estiver ativo.
          </p>
          {erro && <Aviso>{erro}</Aviso>}
          <div>
            <Botao type="button" variante="perigo" tamanho="sm" onClick={desativar} disabled={pendente}>
              Voltar para o código por e-mail
            </Botao>
          </div>
        </div>
      </Cartao>
    );
  }

  return (
    <Cartao titulo="Verificação em duas etapas" icone={ShieldCheck} acoes={<Etiqueta tom="info">Código por e-mail</Etiqueta>}>
      {!cadastro ? (
        <div className="flex flex-col gap-4 text-sm">
          <p>
            Hoje, além da senha, cada login pede um código que enviamos para o seu e-mail.
          </p>
          <p>
            Prefere o celular? Com um app autenticador o código aparece no app, muda a cada 30 segundos e não depende do e-mail.
            Mesmo que alguém invada seu e-mail, não entra sem o celular.
          </p>
          <p className="text-texto-suave">
            Funciona com Google Authenticator, Microsoft Authenticator ou Authy, todos gratuitos.
          </p>
          {erro && <Aviso>{erro}</Aviso>}
          <div>
            <Botao type="button" onClick={ativar} disabled={pendente}>{pendente ? "Aguarde…" : "Usar app autenticador"}</Botao>
          </div>
        </div>
      ) : (
        <form onSubmit={confirmar} className="flex flex-col gap-4 text-sm">
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            <li>Abra o app autenticador e toque em adicionar conta.</li>
            <li>Leia o QR code abaixo com a câmera do app.</li>
            <li>Digite o código de 6 números que o app mostrar.</li>
          </ol>
          {/* QR em SVG gerado pelo Supabase; fundo branco para a câmera ler também no tema escuro */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cadastro.qr} alt="QR code para o app autenticador" width={180} height={180} className="rounded-xl bg-white p-2" />
          <p className="text-texto-suave">
            Sem câmera? Digite esta chave no app: <code className="font-mono break-all text-texto select-all">{cadastro.segredo}</code>
          </p>
          <div className="max-w-56">
            <Campo
              rotulo="Código do app"
              id="codigo"
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              placeholder="000000"
              required
              className="text-center font-mono text-lg tracking-[0.3em]"
            />
          </div>
          {erro && <Aviso>{erro}</Aviso>}
          <div className="flex gap-2">
            <Botao type="submit" disabled={pendente}>{pendente ? "Conferindo…" : "Confirmar e ativar"}</Botao>
            <Botao type="button" variante="fantasma" onClick={() => { setCadastro(null); setErro(""); }}>Cancelar</Botao>
          </div>
        </form>
      )}
    </Cartao>
  );
}
