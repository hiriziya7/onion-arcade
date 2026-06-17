// SERVER-ONLY. Thin fetch wrapper around the OnionDAO public/escrow API.
// Every function assumes OnionDAO is configured; callers MUST guard with
// isOnionConfigured() before invoking. Never import from client code.

import { getOnionConfig } from "./config";

/**
 * Thrown when the OnionDAO API responds with an error or is unreachable.
 * `status` is the HTTP status code, or 0 for a network/parse failure. Callers
 * branch on it — e.g. payout maps 409 to "insufficient escrow", everything
 * else to a generic upstream failure.
 */
export class OnionApiError extends Error {
  status: number;
  body?: string;
  constructor(status: number, message: string, body?: string) {
    super(message);
    this.name = "OnionApiError";
    this.status = status;
    this.body = body;
  }
}

interface ValidateResult {
  exists: boolean;
  balanceType?: string;
  balance?: number;
}

// The escrow account-read endpoint's transaction shape is NOT documented in
// API.md (only the callback body is). We tolerate the documented callback field
// names plus a few plausible snake_case / id variants so a shape mismatch
// doesn't silently strand deposits as "pending" forever.
interface OnionTransaction {
  id?: string;
  transactionId?: string;
  transaction_id?: string;
  externalId?: string;
  external_id?: string;
  status?: string;
  amount?: number;
  success?: boolean;
}

/**
 * Exact (case-insensitive) existence check via the public usernames search.
 * Used as a fallback when the profile endpoint 404s — verified against
 * production, some real OnionDAO users (e.g. with no public profile) 404 on
 * /profile yet still appear here, so a profile 404 alone must NOT reject them.
 */
async function searchUsernameExists(username: string): Promise<boolean> {
  const { base } = getOnionConfig();
  let res: Response;
  try {
    res = await fetch(
      `${base}/api/public/usernames?q=${encodeURIComponent(username)}`,
      { method: "GET", cache: "no-store" }
    );
  } catch (e) {
    throw new OnionApiError(0, `usernames search unreachable: ${String(e)}`);
  }
  if (!res.ok) {
    throw new OnionApiError(
      res.status,
      `usernames search failed: ${res.status}`
    );
  }
  const data = (await res.json().catch(() => null)) as {
    users?: Array<{ username?: string; handle?: string }>;
  } | null;
  const needle = username.trim().toLowerCase();
  return !!data?.users?.some(
    (u) =>
      u.username?.toLowerCase() === needle ||
      u.handle?.toLowerCase() === needle
  );
}

/**
 * Look up a public OnionDAO profile by username.
 *  - 200 -> parse the active balance readout ({ exists, balanceType, balance }).
 *  - 404 -> fall back to the usernames search; only { exists:false } when that
 *           also finds nothing (a real user may simply have no public profile).
 *  - anything else / network failure -> throw OnionApiError (caller decides).
 */
