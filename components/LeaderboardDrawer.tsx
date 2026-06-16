"use client";

import { useCallback, useEffect, useState } from "react";
import type { LeaderboardEntry } from "@/lib/data/repo";
import type { ArcadeGame } from "@/lib/games/types";
import { usePlayer } from "@/components/PlayerProvider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface LeaderboardDrawerProps {
  game: ArcadeGame;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeaderboardDrawer({
  game,
  open,
  onOpenChange,
}: LeaderboardDrawerProps) {
  const { playerId } = usePlayer();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/scores?gameId=${game.id}&limit=10`
    );
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries);
    }
    setLoading(false);
  }, [game.id]);

  useEffect(() => {
    if (open) {
      fetchLeaderboard();
    }
  }, [open, fetchLeaderboard]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="animate-fade-in border-l-[0.5px] border-[var(--border-subtle)] bg-[var(--surface)] sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="text-[var(--text)]">
            {game.name} Leaderboard
          </SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-6">
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No scores yet. Be the first!
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-[0.5px] border-[var(--border-subtle)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="pb-3 pr-3 font-medium">#</th>
                  <th className="pb-3 pr-3 font-medium">Player</th>
                  <th className="pb-3 text-right font-medium">
                    {game.scoreLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isCurrent = entry.player_id === playerId;
                  return (
                    <tr
                      key={`${entry.player_id}-${entry.rank}`}
                      className={
                        isCurrent
                          ? "border-b-[0.5px] border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text)] transition-[background-color] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                          : "border-b-[0.5px] border-[var(--border-subtle)] text-[var(--text)] transition-[background-color] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                      }
                    >
                      <td className="py-3 pr-3 tabular-nums text-[var(--text-muted)]">
                        {entry.rank}
                      </td>
                      <td className="py-3 pr-3">
                        {entry.handle ?? "Anonymous"}
                        {isCurrent && (
                          <span className="ml-1.5 text-xs font-medium text-[var(--highlight)]">
                            you
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums">
                        {Math.round(entry.value)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
