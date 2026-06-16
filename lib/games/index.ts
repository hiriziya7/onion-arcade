import type { ArcadeGame, GameProps } from "./types";
import { gameMeta } from "./registry-data";
import { Seven } from "./seven";
import { LightsOut } from "./lights-out";
import { OnionChop } from "./onion-chop";
import {
  SevenPreview,
  LightsOutPreview,
  OnionChopPreview,
} from "@/components/game-previews";

interface GameParts {
  Component: React.FC<GameProps>;
  Preview: React.FC;
}

const parts: Record<string, GameParts> = {
  seven: { Component: Seven, Preview: SevenPreview },
  "lights-out": { Component: LightsOut, Preview: LightsOutPreview },
  "onion-chop": { Component: OnionChop, Preview: OnionChopPreview },
};

export const games: ArcadeGame[] = gameMeta.map((meta) => ({
  ...meta,
  ...parts[meta.id],
}));

export function getGame(gameId: string): ArcadeGame | undefined {
  return games.find((g) => g.id === gameId);
}
