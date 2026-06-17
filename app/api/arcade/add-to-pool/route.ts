import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRepos } from "@/lib/data/sqlite";
import { checkAdminSecret, isOnionConfigured } from "@/lib/onions/config";
import { OnionApiError, createDeposit, findTransaction } from "@/lib/onions/onionApi";
import { computeArcadeView, isGameId, POOL_CAP } from "@/lib/arcade/pool";

export const dynamic = "force-dynamic";

const TERMINAL_FAILURE = new Set(["denied", "failed", "cancelled", "canceled", "expired"]);

// POST /api/onions/arcade/add-to-pool { gameId, adminUsername, amount }
// REAL seed: deposits the admin's OWN onions into the arcade escrow for a game's
// pool. The admin approves the deposit in their OnionDAO portal; the pool's
// 'add' event is recorded ONLY once the real onions actually land (poll below).
// No phantom — the pool never rises without escrow rising by the same amount.
export async function POST(request: NextRequest) {
  if (!checkAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isOnionConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }

  let body: { gameId?: string; adminUsername?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { gameId, adminUsername, amount } = body;
  if (!isGameId(gameId)) {
    return NextResponse.json({ error: "invalid_game" }, { status: 400 });
  }
  if (typeof adminUsername !== "string" || !adminUsername.trim()) {
    return NextResponse.json({ error: "username_required" }, { status: 400 });
  }
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > POOL_CAP) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  // Don't seed more than the pool can hold.
  const view = computeArcadeView(gameId);
  if (amount > view.capRemaining) {
    return NextResponse.json(
      { error: "exceeds_cap", capRemaining: view.capRemaining },
      { status: 400 }
    );
  }

  const repos = getRepos();
  const externalId = "arcadeseed_" + gameId + "_" + randomUUID();
  const seed = repos.deposits.createSeed(externalId, amount, gameId);
  try {
    await createDeposit(adminUsername.trim(), amount, externalId);
  } catch (e) {
    // Only a definitive 4xx rejection means the deposit was NOT created. On a
    // network/5xx blip the deposit may have landed (idempotent externalId) and
    // the admin can still approve it — leave the seed pending so the GET poll /
    // callback can settle it; return the depositId so the UI keeps polling.
    const definitive =
      e instanceof OnionApiError && e.status >= 400 && e.status < 500;
    if (definitive) repos.deposits.markStatus(seed.id, "failed");
    return NextResponse.json(
      { error: "deposit_failed", depositId: definitive ? undefined : seed.id },
      { status: 502 }
    );
  }
  return NextResponse.json({ depositId: seed.id });
}

// GET /api/onions/arcade/add-to-pool?depositId= — poll a seed deposit. When the
// real onions land, record the pool 'add' event exactly once (settleSeedOnce).
export async function GET(request: NextRequest) {
  if (!checkAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const depositId = request.nextUrl.searchParams.get("depositId");
  if (!depositId) {
    return NextResponse.json({ error: "depositId required" }, { status: 400 });
  }
  const repos = getRepos();
  const dep = repos.deposits.getById(depositId);
  if (!dep || !dep.game_id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (dep.status === "completed") return NextResponse.json({ status: "completed" });
  if (dep.status === "failed") return NextResponse.json({ status: "failed" });
  if (!isOnionConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }

  let tx: Awaited<ReturnType<typeof findTransaction>>;
  try {
    tx = await findTransaction(dep.external_id);
  } catch {
    return NextResponse.json({ status: "pending" }, { status: 200 });
  }
  const status = tx?.status ?? "pending";
  const completedOk = status === "completed" && tx?.success !== false;

  if (completedOk) {
    const settled =
      typeof tx?.amount === "number" && tx.amount > 0 ? tx.amount : dep.amount;
    const spentAt = repos.ledger.spentTotalForGame(dep.game_id);
    repos.arcadePool.settleSeedOnce(dep.id, settled, spentAt, tx?.id);
    return NextResponse.json({ status: "completed" });
  }
  if (TERMINAL_FAILURE.has(status) || status === "completed") {
    repos.deposits.markStatus(dep.id, "failed", tx?.id);
    return NextResponse.json({ status: "failed" });
  }
  return NextResponse.json({ status });
}
