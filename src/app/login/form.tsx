"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Aviso, Botao, Campo, CLASSE_BOTAO_TEXTO, classeBotao } from "@/components/ui";
import { Captcha } from "@/components/captcha";
import { enviarLogin, type EstadoLogin } from "./actions";

type Modo = "entrar" | "criar" | "recuperar";

const BOTAO: Record<Modo, string> = { entrar: "Entrar", criar: "Criar conta", recuperar: "Enviar link" };
const CLASSE_LINK = classeBotao("secundario", "sm");

export function FormLogin({ voltar, aviso }: { voltar?: string; aviso?: string }) {
  const [modo, setModo] = useState<Modo>("entrar");
  // saiu da conta: o service worker apaga as telas guardadas da pessoa anterior (public/sw.js)
  useEffect(() => {
    navigator.serviceWorker?.controller?.postMessage({ tipo: "sair" });
  }, []);
  const [estado, acao, pendente] = useActionState<EstadoLogin, FormData>(enviarLogin, {});
  // Resposta que já não vale: a do modo anterior (ao trocar de modo) ou a da tentativa anterior (ao
  // enviar de novo). Some da tela até o servidor responder outra coisa.
  const [vencido, setVencido] = useState<EstadoLogin | null>(null);
  const mensagem = estado === vencido ? {} : estado;
  const trocarModo = (novo: Modo) => {
    setVencido(estado);
    setModo(novo);
  };

  return (
    <form action={acao} onSubmit={() => setVencido(estado)} className="flex flex-col gap-4">
      <input type="hidden" name="modo" value={modo} />
      <input type="hidden" name="voltar" value={voltar ?? ""} />
      {modo === "entrar" ? (
        // e-mail ou o usuário criado pelo master da piscicultura (quem não tem e-mail)
        <Campo rotulo="E-mail ou usuário" id="email" name="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      ) : (
        <Campo rotulo="E-mail" id="email" name="email" type="email" autoComplete="email" required />
      )}
      {modo !== "recuperar" && (
        <Campo
          rotulo="Senha"
          id="senha"
          name="senha"
          type="password"
          autoComplete={modo === "entrar" ? "current-password" : "new-password"}
          minLength={modo === "criar" ? 8 : undefined}
          required
        />
      )}
      {modo === "criar" && (
        <>
          <Campo rotulo="Confirme a senha" id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" minLength={8} required />
          <label className="flex items-start gap-2.5 text-sm text-texto-suave">
            <input type="checkbox" name="aceite" required className="mt-0.5 size-4 accent-marca" />
            <span>
              Li e aceito os <Link href="/termos" target="_blank" className={CLASSE_BOTAO_TEXTO}>Termos de uso</Link> e a{" "}
              <Link href="/privacidade" target="_blank" className={CLASSE_BOTAO_TEXTO}>Política de privacidade</Link>, incluindo a{" "}
              <Link href="/cookies" target="_blank" className={CLASSE_BOTAO_TEXTO}>Política de cookies</Link>.
            </span>
          </label>
        </>
      )}
      {modo === "recuperar" && (
        <p className="text-sm text-texto-suave">Enviaremos um link para você criar uma nova senha.</p>
      )}
      <Captcha renovar={estado} />
      {mensagem.erro && <Aviso>{mensagem.erro}</Aviso>}
      {mensagem.info && <Aviso tipo="info">{mensagem.info}</Aviso>}
      {aviso && !vencido && !estado.erro && !estado.info && <Aviso tipo="info">{aviso}</Aviso>}
      <Botao type="submit" disabled={pendente}>
        {pendente ? "Aguarde…" : BOTAO[modo]}
      </Botao>
      {modo === "entrar" && (
        <button type="button" className={CLASSE_LINK} onClick={() => trocarModo("recuperar")}>
          Esqueci minha senha
        </button>
      )}
      <button type="button" className={CLASSE_LINK} onClick={() => trocarModo(modo === "entrar" ? "criar" : "entrar")}>
        {modo === "entrar" ? "Ainda não tem conta? Criar conta" : "Já tem conta? Entrar"}
      </button>
    </form>
  );
}
