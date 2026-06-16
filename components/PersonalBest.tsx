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
    <div className="flex items-center gap-3 rounded-[var(--radius)] border-[0.5px] border-[var(--border-subtle)] px-4 py-2 text-sm">
      <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--text-muted)]">
        Best
      </span>
      <span className="font-semibold text-[var(--text)]">{display}</span>
    </div>
  );
}
