import { ambiente } from "@/lib/ambiente";

// Faixa no topo fora da produção:
// - amarela no site de teste (preview do desenvolvimento com o Supabase de teste, docs/site-de-teste.md);
// - vermelha se o app roda fora da produção (npm run dev, preview) mas ligado ao banco real.
// Com o banco local (docs/rodar-local.md) não aparece nada: a tela fica igual à da produção.
export function AvisoAmbiente() {
  const { foraDaProducao, bancoProducao, siteTeste } = ambiente();
  if (foraDaProducao && bancoProducao) {
    return (
      <div role="status" className="border-b border-perigo/40 bg-perigo/12 px-4 py-1.5 text-center text-xs font-medium text-perigo print:hidden">
        Rodando fora da produção, mas ligado ao banco de PRODUÇÃO: o que for lançado aqui vale de verdade.
      </div>
    );
  }
  if (siteTeste) {
    return (
      <div role="status" className="border-b border-alerta/40 bg-alerta/12 px-4 py-1.5 text-center text-xs font-medium text-alerta print:hidden">
        Site de teste: as mudanças que ainda não foram para a produção. Os dados daqui são de teste.
      </div>
    );
  }
  return null;
}
