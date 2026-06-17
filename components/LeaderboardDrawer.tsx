"use client";

import { useEffect, useState } from "react";
import type { LeaderboardEntry } from "@/lib/data/repo";
import type { ArcadeGame, GlowColor } from "@/lib/games/types";
import { usePlayer } from "@/components/PlayerProvider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// Each game keeps its signature neon hue; map the glow token onto the
// arcade neon var that tints this drawer's accents (matches GameGrid).
const GLOW_VAR: Record<GlowColor, string> = {
  green: "var(--neon-primary)",
  red: "var(--neon-red)",
  purple: "var(--neon-accent)",
  blue: "var(--neon-cyan)",
  orange: "var(--neon-yellow)",
};

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
  const neon = GLOW_VAR[game.glow];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/scores?gameId=${game.id}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        if (!cancelled) setEntries(data.entries);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, game.id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        style={{ ["--drawer-neon" as string]: neon }}
        className="scanlines animate-fade-in border-l-[3px] border-[var(--border-strong)] bg-[var(--surface)] sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="retro text-[0.7rem] uppercase leading-relaxed tracking-wider text-[var(--drawer-neon)] neon-text-subtle">
            {game.name}
            <span className="mt-2 block text-[0.5rem] tracking-[0.3em] text-[var(--text-muted)]">
              &gt; LEADERBOARD
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-6">
          {loading ? (
            <p className="retro text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
              Loading
              <span className="cursor-blink">_</span>
            </p>
          ) : entries.length === 0 ? (
            <p className="retro text-[0.6rem] uppercase leading-relaxed tracking-wider text-[var(--text-muted)]">
              &gt; No scores yet.
              <br />
              Be the first!
            </p>
          ) : (
            <div>
              <div className="grid grid-cols-[2.5rem_1fr_auto] items-end gap-3 pb-3 retro text-[0.5rem] uppercase tracking-wider text-[var(--text-faint)]">
                <span>#</span>
                <span>Player</span>
                <span className="text-right">{game.scoreLabel}</span>
              </div>
              <div className="pixel-divider opacity-50" />
              <ul>
                {entries.map((entry) => {
                  const isCurrent = entry.player_id === playerId;
                  const isTop = entry.rank === 1;
                  return (
                    <li
                      key={`${entry.player_id}-${entry.rank}`}
                      className="border-b-[3px] border-dashed border-[var(--border-strong)] opacity-100 last:border-b-0"
                    >
                      <div
                        className={
                          isCurrent
                            ? "grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 bg-[var(--surface-elevated)] py-3 text-[var(--text)] transition-[background-color] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                            : "grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 py-3 text-[var(--text)] transition-[background-color] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                        }
                      >
                        <span
                          className={
                            isTop
                              ? "retro text-[0.6rem] tabular-nums text-[var(--drawer-neon)] neon-text-subtle"
                              : "retro text-[0.6rem] tabular-nums text-[var(--text-muted)]"
                          }
                        >
                          {String(entry.rank).padStart(2, "0")}
                        </span>
                        <span className="flex items-center gap-1.5 retro text-[0.6rem]">
                          {entry.handle ?? "Anonymous"}
                          {isCurrent && (
                            <span className="pixel-badge retro text-[0.5rem] text-[var(--drawer-neon)]">
                              you
                            </span>
                          )}
                        </span>
                        <span className="retro text-[0.6rem] tabular-nums text-right">
                          {Math.round(entry.value)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
