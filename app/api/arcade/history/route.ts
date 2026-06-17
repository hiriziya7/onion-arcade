import { NextRequest, NextResponse } from "next/server";
import { getRepos } from "@/lib/data/sqlite";
import { checkAdminSecret } from "@/lib/onions/config";

export const dynamic = "force-dynamic";

// GET /api/onions/arcade/history — log of past payouts + dev sends (when, who,
// how much) for the Payout history panel.
export async function GET(request: NextRequest) {
  if (!checkAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    history: getRepos().arcadePool.history(50),
  });
}
