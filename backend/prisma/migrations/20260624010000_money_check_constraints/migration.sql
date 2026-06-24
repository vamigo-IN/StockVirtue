-- Financial-integrity backstop. Money columns can never go negative — if a
-- concurrent read-modify-write race in the order engine would push a balance
-- below zero (double-spend), Postgres rejects the write and the transaction
-- rolls back instead of silently corrupting the wallet.
-- NOTE: realizedPnLP (P&L) and position.quantity (negative = short) are
-- intentionally NOT constrained — they are legitimately negative.

ALTER TABLE "wallets"
  ADD CONSTRAINT "wallets_balanceP_nonneg" CHECK ("balanceP" >= 0),
  ADD CONSTRAINT "wallets_reservedP_nonneg" CHECK ("reservedP" >= 0),
  ADD CONSTRAINT "wallets_marginReservedP_nonneg" CHECK ("marginReservedP" >= 0);

ALTER TABLE "positions"
  ADD CONSTRAINT "positions_reservedQty_nonneg" CHECK ("reservedQty" >= 0),
  ADD CONSTRAINT "positions_marginP_nonneg" CHECK ("marginP" >= 0);
