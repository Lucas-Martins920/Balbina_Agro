// Assistente de início: o que cada passo pede e para onde leva. O banco (assistente_inicio) diz o que já está feito,
// o que foi pulado e quais passos o plano da empresa inclui.

export type PassoBanco = { id: string; feito: boolean; pulado: boolean };
export type SituacaoAssistente = { passos: PassoBanco[]; faltam: number; escondido: boolean; concluido: boolean };

export type InfoPasso = { titulo: string; descricao: string; href: string; acao: string };

export const PASSOS: Record<string, InfoPasso> = {
  piscicultura: {
    titulo: "Setores e viveiros",
    descricao: "Cadastre os viveiros com a finalidade (alevinagem, recria ou engorda), a capacidade, a área e o sistema.",
    href: "/piscicultura",
    acao: "Cadastrar viveiros",
  },
  lotes: {
    titulo: "Lotes povoados",
    descricao: "Informe os lotes que já estão na água: espécie, data de povoamento, viveiro, quantidade e peso médio dos peixes.",
    href: "/lotes",
    acao: "Povoar lotes",
  },
  estoque: {
    titulo: "Saldo inicial do estoque",
    descricao: "Conte a ração, os insumos e as embalagens que você tem hoje e lance um ajuste de saldo em cada produto.",
    href: "/estoque",
    acao: "Lançar o estoque",
  },
  contas: {
    titulo: "Contas e saldo bancário",
    descricao: "Cadastre as contas do banco e o caixa com o saldo de hoje, para o fluxo de caixa começar certo.",
    href: "/contas",
    acao: "Cadastrar contas",
  },
  apontamento: {
    titulo: "Primeiro apontamento",
    descricao: "Lance o dia de cada viveiro: ração, mortes e qualidade da água. A partir daí o painel ganha vida.",
    href: "/apontamentos",
    acao: "Apontar o dia",
  },
  equipe: {
    titulo: "Sua equipe",
    descricao: "Convide quem aponta a produção, vende ou cuida do financeiro, cada um com o acesso que precisa.",
    href: "/configuracoes/usuarios",
    acao: "Convidar pessoas",
  },
};

// Passos que o assistente conhece, na ordem do banco; um passo novo no banco sem texto aqui fica de fora.
export function passosConhecidos(s: SituacaoAssistente) {
  return s.passos.filter((p) => PASSOS[p.id]).map((p) => ({ ...p, ...PASSOS[p.id] }));
}

// O assistente aparece no painel enquanto falta passo e o master não o escondeu.
export function mostrarNoPainel(s: SituacaoAssistente | null): s is SituacaoAssistente {
  return !!s && !s.concluido && !s.escondido && s.faltam > 0;
}

// Primeiro passo nem feito nem pulado: é para onde o botão "Continuar" leva.
export function proximoPasso(s: SituacaoAssistente) {
  return passosConhecidos(s).find((p) => !p.feito && !p.pulado) ?? null;
}

export function textoFaltam(faltam: number) {
  if (faltam <= 0) return "Tudo pronto";
  return faltam === 1 ? "Falta 1 passo" : `Faltam ${faltam} passos`;
}

// Fração resolvida (feita ou pulada), de 0 a 1, para a barra de progresso.
export function progresso(s: SituacaoAssistente) {
  const total = s.passos.length;
  return total === 0 ? 1 : (total - s.faltam) / total;
}
