import { NextRequest, NextResponse } from "next/server";
import { getRepos, isUniqueViolation } from "@/lib/data/sqlite";
import { isOnionConfigured } from "@/lib/onions/config";
import { OnionApiError, validateUsername } from "@/lib/onions/onionApi";

export const dynamic = "force-dynamic";

// POST /api/onions/claim — bind a real OnionDAO username to this player.
// Only used when OnionDAO is configured; otherwise the client falls back to the
// local @id flow handled by /api/player.
export async function POST(request: NextRequest) {
  try {
    const { playerId, username } = await request.json();

    if (!playerId || !username) {
      return NextResponse.json(
        { error: "playerId and username required" },
        { status: 400 }
      );
    }

    if (!isOnionConfigured()) {
      return NextResponse.json({ error: "not_configured" }, { status: 400 });
    }

    // The username must resolve to a real OnionDAO profile.
    const { exists } = await validateUsername(username);
    if (!exists) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const repos = getRepos();
    repos.players.getOrCreatePlayer(playerId);

    // Every handle stays unique. Reject if another player already owns it.
    const owner = repos.players.getPlayerByHandle(username);
    if (owner && owner.id !== playerId) {
      return NextResponse.json({ error: "taken" }, { status: 409 });
    }

    const player = repos.players.setHandle(playerId, username);

    return NextResponse.json({ handle: player.handle });
  } catch (e) {
    // OnionDAO unreachable / 5xx during validation — let the client offer a
    // retry instead of treating it as a malformed request.
    if (e instanceof OnionApiError) {
      return NextResponse.json(
        { error: "upstream_unavailable" },
        { status: 502 }
      );
    }
    // Lost the uniqueness race after the pre-check passed.
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "taken" }, { status: 409 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
