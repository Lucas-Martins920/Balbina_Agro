"use client";

import { useState, type FormEvent } from "react";
import { CodigoMfa } from "@/components/codigo-mfa";
import { Aviso, Botao, Campo } from "@/components/ui";
import { zerarFinanceiro } from "./actions";

const normalizar = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

// Confirmação em duas etapas: nome da empresa digitado e depois o código do autenticador,
// que eleva a sessão (TOTP de agora) logo antes de chamar o banco.
export function FormZerar({ nomeEmpresa }: { nomeEmpresa: string }) {
  const [etapa, setEtapa] = useState<"nome" | "codigo" | "zerando">("nome");
  const [confirmacao, setConfirmacao] = useState("");
  const [baixou, setBaixou] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  function continuar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (normalizar(confirmacao) !== normalizar(nomeEmpresa)) return setErro(`Digite exatamente "${nomeEmpresa}".`);
    setErro("");
    setEtapa("codigo");
  }

  async function zerar() {
    setEtapa("zerando");
    const r = await zerarFinanceiro(confirmacao);
    if (r.erro) {
      setErro(r.erro);
      setEtapa("nome");
      return;
    }
    setOk(r.ok ?? "");
    setConfirmacao("");
    setBaixou(false);
    setEtapa("nome");
  }

  if (ok) return <Aviso tipo="sucesso">{ok}</Aviso>;

  if (etapa === "codigo") {
    return (
      <div className="flex max-w-sm flex-col gap-3">
        <p className="text-sm">Último passo: o código do app autenticador. Ao confirmar, o financeiro é zerado na hora.</p>
        <CodigoMfa aoConfirmar={zerar} botao="Zerar financeiro agora" />
        <Botao type="button" variante="fantasma" className="self-start" onClick={() => setEtapa("nome")}>Voltar</Botao>
      </div>
    );
  }

  return (
    <form onSubmit={continuar} className="flex max-w-md flex-col gap-4">
      <Campo
        rotulo={`Para confirmar, digite o nome da empresa: ${nomeEmpresa}`}
        id="confirmacao"
        value={confirmacao}
        onChange={(e) => setConfirmacao(e.target.value)}
        autoComplete="off"
        required
      />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={baixou} onChange={(e) => setBaixou(e.target.checked)} className="mt-0.5" required />
        <span>Baixei a cópia de segurança e entendo que os lançamentos apagados não voltam.</span>
      </label>
      {erro && <Aviso>{erro}</Aviso>}
      <Botao type="submit" variante="perigo" className="self-start" disabled={etapa === "zerando" || !baixou}>
        {etapa === "zerando" ? "Zerando…" : "Continuar"}
      </Botao>
    </form>
  );
}
