"use client";

import type { ArcadeGame } from "@/lib/games/types";

interface PersonalBestProps {
  game: ArcadeGame;
  value: number | null;
}

export function PersonalBest({ game, value }: PersonalBestProps) {
  const display =
    value === null ? "—" : `${Math.round(value)} ${game.scoreLabel}`;

  return (
    <div className="pixel-badge retro text-[0.6rem] text-[var(--neon-primary)]">
      <span className="tracking-wider">Best</span>
      <span className="text-[var(--text)]">{display}</span>
    </div>
  );
}
