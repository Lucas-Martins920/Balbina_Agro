type ProductionActionsProps = {
  onCloseLot: () => void;
  onMoveStock: () => void;
  onOpenBiometry: () => void;
  onOpenChat: () => void;
  canClose: boolean;
};

export function ProductionActions({
  onCloseLot,
  onMoveStock,
  onOpenBiometry,
  onOpenChat,
  canClose,
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

        <button type="button" onClick={onMoveStock}>
          Movimentar estoque
        </button>

        <button type="button" onClick={onOpenBiometry}>
          Registrar biometria
        </button>

        <button type="button" onClick={onOpenChat}>
          Chat operacional
        </button>
      </div>
    </section>
  );
}
