// SERVER-ONLY. The exactly-once escrow->user transfer saga, shared by cash-out,
// prize payout, dev withdrawal, and the reconcile retry path.
//
// Spine: the withdrawal row is RESERVED first (local debit committed atomically)
// so a double-click or crash can't pay twice. Then we attempt the external
// transfer with the row's UNIQUE external_id (OnionDAO idempotency). We only
// ever COMPLETE on a confirmed success, only REVERSE on a definitive rejection,
// and LEAVE PENDING on any ambiguous/network result — a later poll/reconcile
// drives it to a terminal state. We never refund on a mere network error (the
// transfer may have gone through), and never transfer twice (idempotent id).

import { getRepos } from "@/lib/data/sqlite";
import type { Withdrawal } from "@/lib/data/repo";
import { OnionApiError, transfer, findTransaction } from "./onionApi";

// Statuses that mean the transfer will never complete.
const TERMINAL_FAILURE = new Set([
  "denied",
  "failed",
  "cancelled",
  "canceled",
  "expired",
]);

// HTTP statuses that mean the transfer was DEFINITIVELY rejected and did not
// move any onions — safe to reverse. 409 = insufficient escrow, 400 = bad
// request, 404 = recipient not found. A network error (0) or 5xx is NOT here:
// the transfer may have succeeded, so we leave the row pending instead.
const DEFINITIVE_REJECT = new Set([400, 404, 409, 422]);

type Outcome = "completed" | "pending" | "rejected";

function classifyResponse(result: unknown): Outcome {
  const r = (result ?? {}) as {
    status?: string;
    success?: boolean;
    transaction?: { status?: string };
  };
  const status = r.status ?? r.transaction?.status;
  if (r.success === true || status === "completed") return "completed";
  if (r.success === false || (status && TERMINAL_FAILURE.has(status)))
    return "rejected";
  // pending / awaiting_badge_signature / processing / unrecognized shape:
  // treat as in-flight and let the poll confirm.
  return "pending";
}

function txIdOf(result: unknown): string | undefined {
  const r = (result ?? {}) as {
    transactionId?: string;
    id?: string;
    transaction?: { id?: string };
  };
  return r.transactionId ?? r.id ?? r.transaction?.id;
}

/**
 * Drive a freshly-reserved (pending) withdrawal through its external transfer.
 * Returns the final local status: 'completed' | 'pending' | 'failed'.
 */
export async function settleWithdrawal(w: Withdrawal): Promise<string> {
  const repos = getRepos();
  const note =
    w.kind === "cashout"
      ? "Arcade cash-out"
      : w.kind === "payout"
        ? "Arcade prize payout"
        : "Arcade dev withdrawal";
  try {
    const result = await transfer(w.recipient, w.amount, w.external_id, note);
    const outcome = classifyResponse(result);
    if (outcome === "completed") {
      repos.withdrawals.markStatus(w.external_id, "completed", txIdOf(result));
      return "completed";
    }
    if (outcome === "rejected") {
      repos.withdrawals.reverseWithdrawal(w.external_id);
      return "failed";
    }
    return "pending"; // accepted but not yet final (e.g. token custody)
  } catch (e) {
    if (e instanceof OnionApiError && DEFINITIVE_REJECT.has(e.status)) {
      repos.withdrawals.reverseWithdrawal(w.external_id);
      return "failed";
    }
    // Network/5xx/unknown — the transfer may have happened. Do NOT refund;
    // leave pending for the poll/reconcile to settle against the real ledger.
    return "pending";
  }
}

/**
 * Confirm a still-pending withdrawal against the live escrow transaction log.
 * Completes it if the transfer shows up done, reverses it on a terminal
 * failure, otherwise leaves it pending. Used by the poll route and reconcile.
 */
export async function pollWithdrawal(externalId: string): Promise<string> {
  const repos = getRepos();
  const w = repos.withdrawals.getByExternalId(externalId);
  if (!w) return "not_found";
  if (w.status !== "pending") return w.status;

  let tx: Awaited<ReturnType<typeof findTransaction>>;
  try {
    tx = await findTransaction(externalId);
  } catch {
    return "pending"; // transient — try again later
  }
  if (!tx) return "pending"; // not visible yet

  // Mirror classifyResponse exactly so the poll path can't strand a transfer
  // the immediate path would have completed: success:true OR status:'completed'
  // counts as done (unless success is explicitly false).
  if ((tx.success === true || tx.status === "completed") && tx.success !== false) {
    repos.withdrawals.markStatus(externalId, "completed", tx.id);
    return "completed";
  }
  if (tx.success === false || TERMINAL_FAILURE.has(tx.status)) {
    repos.withdrawals.reverseWithdrawal(externalId);
    return "failed";
  }
  return "pending";
}
