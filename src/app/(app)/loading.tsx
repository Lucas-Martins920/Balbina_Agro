// Aparece na hora em que a pessoa troca de tela, enquanto o servidor busca os dados:
// a navegação responde ao toque e o conteúdo entra no lugar do esqueleto.
export default function Carregando() {
  return (
    <div role="status" aria-label="Carregando" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="esqueleto h-8 w-56 rounded-xl" />
        <div className="esqueleto h-4 w-80 max-w-full rounded-lg" />
      </div>
      <div className="vidro grid grid-cols-1 gap-4 rounded-2xl border border-borda p-5 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="esqueleto h-3.5 w-24 rounded-md" />
            <div className="esqueleto h-7 w-32 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="vidro flex flex-col gap-3 rounded-2xl border border-borda p-6">
            <div className="esqueleto h-5 w-40 rounded-lg" />
            <div className="esqueleto h-40 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
