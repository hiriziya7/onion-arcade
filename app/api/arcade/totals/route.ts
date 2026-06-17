import { NextRequest, NextResponse } from "next/server";
import { checkAdminSecret, isOnionConfigured } from "@/lib/onions/config";
import { readEscrowTotal } from "@/lib/onions/onionApi";
import { computeDevAndTotals } from "@/lib/arcade/pool";

export const dynamic = "force-dynamic";

// GET /api/onions/arcade/totals — the "no onions went missing" check. Every real
// escrow onion is in exactly one bucket:
//   wallet  ≈  Σ(per-game prize pools) + dev balance + credits owed to players
// All pools are escrow-backed now (the phantom seed is gone), so there is no
// fudge term: drift >= 0 is the only safe state (a settled buy-in whose credit
// poll hasn't run yet); drift < 0 is a real shortfall (RED).
export async function GET(request: NextRequest) {
  if (!checkAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isOnionConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const dev = computeDevAndTotals();
  const books = dev.poolsTotal + dev.devBalance + dev.creditsOwed;

  let walletHeld: number;
  try {
    walletHeld = await readEscrowTotal();
  } catch {
    return NextResponse.json({ error: "wallet_unavailable" }, { status: 502 });
  }

  const drift = walletHeld - books;
  return NextResponse.json({
    configured: true,
    poolsTotal: dev.poolsTotal,
    perGamePools: dev.perGame.map((v) => ({ gameId: v.gameId, pool: v.pool })),
    devBalance: dev.devBalance,
    creditsOwed: dev.creditsOwed,
    books,
    walletHeld,
    drift,
    ok: drift >= 0,
  });
}
