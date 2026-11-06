"use client";

import { useState, useTransition } from "react";
import { Aviso, Botao, Etiqueta } from "@/components/ui";
import { formatarMoeda } from "@/lib/formato";
import type { Previa } from "@/lib/importacao-modelo";
import { importarModelo, previaModelo, type EstadoModelo } from "./actions";

// Enviar a planilha preenchida: primeiro a prévia (nada é gravado), depois o lançamento.
// O arquivo fica guardado no estado para o segundo passo não pedir de novo.
export function ImportarModelo() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<EstadoModelo>({});
  const [lancado, setLancado] = useState(false);
  const [pendente, iniciar] = useTransition();

  function rodar(acao: typeof previaModelo, lancar: boolean) {
    if (!arquivo) return;
    const form = new FormData();
    form.set("arquivo", arquivo);
    iniciar(async () => {
      const r = await acao(form);
      setEstado(r);
      setLancado(lancar && !!r.ok);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Planilha preenchida"
        className="text-sm file:mr-3 file:rounded-lg file:border file:border-borda file:bg-elevado file:px-3 file:py-1.5 file:text-sm"
        onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setEstado({}); setLancado(false); }}
      />
      <div className="flex flex-wrap gap-2">
        <Botao type="button" variante={estado.previa && !lancado ? "secundario" : "primario"} disabled={!arquivo || pendente}
          onClick={() => rodar(previaModelo, false)}>
          {pendente ? "Lendo…" : "Conferir planilha"}
        </Botao>
        {estado.previa && !lancado && !!estado.prontas && (
          <Botao type="button" disabled={pendente} onClick={() => rodar(importarModelo, true)}>
            {pendente ? "Lançando…" : `Lançar ${estado.prontas} ${estado.prontas === 1 ? "linha" : "linhas"}`}
          </Botao>
        )}
      </div>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.ok && <Aviso tipo="sucesso">{estado.ok}</Aviso>}
      {estado.previa && <Resumo previa={estado.previa} lancado={lancado} />}
    </div>
  );
}

const NOME_TIPO: Record<string, string> = {
  viveiros: "Viveiros", lotes: "Lotes", estoque: "Estoque inicial", lancamentos: "Lançamentos", contatos: "Clientes e fornecedores", categorias: "Categorias", contas: "Contas",
  transferencias: "Transferências", produtos: "Produtos",
};

function Resumo({ previa, lancado }: { previa: Previa; lancado: boolean }) {
  const fora = previa.problemas.filter((p) => p.ignorada).length;
  const lista = (nomes: string[]) => `${nomes.slice(0, 8).join(", ")}${nomes.length > 8 ? ` e mais ${nomes.length - 8}` : ""}`;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left tabular-nums">
          <thead className="text-texto-suave">
            <tr>
              <th className="py-1.5 font-medium">Aba</th><th className="px-2 font-medium">Reconhecida como</th>
              <th className="px-2 text-right font-medium">Linhas</th><th className="px-2 text-right font-medium">Prontas</th>
              <th className="px-2 font-medium">Observação</th>
            </tr>
          </thead>
          <tbody>
            {previa.abas.map((a) => (
              <tr key={a.aba} className="border-t border-borda/50 align-top">
                <td className="py-1.5">{a.aba}</td>
                <td className="px-2">{a.tipo ? NOME_TIPO[a.tipo] : <Etiqueta tom="perigo">não reconhecida</Etiqueta>}</td>
                <td className="px-2 text-right">{a.linhas}</td>
                <td className="px-2 text-right">{a.erro ? 0 : a.validas}</td>
                <td className="px-2 text-texto-suave">
                  {a.erro ? <span className="text-perigo">{a.erro}</span> : [
                    a.exemplos ? `${a.exemplos} linhas de exemplo ignoradas` : "",
                    a.ignoradas.length ? `colunas ignoradas: ${a.ignoradas.join(", ")}` : "",
                  ].filter(Boolean).join(" · ") || "ok"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(previa.pagar.qtd > 0 || previa.receber.qtd > 0) && (
        <p>
          {previa.pagar.qtd > 0 && <>{previa.pagar.qtd} contas a pagar ({formatarMoeda(previa.pagar.cents)}). </>}
          {previa.receber.qtd > 0 && <>{previa.receber.qtd} contas a receber ({formatarMoeda(previa.receber.cents)}). </>}
          {previa.quitados > 0 && <>{previa.quitados} já pagas ou recebidas entram quitadas.</>}
        </p>
      )}
      {!lancado && previa.novos.contatos.length > 0 && (
        <p className="text-texto-suave">Clientes e fornecedores novos que serão cadastrados: {lista(previa.novos.contatos)}.</p>
      )}
      {!lancado && previa.novos.categorias.length > 0 && (
        <p className="text-texto-suave">Categorias novas que serão criadas: {lista(previa.novos.categorias)}.</p>
      )}
      {!lancado && previa.novos.especies.length > 0 && (
        <p className="text-texto-suave">Espécies novas que serão cadastradas: {lista(previa.novos.especies)}.</p>
      )}
      {previa.problemas.length > 0 && (
        <details open={!lancado}>
          <summary className="cursor-pointer">
            {fora ? `${fora} ${fora === 1 ? "linha fica" : "linhas ficam"} de fora` : "Nenhuma linha fica de fora"}
            {previa.problemas.length > fora ? ` e ${previa.problemas.length - fora} com aviso` : ""}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {previa.problemas.map((p, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                <Etiqueta tom={p.ignorada ? "perigo" : "alerta"}>{p.ignorada ? "fica de fora" : "aviso"}</Etiqueta>
                <span><strong className="font-medium">{p.aba}, linha {p.linha}:</strong> {p.mensagem}</span>
              </li>
            ))}
          </ul>
          {previa.problemas.length >= 200 && <p className="mt-1 text-xs text-texto-suave">Mostrando os 200 primeiros.</p>}
        </details>
      )}
    </div>
  );
}
