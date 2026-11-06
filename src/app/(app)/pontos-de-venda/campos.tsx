import { Campo, Selecao } from "@/components/ui";
import { TIPOS_PONTO } from "@/lib/pontos";
import type { PontoVenda } from "@/lib/pontos-dados";

// Campos do cadastro do ponto (novo e edição). A piscicultura (sede) não troca de tipo.
export function CamposPonto({ ponto, sufixo = "novo" }: { ponto?: PontoVenda; sufixo?: string }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" id={`nome_${sufixo}`} name="nome" defaultValue={ponto?.nome} placeholder="Loja Manaus" required />
        {ponto?.sede ? (
          <input type="hidden" name="tipo" value="piscicultura" />
        ) : (
          <Selecao rotulo="Tipo" id={`tipo_${sufixo}`} name="tipo" defaultValue={ponto?.tipo ?? "loja"}>
            {Object.entries(TIPOS_PONTO).filter(([v]) => v !== "piscicultura").map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selecao>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_5rem]">
        <Campo rotulo="Endereço" id={`endereco_${sufixo}`} name="endereco" defaultValue={ponto?.endereco ?? ""} />
        <Campo rotulo="Município" id={`municipio_${sufixo}`} name="municipio" defaultValue={ponto?.municipio ?? ""} placeholder="Manaus" />
        <Campo rotulo="UF" id={`uf_${sufixo}`} name="uf" defaultValue={ponto?.uf ?? ""} placeholder="AM" maxLength={2} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="CNPJ da filial ou CPF (opcional)" id={`documento_${sufixo}`} name="documento" defaultValue={ponto?.documento ?? ""} inputMode="numeric"
          ajuda="Só se o ponto tiver inscrição própria; a nota ainda sai pelo emitente da empresa" />
        <Campo rotulo="Inscrição estadual (opcional)" id={`ie_${sufixo}`} name="inscricao_estadual" defaultValue={ponto?.inscricao_estadual ?? ""} />
      </div>
    </>
  );
}
