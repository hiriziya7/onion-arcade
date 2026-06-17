import { NextRequest, NextResponse } from "next/server";
import { checkAdminSecret, isOnionConfigured } from "@/lib/onions/config";
import { reconcile, retryPending } from "@/lib/onions/reconcile";

export const dynamic = "force-dynamic";

// GET  /api/onions/admin/reconcile          -> the no-loss report (drift vs live escrow)
// POST /api/onions/admin/reconcile?action=retry -> drive pending withdrawals to terminal
// Both admin-secret gated; never exposes secrets.
export async function GET(request: NextRequest) {
  if (!checkAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isOnionConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }
  try {
    return NextResponse.json(await reconcile());
  } catch {
    return NextResponse.json(
      { error: "upstream_unavailable" },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!checkAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isOnionConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }
  const action = request.nextUrl.searchParams.get("action");
  if (action !== "retry") {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
  try {
    const retried = await retryPending();
    return NextResponse.json({ ...retried, report: await reconcile() });
  } catch {
    return NextResponse.json(
      { error: "upstream_unavailable" },
      { status: 502 }
    );
  }
}
