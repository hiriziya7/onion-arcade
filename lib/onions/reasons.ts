// Pure constants — NO imports. Safe to import from the data layer (sqlite.ts)
// and the accounting layer alike without creating a cycle.
//
// Every ledger row's `reason` starts with one of these. Aggregates (a player's
// liability, total onions spent) are SUM-by-prefix queries, so a stray reason
// string would silently corrupt the prize-pool math — keep ALL reason strings
// flowing through these constants.

export const REASON = {
  /** Starting grant marker. delta=100 locally, delta=0 when OnionDAO-configured. */
  WELCOME: "welcome",
  /** Buy-in credited from a settled escrow deposit. `deposit:<onionTxId>`, delta=+N. */
  DEPOSIT_PREFIX: "deposit:",
  /** A game play. `play:<gameId>`, delta=-GAME_COST. */
  PLAY_PREFIX: "play:",
  /** Cash-out debit of the player's whole balance. `cashout:<withdrawalId>`, delta=-B. */
  CASHOUT_PREFIX: "cashout:",
  /** Compensating credit when a cash-out transfer is definitively rejected. delta=+B. */
  CASHOUT_REFUND_PREFIX: "cashout-refund:",
} as const;
