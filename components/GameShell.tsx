"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Trophy } from "lucide-react";
import type { ArcadeGame, GlowColor } from "@/lib/games/types";
import { usePlayer } from "@/components/PlayerProvider";
import { PersonalBest } from "@/components/PersonalBest";
import { LeaderboardDrawer } from "@/components/LeaderboardDrawer";
import { PixelButton } from "@/components/ui/8bit/pixel-button";
import { PixelPanel } from "@/components/ui/8bit/pixel-panel";
import { GAME_COST } from "@/lib/onions/cost";

interface GameShellProps {
  game: ArcadeGame;
}

const glowVar: Record<GlowColor, string> = {
  green: "var(--neon-primary)",
  red: "var(--neon-red)",
  purple: "var(--neon-accent)",
  blue: "var(--neon-cyan)",
  orange: "var(--neon-yellow)",
};

// ░░░ DEBUG FREE PLAY — REMOVE BEFORE HOSTING ░░░
// When NEXT_PUBLIC_FREE_PLAY=1, the coin slot offers a "Free play" button that
// arms a round without charging onions. Off by default (production-safe even if
// this code is left in). To remove entirely: delete this const, the freePlay
// callback below, and the button in the coin-slot overlay.
const FREE_PLAY = process.env.NEXT_PUBLIC_FREE_PLAY === "1";

