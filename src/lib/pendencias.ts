// Rotina do dia (antiga caixa de pendências, H1): o checklist do que precisa ser alimentado no sistema hoje,
// separado por quem faz. Cada item se marca sozinho quando o dado entra. quantidade null = o usuário não vê
// aquele assunto (fica fora); 0 = feito / em dia.
export type Area = "viveiro" | "comercial" | "financeiro" | "periodo";

export const AREAS: Record<Area, { nome: string; descricao: string }> = {
  viveiro: { nome: "Viveiros", descricao: "apontamento, biometria e sanidade" },
  comercial: { nome: "Comercial", descricao: "pedidos para faturar e entregar" },
  financeiro: { nome: "Financeiro", descricao: "extrato, notas e contas" },
  periodo: { nome: "Semana e mês", descricao: "reposição de insumos e fechamento" },
};

export type Pendencia = {
  chave: string;
  area: Area;
  titulo: string;
  quantidade: number | null;
  link: string;
  urgente: boolean;
  detalhe?: string;
  // rótulo do botão que leva direto ao lançamento (abre a gaveta da tela pelo ?lancar=)
  acao?: string;
};

// Agrupa por área na ordem do dia (viveiro primeiro): pendentes no alto, urgentes antes, feitos embaixo.
export function organizarRotina(itens: Pendencia[]) {
  const visiveis = itens.filter((p) => p.quantidade !== null);
  const areas = (Object.keys(AREAS) as Area[])
    .map((area) => {
      const daArea = visiveis.filter((p) => p.area === area);
      const pendentes = daArea.filter((p) => p.quantidade! > 0).sort((a, b) => Number(b.urgente) - Number(a.urgente));
      const feitos = daArea.filter((p) => p.quantidade === 0);
      return { area, ...AREAS[area], itens: [...pendentes, ...feitos], pendentes: pendentes.length, feitos: feitos.length };
    })
    .filter((a) => a.itens.length > 0);
  const feitos = areas.reduce((s, a) => s + a.feitos, 0);
  const total = areas.reduce((s, a) => s + a.itens.length, 0);
  return { areas, feitos, total, pendentes: total - feitos };
}

export function resumoWhatsApp(rotina: ReturnType<typeof organizarRotina>, fazenda: string, data: string): string {
  const linhas: string[] = [`*${fazenda} — Rotina do dia*`, `📅 ${data}`, ""];
  if (rotina.pendentes === 0) {
    linhas.push("✅ Tudo em dia!");
    return linhas.join("\n");
  }
  linhas.push(`${rotina.feitos}/${rotina.total} feitos (${rotina.total ? Math.round((rotina.feitos / rotina.total) * 100) : 100}%)`);
  linhas.push("");
  for (const a of rotina.areas) {
    const pendentes = a.itens.filter((p) => p.quantidade! > 0);
    if (pendentes.length === 0) continue;
    linhas.push(`*${a.nome}*`);
    for (const p of pendentes) {
      const marca = p.urgente ? "🔴" : "⚠️";
      const qtd = p.quantidade! > 1 ? ` (${p.quantidade})` : "";
      linhas.push(`${marca} ${p.titulo}${qtd}`);
    }
    linhas.push("");
  }
  return linhas.join("\n").trimEnd();
}
