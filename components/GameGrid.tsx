"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { games } from "@/lib/games";
import type { GlowColor } from "@/lib/games/types";
import { PixelPanel } from "@/components/ui/8bit/pixel-panel";

// Map each game's glow hue onto the arcade neon token that tints its cabinet
// frame. Reserved so a card reads as one focal neon, not a full fill.
const GLOW_VAR: Record<GlowColor, string> = {
  green: "var(--neon-primary)",
  red: "var(--neon-red)",
  purple: "var(--neon-accent)",
  blue: "var(--neon-cyan)",
  orange: "var(--neon-yellow)",
};

export function GameGrid() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {games.map((game, i) => {
        const Preview = game.Preview;
        const neon = GLOW_VAR[game.glow];
        // Catalog ordinal — 1-based, zero-padded to two digits so the cards
        // read as numbered cabinets on a shelf.
        const ordinal = String(i + 1).padStart(2, "0");
        return (
          <Link
            key={game.id}
            href={`/play/${game.id}`}
            className="group block rounded-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-deep)]"
            aria-label={`Play ${game.name}`}
          >
            <PixelPanel
              tone="text-[var(--card-neon)]"
              style={{ ["--card-neon" as string]: neon }}
              className="h-full [will-change:transform] transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1 group-active:translate-y-1"
            >
              <div className="flex h-full min-h-[320px] flex-col gap-6 p-6">
                {/* Index ledger — ordinal left, unit of measure right. */}
                <div className="flex items-center justify-between text-[0.6rem] uppercase leading-none text-[var(--text-faint)]">
                  <span aria-hidden="true" className="retro tabular-nums text-[var(--card-neon)]">
                    {ordinal}
                  </span>
                  <span aria-hidden="true" className="retro">
                    {game.scoreLabel}
                  </span>
                </div>

                {/* Quiet animated mark */}
                <div className="min-h-0 flex-1">
                  <Preview />
                </div>

                {/* Footer */}
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <h3 className="retro flex items-center gap-2 text-sm leading-tight text-[var(--text)]">
                      <span aria-hidden="true" className="text-[var(--card-neon)]">
                        &gt;
                      </span>
                      <span className="truncate">{game.name}</span>
                      <span
                        aria-hidden="true"
                        className="ml-auto h-2 w-2 shrink-0 bg-[var(--card-neon)] opacity-70 transition-opacity duration-[240ms] group-hover:opacity-100"
                      />
                    </h3>
                    <div aria-hidden="true" className="pixel-divider" />
                    <p className="text-sm leading-snug text-[var(--text-muted)]">
                      {game.tagline}
                    </p>
                  </div>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="pixelated h-5 w-5 shrink-0 text-[var(--card-neon)] opacity-0 transition-opacity duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                </div>
              </div>
            </PixelPanel>
          </Link>
        );
      })}
    </div>
  );
}
