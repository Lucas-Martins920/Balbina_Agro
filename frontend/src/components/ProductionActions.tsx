type ProductionActionsProps = {
  onCloseLot: () => void;
  onRegisterSale: () => void;
  onMoveStock: () => void;
  onNewPayable: () => void;
  canClose: boolean;
  canSell: boolean;
};

export function ProductionActions({
  onCloseLot,
  onRegisterSale,
  onMoveStock,
  onNewPayable,
  canClose,
  canSell,
}: ProductionActionsProps) {
  return (
    <section className="panel production-actions">
      <span className="label">AÇÕES RÁPIDAS</span>

      <div className="production-grid">
        <button
          type="button"
          onClick={onCloseLot}
          disabled={!canClose}
          title={canClose ? undefined : "Nenhum lote ativo para fechar"}
        >
          <span aria-hidden="true">🎣</span> Fechar lote
        </button>

        <button
          type="button"
          onClick={onRegisterSale}
          disabled={!canSell}
          title={canSell ? undefined : "Feche um lote com peixe disponível para vender"}
        >
          <span aria-hidden="true">💰</span> Registrar venda
        </button>

        <button type="button" onClick={onMoveStock}>
          <span aria-hidden="true">📦</span> Movimentar estoque
        </button>

        <button type="button" onClick={onNewPayable}>
          <span aria-hidden="true">🧾</span> Nova conta a pagar
        </button>
      </div>

      <p className="coming-soon">Em breve: fruteiras, granja e gado.</p>
    </section>
  );
}
