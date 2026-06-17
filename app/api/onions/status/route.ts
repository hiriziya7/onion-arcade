import { NextResponse } from "next/server";
import { isOnionConfigured, GAME_COST } from "@/lib/onions/config";
import { computePoolView } from "@/lib/onions/accounting";

export const dynamic = "force-dynamic";

// Public status the UI branches on. Exposes ONLY safe values — never the
// escrow total, dev cut, or any secret. prizePool is the payable pool (the 90%
// share, minus payouts already taken); 0 when OnionDAO isn't configured.
export async function GET() {
  const configured = isOnionConfigured();
  const prizePool = configured ? computePoolView().prizePool : 0;
  return NextResponse.json({
    configured,
    gameCost: GAME_COST,
    prizePool,
  });
}
