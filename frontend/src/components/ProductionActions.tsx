type ProductionActionsProps = {
  onCloseLot: () => void;
  onRegisterSale: () => void;
  onViewStock: () => void;
  onViewPayables: () => void;
};

export function ProductionActions({
  onCloseLot,
  onRegisterSale,
  onViewStock,
  onViewPayables,
}: ProductionActionsProps) {
  return (
    <section className="panel production-actions">
      <span className="label">PRODUÇÃO</span>
      <h2>Operações do V1</h2>

      <div className="production-grid">
        <button type="button" onClick={onCloseLot}>
          Fechar lote
        </button>

        <button type="button" onClick={onRegisterSale}>
          Registrar venda
        </button>

        <button type="button" onClick={onViewStock}>
          Consultar estoque
        </button>

        <button type="button" onClick={onViewPayables}>
          Contas a pagar
        </button>

        <button type="button" disabled>
          Fruteiras (Em breve)
        </button>

        <button type="button" disabled>
          Granja (Em breve)
        </button>

        <button type="button" disabled>
          Gado (Em breve)
        </button>
      </div>
    </section>
  );
}