export function GameShell({ game }: GameShellProps) {
  const { playerId, refresh } = usePlayer();
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [armed, setArmed] = useState(false);
  const [roundKey, setRoundKey] = useState(0);
  const [coinError, setCoinError] = useState<string | null>(null);
  const [inserting, setInserting] = useState(false);
  // The server enforces the real cost (GAME_COST env); the client constant is
  // just the default shown until /api/onions/status reports the live value.
  const [gameCost, setGameCost] = useState<number>(GAME_COST);

  const accent = glowVar[game.glow];

  useEffect(() => {
    let active = true;
    fetch("/api/onions/status")
      .then((res) => res.json())
      .then((data) => {
        if (active && typeof data?.gameCost === "number") {
          setGameCost(data.gameCost);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const fetchPersonalBest = useCallback(async () => {
    const res = await fetch(
      `/api/scores?gameId=${game.id}&playerId=${playerId}&personalBest=1`
    );
    if (res.ok) {
      const data = await res.json();
      setPersonalBest(data.personalBest);
    }
  }, [game.id, playerId]);

  useEffect(() => {
    fetchPersonalBest();
  }, [fetchPersonalBest]);

  // Identity is claimed up front at the OnionIdGate, so by the time a score
  // lands the player already has an @id — just record it.
  const onScore = useCallback(
    async (value: number, meta?: Record<string, unknown>) => {
      setSubmitting(true);
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, playerId, value, meta }),
      });
      if (res.ok) {
        const data = await res.json();
        setPersonalBest(data.personalBest);
        await refresh();
      }
      setSubmitting(false);
      // Round is over — require a fresh coin before the next play. The overlay
      // re-covers the game's own Play-again button.
      setArmed(false);
    },
    [game.id, playerId, refresh]
  );

  const insertCoin = useCallback(async () => {
    setInserting(true);
    setCoinError(null);
    const res = await fetch("/api/onions/spend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, gameId: game.id }),
    });
    if (res.ok) {
      setArmed(true);
      setRoundKey((k) => k + 1);
      await refresh();
    } else if (res.status === 402) {
      setCoinError("Not enough onions — add more from the top bar");
    } else {
      setCoinError("Something went wrong — try again");
    }
    setInserting(false);
  }, [game.id, playerId, refresh]);

  // DEBUG FREE PLAY — REMOVE BEFORE HOSTING. Arms a round with no onion charge.
  const freePlay = useCallback(() => {
    setCoinError(null);
    setArmed(true);
    setRoundKey((k) => k + 1);
  }, []);

  const GameComponent = game.Component;

  return (
    <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-5 md:py-8">
      {/* Top controls */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link href="/" aria-label="Back to Arcade">
          <PixelButton
            variant="ghost"
            className="retro text-[0.6rem] tracking-wider"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Arcade
          </PixelButton>
        </Link>

        <h1
          className="retro hidden text-[0.7rem] uppercase tracking-wider neon-text-subtle sm:block"
          style={{ color: accent }}
        >
          {game.name}
        </h1>

        <PixelButton
          variant="outline"
          onClick={() => setDrawerOpen(true)}
          className="retro text-[0.6rem] tracking-wider"
          style={{ ["--pixel-edge" as string]: accent }}
        >
          <Trophy className="h-3.5 w-3.5" />
          Leaderboard
        </PixelButton>
      </div>

      {/* Header rule */}
      <div className="pixel-divider mb-6" aria-hidden="true" />

      {/* Personal best banner */}
      <div className="mb-6 flex justify-center">
        <PersonalBest game={game} value={personalBest} />
      </div>

      {/* Cabinet stage */}
      <div
        className={`relative flex flex-1 flex-col transition-opacity duration-[var(--dur-slow)] ease-[var(--ease)] ${
          drawerOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-hidden={drawerOpen}
      >
        <PixelPanel
          tone="text-current"
          className="group flex flex-1 items-stretch overflow-hidden !bg-[var(--bg-deep)]"
          contentClassName="flex flex-1"
          style={{ color: accent }}
        >
          {/* corner brackets */}
          {(
            [
              "left-3 top-3 border-l-[3px] border-t-[3px]",
              "right-3 top-3 border-r-[3px] border-t-[3px]",
              "left-3 bottom-3 border-l-[3px] border-b-[3px]",
              "right-3 bottom-3 border-r-[3px] border-b-[3px]",
            ] as const
          ).map((pos) => (
            <span
              key={pos}
              aria-hidden
              className={`pointer-events-none absolute z-20 h-4 w-4 ${pos}`}
              style={{ borderColor: accent, opacity: 0.65 }}
            />
          ))}

          <GameComponent
            key={roundKey}
            onScore={onScore}
            personalBest={personalBest}
            disabled={!armed || drawerOpen || submitting}
          />

          {/* Coin-slot paywall — covers the stage between rounds. */}
          {!armed && !drawerOpen && (
            <div
              className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-[var(--bg-deep)]/90 backdrop-blur-sm"
              style={{ borderColor: accent }}
            >
              <p className="retro text-center text-sm uppercase text-[var(--text)]">
                Insert {gameCost} 🧅 to play
              </p>
              <PixelButton
                type="button"
                variant="solid"
                onClick={insertCoin}
                disabled={inserting}
                className="retro text-[0.6rem] tracking-wider"
                style={
                  { ["--pixel-edge" as string]: accent } as React.CSSProperties
                }
              >
                {inserting ? "Inserting…" : "Insert coin"}
              </PixelButton>
              {/* DEBUG FREE PLAY — REMOVE BEFORE HOSTING */}
              {FREE_PLAY && (
                <PixelButton
                  type="button"
                  variant="ghost"
                  onClick={freePlay}
                  disabled={inserting}
                  className="retro text-[0.6rem] tracking-wider"
                >
                  Free play (debug)
                </PixelButton>
              )}
              {coinError && (
                <p
                  className="px-4 text-center text-xs"
                  style={{ color: "var(--neon-red)" }}
                >
                  {coinError}
                </p>
              )}
            </div>
          )}
        </PixelPanel>

        <p className="mt-5 text-center text-base leading-relaxed text-[var(--text-muted)]">
          <span className="retro mr-2 text-[0.6rem] text-[var(--text-faint)]">
            {">"}
          </span>
          {game.objective}
        </p>
      </div>

      <LeaderboardDrawer
        game={game}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
