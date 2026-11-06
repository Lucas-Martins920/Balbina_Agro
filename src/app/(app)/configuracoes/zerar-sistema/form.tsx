"use client";

import { useState, type FormEvent } from "react";
import { CodigoMfa } from "@/components/codigo-mfa";
import { Aviso, Botao, Campo } from "@/components/ui";
import { zerarSistema } from "./actions";

const FRASE = "ZERAR TUDO";
const normalizar = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

// Confirmação em três travas: nome da empresa, a frase ZERAR TUDO e, por último, o código do autenticador,
// que eleva a sessão (TOTP de agora) logo antes de chamar o banco.
export function FormZerarSistema({ nomes }: { nomes: string[] }) {
  const [etapa, setEtapa] = useState<"confirmar" | "codigo" | "zerando">("confirmar");
  const [confirmacao, setConfirmacao] = useState("");
  const [frase, setFrase] = useState("");
  const [baixou, setBaixou] = useState(false);
  const [entendeu, setEntendeu] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  function continuar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!nomes.some((n) => normalizar(n) === normalizar(confirmacao))) return setErro(`Digite exatamente "${nomes[0]}".`);
    if (normalizar(frase) !== normalizar(FRASE)) return setErro(`Digite ${FRASE} no segundo campo.`);
    setErro("");
    setEtapa("codigo");
  }

  async function zerar() {
    setEtapa("zerando");
    const r = await zerarSistema(confirmacao, frase);
    if (r.erro) {
      setErro(r.erro);
      setEtapa("confirmar");
      return;
    }
    setOk(r.ok ?? "");
    setConfirmacao("");
    setFrase("");
    setBaixou(false);
    setEntendeu(false);
    setEtapa("confirmar");
  }

  if (ok) return <Aviso tipo="sucesso">{ok}</Aviso>;

  if (etapa !== "confirmar") {
    return (
      <div className="flex max-w-sm flex-col gap-3">
        <p className="text-sm">
          Último passo: o código do app autenticador. Ao confirmar, todos os movimentos desta empresa são apagados na hora.
        </p>
        <CodigoMfa aoConfirmar={zerar} botao={etapa === "zerando" ? "Zerando…" : "Zerar todo o sistema agora"} />
        <Botao type="button" variante="fantasma" className="self-start" disabled={etapa === "zerando"} onClick={() => setEtapa("confirmar")}>
          Voltar
        </Botao>
      </div>
    );
  }

  return (
    <form onSubmit={continuar} className="flex max-w-md flex-col gap-4">
      <Campo
        rotulo={`Digite o nome da empresa: ${nomes[0]}`}
        id="confirmacao"
        value={confirmacao}
        onChange={(e) => setConfirmacao(e.target.value)}
        autoComplete="off"
        required
      />
      <Campo
        rotulo={`Digite ${FRASE}`}
        id="frase"
        value={frase}
        onChange={(e) => setFrase(e.target.value)}
        autoComplete="off"
        required
      />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={baixou} onChange={(e) => setBaixou(e.target.checked)} className="mt-0.5" required />
        <span>Baixei a cópia de segurança e guardei o arquivo.</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={entendeu} onChange={(e) => setEntendeu(e.target.checked)} className="mt-0.5" required />
        <span>Entendo que produção, estoque, vendas, notas e financeiro desta empresa são apagados e não voltam.</span>
      </label>
      {erro && <Aviso>{erro}</Aviso>}
      <Botao type="submit" variante="perigo" className="self-start" disabled={!baixou || !entendeu}>
        Continuar
      </Botao>
    </form>
  );
}
