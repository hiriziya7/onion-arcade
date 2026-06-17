// SERVER-ONLY. Derives the prize-pool / dev-cut view and the four buckets of
// the no-onions-lost invariant, purely by SUM over the append-only ledger +
// withdrawals rows — never from stored counters.
//
// Invariant (proved in reconcile.ts against the live escrow balance E):
//   E == liability + prizePool + devRemaining + inFlight
// where every spent onion sits in exactly one bucket: a player's refundable
// ticket, the undistributed prize pool, the dev rake, or a transfer in flight.

import { getRepos } from "@/lib/data/sqlite";
import { splitSpend } from "./cost";

export interface PoolView {
  /** Onions owed back to players (sum of every ticket). */
  liability: number;
  /** Total onions spent on gameplay (positive). */
  spent: number;
  /** 90% of spent — total prize pool ever accrued. */
  poolAccrued: number;
  /** 10% of spent — total dev cut ever accrued. */
  devAccrued: number;
  /** Prize pool payable right now (accrued minus payouts taken/in-flight). */
  prizePool: number;
  /** Dev cut withdrawable right now (accrued minus dev withdrawals taken/in-flight). */
  devRemaining: number;
  /** Onions debited locally but not yet confirmed gone from escrow. */
  inFlight: number;
}

export function computePoolView(): PoolView {
  const { ledger, withdrawals } = getRepos();
  const liability = ledger.liabilityTotal();
  const spent = ledger.spentTotal();
  const { pool: poolAccrued, dev: devAccrued } = splitSpend(spent);

  // Payouts/dev withdrawals consume the pool/dev the moment they're reserved
  // (pending) — count pending + completed so the pool can't be double-spent.
  const payoutsCommitted = withdrawals.sumByKind("payout", true);
  const devCommitted = withdrawals.sumByKind("dev", true);
  const inFlight = withdrawals
    .listPending()
    .reduce((sum, w) => sum + w.amount, 0);

  return {
    liability,
    spent,
    poolAccrued,
    devAccrued,
    prizePool: poolAccrued - payoutsCommitted,
    devRemaining: devAccrued - devCommitted,
    inFlight,
  };
}

/** The books side of the invariant — should equal the live escrow balance. */
export function booksTotal(v: PoolView): number {
  return v.liability + v.prizePool + v.devRemaining + v.inFlight;
}
