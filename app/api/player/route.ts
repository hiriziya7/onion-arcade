import { NextRequest, NextResponse } from "next/server";
import { getRepos, isUniqueViolation } from "@/lib/data/sqlite";
import { getOnionBalance, ensureWelcomeOnions } from "@/lib/onions/ledger";
import { normalizeOnionId, ONION_ID_RULE } from "@/lib/player/onionId";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const playerId = request.nextUrl.searchParams.get("playerId");
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const repos = getRepos();
  const player = repos.players.getOrCreatePlayer(playerId);
  ensureWelcomeOnions(playerId);

  return NextResponse.json({
    id: player.id,
    handle: player.handle,
    balance: getOnionBalance(playerId),
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { playerId, handle } = body;

    if (!playerId) {
      return NextResponse.json({ error: "playerId required" }, { status: 400 });
    }

    const onionId = normalizeOnionId(handle);
    if (!onionId) {
      return NextResponse.json(
        { error: "invalid", message: ONION_ID_RULE },
        { status: 400 }
      );
    }

    const repos = getRepos();
    repos.players.getOrCreatePlayer(playerId);
    ensureWelcomeOnions(playerId);

    // Every onion id stays unique. Reject if another player already owns it.
    const owner = repos.players.getPlayerByHandle(onionId);
    if (owner && owner.id !== playerId) {
      return NextResponse.json(
        { error: "taken", message: `${onionId} is already taken.` },
        { status: 409 }
      );
    }

    const player = repos.players.setHandle(playerId, onionId);

    return NextResponse.json({
      id: player.id,
      handle: player.handle,
      balance: getOnionBalance(playerId),
    });
  } catch (e) {
    // Lost the uniqueness race after the pre-check passed — report it as taken.
    if (isUniqueViolation(e)) {
      return NextResponse.json(
        { error: "taken", message: "That @id is already taken." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
