import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRepos } from "@/lib/data/sqlite";
import { isOnionConfigured } from "@/lib/onions/config";
import { createDeposit, findTransaction } from "@/lib/onions/onionApi";

// Reads the DB and the OnionDAO API on every call — must never be statically
// cached (Next 16 default is dynamic, but be explicit for a poll endpoint).
export const dynamic = "force-dynamic";

// Statuses that mean the deposit will never complete. The row is marked failed
// so it stops being polled and isn't left dangling as "pending" forever.
const TERMINAL_FAILURE = new Set([
  "denied",
  "failed",
  "cancelled",
  "canceled",
  "expired",
]);

// POST /api/onions/deposit
// Create a pending deposit and ask the OnionDAO user to approve sending
// `amount` onions into the app escrow account. Requires OnionDAO configured
// and the player to already have a claimed identity (handle).
export async function POST(request: NextRequest) {
  if (!isOnionConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { playerId, amount } = (body ?? {}) as {
    playerId?: string;
    amount?: number;
  };

  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  if (
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > 100000
  ) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const repos = getRepos();
  const player = repos.players.getPlayer(playerId);
  if (!player?.handle) {
    return NextResponse.json({ error: "no_identity" }, { status: 400 });
  }

  const externalId = "dep_" + playerId + "_" + randomUUID();

  const deposit = repos.deposits.create(playerId, externalId, amount);

  try {
    await createDeposit(player.handle, amount, externalId);
  } catch {
    repos.deposits.markStatus(deposit.id, "failed");
    return NextResponse.json({ error: "deposit_failed" }, { status: 502 });
  }

  return NextResponse.json({ depositId: deposit.id });
}

// GET /api/onions/deposit?depositId=
// Poll the escrow account for the deposit's transaction status and credit the
// player's local ledger exactly once when the deposit completes. Idempotent:
// the deposit row status guards against double-crediting.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const depositId = searchParams.get("depositId");

  if (!depositId) {
    return NextResponse.json({ error: "depositId required" }, { status: 400 });
  }

  const repos = getRepos();
  const deposit = repos.deposits.getById(depositId);
  // Player buy-in deposits only — admin pool-seed deposits (player_id NULL) are
  // polled via /api/arcade/add-to-pool, not here.
  if (!deposit || !deposit.player_id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const playerId = deposit.player_id;

  // Already credited — return final state without touching the ledger.
  if (deposit.status === "completed") {
    return NextResponse.json({
      status: "completed",
      balance: repos.ledger.getBalance(playerId),
    });
  }

  if (!isOnionConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }

  let tx: {
    status: string;
    id: string;
    amount?: number;
    success?: boolean;
  } | null;
  try {
    tx = await findTransaction(deposit.external_id);
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }

  const status = tx?.status ?? "pending";
  // A "completed" transaction that explicitly reports success:false is a
  // failure, not a credit (the escrow may pair status with a success flag).
  const completedOk = status === "completed" && tx?.success !== false;

  // Credit exactly once when the escrow transaction completes. Prefer the
  // amount the escrow actually settled (points/tokens conversion, partial
  // approval) over the locally-requested amount when the API reports it.
  if (completedOk) {
    const onionTxId = tx?.id || deposit.external_id;
    const creditAmount =
      typeof tx?.amount === "number" && tx.amount > 0
        ? tx.amount
        : deposit.amount;
    repos.deposits.creditOnce(deposit.id, creditAmount, onionTxId);
  } else if (TERMINAL_FAILURE.has(status) || status === "completed") {
    // completed-but-not-ok also lands here.
    repos.deposits.markStatus(deposit.id, "failed", tx?.id);
  }

  return NextResponse.json({
    status,
    balance: repos.ledger.getBalance(playerId),
  });
}
