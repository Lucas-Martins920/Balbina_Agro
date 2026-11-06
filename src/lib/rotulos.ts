// Fase do lote: segue o viveiro em que ele está (alevinagem → recria → engorda) e fecha na despesca total.
export const FASES: Record<string, string> = {
  alevinagem: "Alevinagem", recria: "Recria", engorda: "Engorda", encerrado: "Encerrado",
};

// Eventos de sanidade e de manejo do viveiro (a biometria tem tela e tabela próprias)
export const TIPOS_EVENTO: Record<string, string> = {
  medicacao: "Medicação", banho: "Banho terapêutico", vitamina: "Vitamina", vacina: "Vacina", calagem: "Calagem",
  adubacao: "Adubação", exame: "Exame / análise", limpeza: "Secagem e desinfecção", outro: "Outro",
};

// Cadastro de medicamentos (aplicação registrada no apontamento diário)
export const TIPOS_MEDICAMENTO: Record<string, string> = { medicamento: "Medicamento", vitamina: "Vitamina", vacina: "Vacina", outro: "Outro" };
// Na ração a dose é por kg de ração; em banho e na água do viveiro, por m³ de água
export const VIAS_MEDICAMENTO: Record<string, string> = {
  racao: "Na ração", banho: "Banho", agua: "Na água do viveiro", injetavel: "Injetável", outro: "Outra",
};
export const UNIDADES_DOSE: Record<string, string> = { ml: "ml", l: "L", mg: "mg", g: "g", kg: "kg", un: "dose/unidade" };

export const TURNOS: Record<string, string> = { manha: "Manhã", tarde: "Tarde" };

// Turno sugerido pela hora da piscicultura: antes do meio-dia é manhã.
export function turnoAgora(agora = new Date(), fuso = "America/Manaus") {
  const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone: fuso, hour: "numeric", hourCycle: "h23" }).format(agora));
  return hora < 12 ? "manha" : "tarde";
}

// Finalidade do viveiro com o nome que a piscicultura usa; a ordem segue o ciclo do lote.
export const FINALIDADES_VIVEIRO: Record<string, string> = {
  alevinagem: "Alevinagem", alevinagem_recria: "Alevinagem e recria", recria: "Recria", engorda: "Engorda",
};

// Como o viveiro foi construído
export const SISTEMAS_VIVEIRO: Record<string, string> = {
  escavado: "Viveiro escavado", barragem: "Barragem", tanque_rede: "Tanque-rede", alvenaria: "Tanque de alvenaria", lona: "Tanque de lona", outro: "Outro",
};
