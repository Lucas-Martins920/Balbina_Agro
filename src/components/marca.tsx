// Marca do Balbina: um tambaqui sobre a lâmina d'água, na cor da marca. Desenhada em SVG para seguir o tema
// (no escuro a marca clareia e o peixe escurece, mantendo o contraste). Os ícones do app (public/icone*.png e
// mobile/assets) usam o mesmo desenho.
export function MarcaBalbina({ tamanho = 28, comNome = true }: { tamanho?: number; comNome?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
        <rect width="32" height="32" rx="8" className="fill-marca" />
        <path d="M9.6 16 4.6 11.2c1.1 3.2 1.1 6.4 0 9.6Z" className="fill-marca-texto" />
        <path d="M9.2 16C11 10.2 16.6 7.6 21.6 9.3c3.6 1.2 5.6 4 5.6 6.7s-2 5.5-5.6 6.7C16.6 24.4 11 21.8 9.2 16Z" className="fill-marca-texto" />
        <path d="M19.4 11.6c-1.2 2.9-1.2 5.9 0 8.8" fill="none" className="stroke-marca" strokeOpacity=".45" strokeWidth="1.1" strokeLinecap="round" />
        <circle cx="22.9" cy="14.4" r="1.25" className="fill-marca" />
        <path d="M7 26.2c1.6-1.1 3.2-1.1 4.8 0s3.2 1.1 4.8 0 3.2-1.1 4.8 0 3.2 1.1 4.8 0" fill="none" className="stroke-marca-texto" strokeOpacity=".5" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
      {comNome && <span className="text-[17px] font-semibold tracking-[-0.02em]">Balbina</span>}
    </span>
  );
}
