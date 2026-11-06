"use client";

import { useActionState } from "react";
import { Aviso, Botao, Campo, classeBotao } from "@/components/ui";
import { Captcha } from "@/components/captcha";
import { confirmarCodigoEmail, enviarCodigoEmail, type EstadoCodigoEmail } from "./actions";
import { CaixaConfiar } from "./confiar";

// 2º fator de quem não usa app autenticador: um código enviado ao e-mail da conta.
export function CodigoEmail({ email, destino }: { email: string; destino: string }) {
  const [envio, enviar, enviando] = useActionState<EstadoCodigoEmail, FormData>(enviarCodigoEmail, {});
  const [conferencia, conferir, conferindo] = useActionState<EstadoCodigoEmail, FormData>(confirmarCodigoEmail, {});
  const enviado = envio.enviado || conferencia.enviado;

  if (!enviado) {
    return (
      <form action={enviar} className="flex flex-col gap-4">
        <p className="text-sm">
          Vamos mandar um código para <strong className="break-all">{email}</strong>.
        </p>
        <Captcha renovar={envio} />
        {envio.erro && <Aviso>{envio.erro}</Aviso>}
        <Botao type="submit" disabled={enviando}>{enviando ? "Enviando…" : "Enviar código por e-mail"}</Botao>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={conferir} className="flex flex-col gap-4">
        <input type="hidden" name="voltar" value={destino} />
        {envio.info && !conferencia.erro && <Aviso tipo="info">{envio.info}</Aviso>}
        <Campo
          rotulo="Código do e-mail"
          id="codigo"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={12}
          placeholder="000000"
          autoFocus
          required
          className="text-center font-mono text-lg tracking-[0.3em]"
        />
        <CaixaConfiar />
        {conferencia.erro && <Aviso>{conferencia.erro}</Aviso>}
        <Botao type="submit" disabled={conferindo}>{conferindo ? "Conferindo…" : "Entrar"}</Botao>
      </form>
      <form action={enviar} className="flex flex-col gap-3">
        <input type="hidden" name="reenvio" value="1" />
        <Captcha renovar={envio} />
        {envio.erro && <Aviso>{envio.erro}</Aviso>}
        <button
          type="submit"
          disabled={enviando}
          className={classeBotao("secundario", "sm")}
        >
          {enviando ? "Enviando…" : "Não chegou? Enviar outro código"}
        </button>
      </form>
    </div>
  );
}
