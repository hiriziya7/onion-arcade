import { NextRequest, NextResponse } from "next/server";
import { getRepos } from "@/lib/data/sqlite";
import { checkAdminSecret, isOnionConfigured } from "@/lib/onions/config";
import { computePoolView } from "@/lib/onions/accounting";
import { settleWithdrawal } from "@/lib/onions/cashout";

export const dynamic = "force-dynamic";

// Upper bound on a single payout, mirroring the deposit cap.
const MAX_PAYOUT = 100000;

// POST /api/onions/payout — pay a prize from the PRIZE POOL to a winner.
// Reserves against the pool first (so the displayed pool shrinks and can't be
// over-spent), then runs the escrow transfer through the exactly-once saga.
export async function POST(request: NextRequest) {
  if (!checkAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isOnionConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }

  let body: { recipientUsername?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { recipientUsername, amount } = body;
  if (
    typeof recipientUsername !== "string" ||
    !recipientUsername ||
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > MAX_PAYOUT
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const repos = getRepos();
  const view = computePoolView();

  // Reserve against the total accrued pool (the repo re-checks committed payouts
  // inside the txn, so concurrent payouts can't both pass a stale pool figure).
  const w = repos.withdrawals.reservePoolWithdrawal(
    "payout",
    recipientUsername,
    amount,
    view.poolAccrued
  );
  if (!w) {
    return NextResponse.json(
      { error: "exceeds_pool", prizePool: view.prizePool },
      { status: 409 }
    );
  }

  const status = await settleWithdrawal(w);
  const after = computePoolView();
  return NextResponse.json({
    status, // 'completed' | 'pending' | 'failed'
    withdrawalId: w.id,
    amount: w.amount,
    prizePool: after.prizePool,
  });
}
