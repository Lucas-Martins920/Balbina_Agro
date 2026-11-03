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
      <h2>Ações rápidas</h2>

      <div className="production-grid">
        <button
          type="button"
          onClick={onCloseLot}
          disabled={!canClose}
          title={canClose ? undefined : "Nenhum lote ativo para fechar"}
        >
          Fechar lote
        </button>

        <button
          type="button"
          onClick={onRegisterSale}
          disabled={!canSell}
          title={canSell ? undefined : "Feche um lote com peixe disponível para vender"}
        >
          Registrar venda
        </button>

        <button type="button" onClick={onMoveStock}>
          Movimentar estoque
        </button>

        <button type="button" onClick={onNewPayable}>
          Nova conta a pagar
        </button>
      </div>

    </section>
  );
}
