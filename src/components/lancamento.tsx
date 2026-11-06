"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import type { EstadoAcao } from "@/lib/acao";
import { Botao } from "@/components/ui";
import { AvisoFlutuante, FormPainel, PainelContexto, PainelLateral, useAvisoCurto } from "@/components/cadastro";

// Padrão de lançamento de todas as telas (DESIGN.md > Lançamentos): o botão fica no alto, no `acoes` do Titulo
// ou do Cartao, e abre a gaveta da direita com o formulário. Salvou, a gaveta fecha e o aviso curto aparece;
// a tela atrás se atualiza pelo revalidatePath da ação.

type Acao = (estado: EstadoAcao, form: FormData) => Promise<EstadoAcao>;

export function BotaoLancamento({
  rotulo,
  titulo,
  descricao,
  acao,
  botao = "Salvar",
  variante = "primario",
  tamanho = "md",
  icone,
  chave,
  children,
}: {
  rotulo: string;
  // título da gaveta; sem ele vale o rótulo do botão
  titulo?: string;
  // frase curta no alto do formulário
  descricao?: ReactNode;
  acao: Acao;
  botao?: string;
  variante?: "primario" | "secundario";
  tamanho?: "md" | "sm";
  // null tira o ícone de +
  icone?: ReactNode | null;
  // abre sozinho quando a tela chega com ?lancar=<chave> (links da Rotina do dia); sem ela vale o rótulo
  chave?: string;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [vez, setVez] = useState(0);
  const [montado, setMontado] = useState(false);
  const [aviso, setAviso] = useAvisoCurto();

  // O formulário só existe com a gaveta aberta (e durante a saída dela): fechada, a tela não carrega campos
  // escondidos com os mesmos rótulos dos outros lançamentos.
  useEffect(() => {
    if (aberto) return;
    const t = setTimeout(() => setMontado(false), 320);
    return () => clearTimeout(t);
  }, [aberto]);

  // Link da Rotina do dia: a tela abre já com a gaveta deste lançamento. Tira o parâmetro da URL para
  // recarregar ou voltar não abrir de novo.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("lancar") !== (chave ?? rotulo)) return;
    const t = setTimeout(() => {
      url.searchParams.delete("lancar");
      window.history.replaceState(window.history.state, "", url);
      setVez((v) => v + 1);
      setMontado(true);
      setAberto(true);
    }, 0);
    return () => clearTimeout(t);
  }, [chave, rotulo]);

  const fechar = useCallback(
    (mensagem?: string) => {
      setAberto(false);
      if (mensagem) setAviso(mensagem);
    },
    [setAviso],
  );
  const fecharSemAviso = useCallback(() => fechar(), [fechar]);

  return (
    <>
      <Botao
        type="button"
        data-lancamento={rotulo}
        variante={variante}
        tamanho={tamanho}
        onClick={() => {
          setVez((v) => v + 1);
          setMontado(true);
          setAberto(true);
        }}
      >
        {icone === undefined ? <Plus size={16} strokeWidth={1.75} aria-hidden /> : icone} {rotulo}
      </Botao>
      <PainelContexto.Provider value={{ fechar }}>
        <PainelLateral aberto={aberto} titulo={titulo ?? rotulo} aoFechar={fecharSemAviso}>
          {/* a chave remonta o formulário a cada abertura: começa sempre limpo */}
          {montado && (
            <div key={vez} className="flex min-h-0 flex-1 flex-col">
              <FormPainel acao={acao} botao={botao}>
                {descricao && <p className="text-sm text-texto-suave">{descricao}</p>}
                {children}
              </FormPainel>
            </div>
          )}
        </PainelLateral>
      </PainelContexto.Provider>
      <AvisoFlutuante aviso={aviso} />
    </>
  );
}
