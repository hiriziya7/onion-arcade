import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getRepos } from "@/lib/data/sqlite";
import { getOnionConfig, isOnionConfigured } from "@/lib/onions/config";

export const dynamic = "force-dynamic";

// Statuses that mean the deposit will never complete — mark the row failed.
const TERMINAL_FAILURE = new Set([
  "denied",
  "failed",
  "cancelled",
  "canceled",
  "expired",
]);

/**
 * OnionDAO escrow webhook. Secondary path to credit a deposit — the deposit
 * GET poll is the primary path. Both share the same idempotent credit logic,
 * guarded on the deposit row status + UNIQUE external_id, so a deposit is
 * credited exactly once no matter which path arrives first.
 *
 * Verifies X-Onion-Signature against an HMAC-SHA256 of the RAW request body
 * keyed with ONION_CALLBACK_SECRET. The body must be read raw (not via
 * request.json()) so the bytes signed by OnionDAO match what we hash.
 */
export async function POST(request: NextRequest) {
  if (!isOnionConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }

  const { callbackSecret } = getOnionConfig();
  if (!callbackSecret) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }

  const rawBody = await request.text();

  const provided = request.headers.get("x-onion-signature");
  if (!provided) {
    return NextResponse.json({ error: "unsigned" }, { status: 401 });
  }

  const expected = createHmac("sha256", callbackSecret)
    .update(rawBody)
    .digest("hex");

  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let payload: {
    externalId?: string;
    status?: string;
    transactionId?: string;
    amount?: number;
    success?: boolean;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { externalId, status, transactionId, amount, success } = payload;
  if (!externalId) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const repos = getRepos();
  // The callback pairs status with a success flag (API.md); a "completed" event
  // with success:false is a failure, not a credit.
  const completedOk = status === "completed" && success !== false;

  // Only a successful "completed" results in a credit. Everything else is
  // acknowledged with 200 (so OnionDAO does not retry); terminal failures mark
  // the row failed, other statuses leave it pending.
  if (completedOk) {
    const deposit = repos.deposits.getByExternalId(externalId);
    if (deposit) {
      const settled =
        typeof amount === "number" && amount > 0 ? amount : deposit.amount;
      if (deposit.game_id && !deposit.player_id) {
        // Admin pool-seed deposit: record the pool 'add', not a player credit.
        const spentAt = repos.ledger.spentTotalForGame(deposit.game_id);
        repos.arcadePool.settleSeedOnce(deposit.id, settled, spentAt, transactionId);
      } else {
        // Player buy-in: credit the player ledger. Atomic + idempotent, so
        // racing with the deposit GET poll credits exactly once.
        repos.deposits.creditOnce(deposit.id, settled, transactionId);
      }
    }
  } else if (TERMINAL_FAILURE.has(status ?? "") || status === "completed") {
    const deposit = repos.deposits.getByExternalId(externalId);
    // markStatus itself refuses to clobber a credited row.
    if (deposit) {
      repos.deposits.markStatus(deposit.id, "failed", transactionId);
    }
  }

  return NextResponse.json({ ok: true });
}
