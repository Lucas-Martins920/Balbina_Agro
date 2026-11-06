import { FormAcao } from "@/components/form-acao";
import { Campo, Cartao, Etiqueta, Selecao, type TomEtiqueta } from "@/components/ui";
import { SITUACAO_CONTA, TIPOS_EMPRESA_ASAAS, type SituacaoConta } from "@/lib/asaas-mapa";
import { abrirSubconta, atualizarConta, conectarContaPropria, desligarConta } from "./conta-actions";

export type ContaAsaas = { modo: "subconta" | "propria"; ambiente: string; situacao: SituacaoConta; email: string | null };

const TOM: Record<SituacaoConta, TomEtiqueta> = { APPROVED: "positivo", AWAITING_APPROVAL: "info", PENDING: "alerta", REJECTED: "perigo" };

// Onde o dinheiro das cobranças da piscicultura cai. Cada piscicultura tem a sua conta Asaas; o Balbina nunca recebe por ela.
export function CartaoContaAsaas({ perfilId, conta, master, pessoaFisica, emailPadrao, podeAbrir }: {
  perfilId: string; conta: ContaAsaas | null; master: boolean; pessoaFisica: boolean; emailPadrao: string; podeAbrir: boolean;
}) {
  if (conta) {
    return (
      <Cartao
        titulo="Conta Asaas da piscicultura"
        descricao={`${conta.modo === "subconta" ? "Aberta pelo Balbina" : "Conta própria da piscicultura"} · ${conta.ambiente === "producao" ? "produção" : "sandbox"}${conta.email ? ` · ${conta.email}` : ""}`}
        acoes={<Etiqueta tom={TOM[conta.situacao]}>{SITUACAO_CONTA[conta.situacao]}</Etiqueta>}
      >
        {conta.situacao !== "APPROVED" && (
          <p className="mb-3 text-sm text-texto-suave">
            Entre no Asaas com o e-mail da conta, complete o cadastro e envie os documentos. Quando o Asaas aprovar, a situação muda aqui sozinha.
          </p>
        )}
        {master && (
          <div className="flex flex-wrap gap-2">
            <FormAcao acao={atualizarConta} botao="Atualizar situação" variante="secundario">
              <input type="hidden" name="perfil_id" value={perfilId} />
            </FormAcao>
            <FormAcao acao={atualizarConta} botao="Reconfigurar aviso de pagamento" variante="secundario">
              <input type="hidden" name="perfil_id" value={perfilId} />
              <input type="hidden" name="aviso" value="1" />
            </FormAcao>
            <FormAcao acao={desligarConta} botao="Desligar conta" variante="secundario">
              <input type="hidden" name="perfil_id" value={perfilId} />
            </FormAcao>
          </div>
        )}
      </Cartao>
    );
  }

  return (
    <Cartao titulo="Conta Asaas da piscicultura" descricao="As cobranças saem desta conta e o dinheiro cai nela, em nome da piscicultura.">
      {!master ? (
        <p className="text-sm">Peça ao usuário master da empresa para ligar a conta Asaas.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {podeAbrir && (
            <details className="rounded-xl bg-elevado/60 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">Abrir uma conta Asaas pelo Balbina</summary>
              <FormAcao acao={abrirSubconta} botao="Abrir conta" className="mt-4" limparAoSalvar={false}>
                <input type="hidden" name="perfil_id" value={perfilId} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo rotulo="E-mail da conta" id="sc-email" name="email" type="email" required defaultValue={emailPadrao} />
                  <Campo rotulo="Celular com DDD" id="sc-celular" name="celular" inputMode="tel" required />
                  <Campo rotulo="Faturamento mensal (R$)" id="sc-faturamento" name="faturamento" inputMode="decimal" required />
                  {pessoaFisica ? (
                    <Campo rotulo="Data de nascimento" id="sc-nascimento" name="nascimento" type="date" required />
                  ) : (
                    <Selecao rotulo="Tipo de empresa" id="sc-tipo" name="tipo_empresa" required defaultValue="LIMITED">
                      {Object.entries(TIPOS_EMPRESA_ASAAS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                    </Selecao>
                  )}
                  <Campo rotulo="CEP" id="sc-cep" name="cep" inputMode="numeric" required />
                  <Campo rotulo="Bairro" id="sc-bairro" name="bairro" required />
                  <Campo rotulo="Endereço" id="sc-endereco" name="endereco" required />
                  <Campo rotulo="Número" id="sc-numero" name="numero" required />
                  <Campo rotulo="Complemento" id="sc-complemento" name="complemento" />
                </div>
                <p className="text-xs text-texto-suave">A conta sai no nome e no documento da empresa. O Asaas manda um e-mail para criar a senha e enviar os documentos.</p>
              </FormAcao>
            </details>
          )}
          <details className="rounded-xl bg-elevado/60 px-4 py-3" open={!podeAbrir}>
            <summary className="cursor-pointer text-sm font-medium">Já tenho conta no Asaas</summary>
            <FormAcao acao={conectarContaPropria} botao="Ligar conta" className="mt-4">
              <input type="hidden" name="perfil_id" value={perfilId} />
              <Campo rotulo="Chave da API" ajuda="Asaas > Integrações > Chaves de API" id="chave" name="chave" type="password" autoComplete="off" required />
              <p className="text-xs text-texto-suave">A chave fica cifrada no servidor e não aparece mais na tela. O aviso de pagamento é configurado sozinho.</p>
            </FormAcao>
          </details>
        </div>
      )}
    </Cartao>
  );
}
