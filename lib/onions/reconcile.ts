// SERVER-ONLY. The no-onions-lost proof: recompute the four buckets from the
// append-only rows and compare their sum to the LIVE escrow balance.
//
//   drift = escrow_total - (liability + prizePool + devRemaining + inFlight)
//
//   drift === 0  -> books and wallet agree, every onion accounted for.
//   drift  >  0  -> wallet holds MORE than the books claim (safe-lag): usually a
//                   deposit that settled in escrow before its local credit, or a
//                   cash-out marked done a beat before escrow updated. We owe
//                   less than we hold — money is safe, just investigate.
//   drift  <  0  -> wallet holds LESS than the books claim (DANGER): a real
//                   leak/double-pay. Should never happen — exactly-once
//                   external_ids prevent it — but this is the alarm.

import { getRepos } from "@/lib/data/sqlite";
import { computePoolView, booksTotal, type PoolView } from "./accounting";
import { readEscrowTotal } from "./onionApi";
import { pollWithdrawal } from "./cashout";

export interface ReconcileReport extends PoolView {
  books: number;
  escrow: number;
  drift: number;
  ok: boolean;
  /** How many escrow->user transfers are still awaiting confirmation. */
  pendingCount: number;
  /** Age of the oldest still-pending transfer, in seconds (0 if none). */
  oldestPendingAgeSec: number;
}

/** Parse a SQLite datetime('now') string ("YYYY-MM-DD HH:MM:SS", UTC) to ms. */
function sqliteTimeMs(t: string): number {
  return Date.parse(t.replace(" ", "T") + "Z");
}

export async function reconcile(): Promise<ReconcileReport> {
  const view = computePoolView();
  const books = booksTotal(view);
  const escrow = await readEscrowTotal();
  const drift = escrow - books;

  const pending = getRepos().withdrawals.listPending();
  const now = Date.now();
  const oldestPendingAgeSec = pending.reduce((max, w) => {
    const age = Math.floor((now - sqliteTimeMs(w.created_at)) / 1000);
    return Number.isFinite(age) && age > max ? age : max;
  }, 0);

  return {
    ...view,
    books,
    escrow,
    drift,
    ok: drift === 0,
    pendingCount: pending.length,
    oldestPendingAgeSec,
  };
}

/**
 * Drive every still-pending withdrawal to a terminal state by re-checking it
 * against the live escrow transaction log. The self-healing backstop for sagas
 * stranded by a crash, a lost response, or async token-custody settlement.
 */
export async function retryPending(): Promise<{
  checked: number;
  settled: number;
}> {
  const repos = getRepos();
  const pending = repos.withdrawals.listPending();
  let settled = 0;
  for (const w of pending) {
    const status = await pollWithdrawal(w.external_id);
    if (status === "completed" || status === "failed") settled++;
  }
  return { checked: pending.length, settled };
}