export async function validateUsername(
  username: string
): Promise<ValidateResult> {
  const { base } = getOnionConfig();
  let res: Response;
  try {
    res = await fetch(
      `${base}/api/public/profile/${encodeURIComponent(username)}`,
      { method: "GET", cache: "no-store" }
    );
  } catch (e) {
    throw new OnionApiError(0, `profile lookup unreachable: ${String(e)}`);
  }

  if (res.status === 404) {
    // The profile may just be non-public — confirm via search before rejecting.
    const exists = await searchUsernameExists(username);
    return { exists };
  }
  if (!res.ok) {
    throw new OnionApiError(res.status, `profile lookup failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    balanceType?: string;
    currentOnionBalance?: number;
  };
  return {
    exists: true,
    balanceType: data.balanceType,
    balance: data.currentOnionBalance,
  };
}

/**
 * Ask a user to approve depositing `amount` onions into the app escrow account.
 * Idempotent on (escrowAccountId, externalId).
 */
export async function createDeposit(
  username: string,
  amount: number,
  externalId: string
): Promise<unknown> {
  const { base, accountId, accountSecret } = getOnionConfig();
  let res: Response;
  try {
    res = await fetch(
      `${base}/api/public/onions/escrow/accounts/${accountId}/deposits`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accountSecret}`,
        },
        body: JSON.stringify({ username, amount, externalId }),
      }
    );
  } catch (e) {
    throw new OnionApiError(0, `createDeposit unreachable: ${String(e)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OnionApiError(res.status, `createDeposit failed: ${res.status}`, body);
  }
  return res.json();
}

// Candidate keys for the (undocumented) transactions array in the account read.
const TX_LIST_KEYS = ["transactions", "recentTransactions", "items"] as const;

/**
 * Read the escrow account and find the transaction matching `externalId`.
 * Returns { status, id, amount } or null when no matching transaction exists
 * yet. Defensive about the response shape (see OnionTransaction note above).
 */
/** GET the escrow account document (account metadata, balances, recent txns). */
async function getEscrowAccount(): Promise<Record<string, unknown> | null> {
  const { base, accountId, accountSecret } = getOnionConfig();
  let res: Response;
  try {
    res = await fetch(
      `${base}/api/public/onions/escrow/accounts/${accountId}`,
      {
        method: "GET",
        cache: "no-store",
        headers: { Authorization: `Bearer ${accountSecret}` },
      }
    );
  } catch (e) {
    throw new OnionApiError(0, `escrow account read unreachable: ${String(e)}`);
  }
  if (!res.ok) {
    throw new OnionApiError(res.status, `escrow account read failed: ${res.status}`);
  }
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

/** Live total onion balance held in the escrow account (the invariant's E term). */
export async function readEscrowTotal(): Promise<number> {
  const data = await getEscrowAccount();
  const balances = (data?.balances ?? {}) as { total?: number };
  return typeof balances.total === "number" ? balances.total : 0;
}

export async function findTransaction(
  externalId: string
): Promise<{
  status: string;
  id: string;
  amount?: number;
  success?: boolean;
} | null> {
  const data = await getEscrowAccount();
  if (!data) return null;

  // Transactions may sit at the top level or nested under `account`.
  const account = (data.account ?? {}) as Record<string, unknown>;
  let list: OnionTransaction[] = [];
  for (const key of TX_LIST_KEYS) {
    const v = data[key] ?? account[key];
    if (Array.isArray(v)) {
      list = v as OnionTransaction[];
      break;
    }
  }

  const tx = list.find((t) => (t.externalId ?? t.external_id) === externalId);
  if (!tx) return null;
  return {
    status: tx.status ?? "pending",
    id: tx.id ?? tx.transactionId ?? tx.transaction_id ?? "",
    amount: typeof tx.amount === "number" ? tx.amount : undefined,
    success: typeof tx.success === "boolean" ? tx.success : undefined,
  };
}

/**
 * Transfer escrowed onions to a recipient. currencyMode "auto" lets the server
 * pick a balance that fits the recipient's wallet mode.
 * Idempotent on (escrowAccountId, externalId). Throws OnionApiError on failure
 * (notably 409 = insufficient escrow balance) so callers can branch on status.
 */
export async function transfer(
  recipientUsername: string,
  amount: number,
  externalId: string,
  note?: string
): Promise<unknown> {
  const { base, accountId, accountSecret } = getOnionConfig();
  let res: Response;
  try {
    res = await fetch(
      `${base}/api/public/onions/escrow/accounts/${accountId}/transfers`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accountSecret}`,
        },
        body: JSON.stringify({
          recipientUsername,
          amount,
          currencyMode: "auto",
          externalId,
          note,
        }),
      }
    );
  } catch (e) {
    throw new OnionApiError(0, `transfer unreachable: ${String(e)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OnionApiError(res.status, `transfer failed: ${res.status}`, body);
  }
  return res.json();
}
