import { NextRequest, NextResponse } from "next/server";
import { getRepos } from "@/lib/data/sqlite";
import { checkAdminSecret, isOnionConfigured } from "@/lib/onions/config";
import { computePoolView } from "@/lib/onions/accounting";
import { settleWithdrawal } from "@/lib/onions/cashout";

export const dynamic = "force-dynamic";

const MAX_WITHDRAW = 100000;

// POST /api/onions/dev-withdraw — pull the accrued 10% dev cut out of escrow to
// a recipient OnionDAO username. Admin-gated; capped at the remaining dev cut.
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
    amount > MAX_WITHDRAW
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const repos = getRepos();
  const view = computePoolView();
  const w = repos.withdrawals.reservePoolWithdrawal(
    "dev",
    recipientUsername,
    amount,
    view.devAccrued
  );
  if (!w) {
    return NextResponse.json(
      { error: "exceeds_dev_cut", devRemaining: view.devRemaining },
      { status: 409 }
    );
  }

  const status = await settleWithdrawal(w);
  const after = computePoolView();
  return NextResponse.json({
    status,
    withdrawalId: w.id,
    amount: w.amount,
    devRemaining: after.devRemaining,
  });
}
