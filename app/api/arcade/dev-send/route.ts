import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRepos } from "@/lib/data/sqlite";
import { checkAdminSecret, isOnionConfigured } from "@/lib/onions/config";
import { OnionApiError, transfer } from "@/lib/onions/onionApi";
import { computeDevAndTotals } from "@/lib/arcade/pool";

export const dynamic = "force-dynamic";

const DEFINITIVE_REJECT = new Set([400, 404, 409, 422]);

// POST /api/onions/arcade/dev-send { recipientUsername, amount } — draw from the
// AGGREGATE dev balance (rake + overflow across all games) to a recipient via a
// real escrow->user transfer, capped at the dev balance. Local mode records
// without a transfer. The devsend event is game-agnostic (game_id NULL).
export async function POST(request: NextRequest) {
  if (!checkAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { recipientUsername?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const recipient = body.recipientUsername?.trim();
  const { amount } = body;
  if (!recipient) {
    return NextResponse.json({ error: "recipient_required" }, { status: 400 });
  }
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const repos = getRepos();
  const dev = computeDevAndTotals();
  const sent = Math.min(amount, dev.devBalance);
  if (sent <= 0) {
    return NextResponse.json(
      { error: "insufficient_dev_balance", devBalance: dev.devBalance },
      { status: 400 }
    );
  }

  if (isOnionConfigured()) {
    try {
      await transfer(
        recipient,
        sent,
        "arcadedev_" + randomUUID(),
        "Arcade dev withdrawal"
      );
    } catch (e) {
      const code =
        e instanceof OnionApiError && DEFINITIVE_REJECT.has(e.status)
          ? e.status === 409
            ? "insufficient_escrow"
            : "rejected"
          : "transfer_failed";
      return NextResponse.json({ error: code }, { status: 502 });
    }
  }

  repos.arcadePool.addEvent("devsend", sent, 0, null, recipient);

  return NextResponse.json({
    sent,
    recipient,
    devBalance: dev.devBalance - sent,
  });
}
