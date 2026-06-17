import { NextRequest, NextResponse } from "next/server";
import { getRepos } from "@/lib/data/sqlite";
import { isOnionConfigured } from "@/lib/onions/config";
import { settleWithdrawal, pollWithdrawal } from "@/lib/onions/cashout";

export const dynamic = "force-dynamic";

// POST /api/onions/cashout — return the player's ENTIRE unused balance to their
// OnionDAO wallet. Reserve-then-transfer: the balance is debited atomically
// first (so a double-click no-ops), then the escrow->player transfer runs.
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

  const { playerId } = (body ?? {}) as { playerId?: string };
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const repos = getRepos();
  const player = repos.players.getPlayer(playerId);
  if (!player?.handle) {
    return NextResponse.json({ error: "no_identity" }, { status: 400 });
  }

  // Atomically debit the whole ticket and open the pending withdrawal.
  const w = repos.withdrawals.reserveCashout(playerId, player.handle);
  if (!w) {
    return NextResponse.json(
      { error: "nothing_to_cash_out", balance: repos.ledger.getBalance(playerId) },
      { status: 400 }
    );
  }

  const status = await settleWithdrawal(w);
  return NextResponse.json({
    status, // 'completed' | 'pending' | 'failed'
    withdrawalId: w.id,
    amount: w.amount,
    balance: repos.ledger.getBalance(playerId),
  });
}

// GET /api/onions/cashout?withdrawalId= — poll a pending cash-out to a terminal
// state (used by the client when the transfer settles asynchronously, e.g. a
// badge/token recipient).
export async function GET(request: NextRequest) {
  const withdrawalId = request.nextUrl.searchParams.get("withdrawalId");
  if (!withdrawalId) {
    return NextResponse.json({ error: "withdrawalId required" }, { status: 400 });
  }

  const repos = getRepos();
  const w = repos.withdrawals.getById(withdrawalId);
  if (!w) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const status =
    w.status === "pending" ? await pollWithdrawal(w.external_id) : w.status;

  const balance = w.player_id ? repos.ledger.getBalance(w.player_id) : 0;
  return NextResponse.json({ status, amount: w.amount, balance });
}
