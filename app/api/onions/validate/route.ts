import { NextRequest, NextResponse } from "next/server";
import { isOnionConfigured } from "@/lib/onions/config";
import { validateUsername } from "@/lib/onions/onionApi";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isOnionConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json(
      { error: "username required" },
      { status: 400 }
    );
  }

  try {
    const result = await validateUsername(username);
    return NextResponse.json({
      configured: true,
      exists: result.exists,
      balanceType: result.balanceType,
      balance: result.balance,
    });
  } catch {
    // OnionDAO unreachable / 5xx — distinct from a clean "user not found".
    return NextResponse.json(
      { configured: true, error: "upstream_unavailable" },
      { status: 502 }
    );
  }
}
