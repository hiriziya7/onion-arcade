"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Trophy } from "lucide-react";
import type { ArcadeGame, GlowColor } from "@/lib/games/types";
import { usePlayer } from "@/components/PlayerProvider";
import { PersonalBest } from "@/components/PersonalBest";
import { LeaderboardDrawer } from "@/components/LeaderboardDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

export function GameShell({ game }: GameShellProps) {
  const { playerId, handle, setHandle, refresh } = usePlayer();
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [handlePromptOpen, setHandlePromptOpen] = useState(false);
  const [pendingScore, setPendingScore] = useState<{
    value: number;
    meta?: Record<string, unknown>;
  } | null>(null);
  const [handleInput, setHandleInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const accent = glowVar[game.glow];

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

  const submitScore = useCallback(
    async (
      value: number,
      meta?: Record<string, unknown>,
      handleOverride?: string
    ) => {
      setSubmitting(true);
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: game.id,
          playerId,
          value,
          meta,
          handle: handleOverride,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPersonalBest(data.personalBest);
        await refresh();
      }
      setSubmitting(false);
    },
    [game.id, playerId, refresh]
  );

  const onScore = useCallback(
    (value: number, meta?: Record<string, unknown>) => {
      if (!handle) {
        setPendingScore({ value, meta });
        setHandlePromptOpen(true);
        return;
      }
      submitScore(value, meta);
    },
    [handle, submitScore]
  );

  const handleHandleSubmit = useCallback(async () => {
    const trimmed = handleInput.trim();
    if (!trimmed || !pendingScore) return;
    await setHandle(trimmed);
    await submitScore(pendingScore.value, pendingScore.meta, trimmed);
    setPendingScore(null);
    setHandlePromptOpen(false);
    setHandleInput("");
  }, [handleInput, pendingScore, setHandle, submitScore]);

  const GameComponent = game.Component;

  return (
    <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-5 md:py-8">
      {/* Top controls */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-[var(--text-muted)] transition-[color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[var(--text)]"
        >
          <ChevronLeft className="h-4 w-4" />
          Arcade
        </Link>

        <h1 className="arcade-title hidden text-lg font-medium uppercase text-[var(--text-muted)] sm:block">
          {game.name}
        </h1>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setDrawerOpen(true)}
          className="gap-1.5"
        >
          <Trophy className="h-3.5 w-3.5 text-[var(--onion)]" />
          Leaderboard
        </Button>
      </div>

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
        <div
          className="group relative flex flex-1 items-stretch overflow-hidden rounded-[var(--radius)] border bg-[var(--bg-deep)]"
          style={{
            borderColor: accent,
            boxShadow: `0 0 40px -12px ${accent}, inset 0 0 40px -30px ${accent}`,
          }}
        >
          {/* corner brackets */}
          {(
            [
              "left-3 top-3 border-l border-t",
              "right-3 top-3 border-r border-t",
              "left-3 bottom-3 border-l border-b",
              "right-3 bottom-3 border-r border-b",
            ] as const
          ).map((pos) => (
            <span
              key={pos}
              aria-hidden
              className={`pointer-events-none absolute h-5 w-5 rounded-[3px] ${pos}`}
              style={{ borderColor: accent, opacity: 0.65 }}
            />
          ))}

          <GameComponent
            onScore={onScore}
            personalBest={personalBest}
            disabled={drawerOpen || submitting || handlePromptOpen}
          />
        </div>

        <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
          {game.objective}
        </p>
      </div>

      <LeaderboardDrawer
        game={game}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />

      <Dialog open={handlePromptOpen} onOpenChange={setHandlePromptOpen}>
        <DialogContent
          showCloseButton={false}
          className="!bg-[var(--glass-bg)] !border !border-[var(--glass-border)] animate-scale-in gap-6 rounded-[var(--radius)]"
        >
          <DialogHeader>
            <DialogTitle className="arcade-title text-[var(--text)]">
              Enter your initials
            </DialogTitle>
            <DialogDescription className="text-[var(--text-muted)]">
              Set your name to appear on the leaderboard.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
            placeholder="Your handle"
            maxLength={32}
            className="border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)]"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleHandleSubmit();
            }}
          />
          <DialogFooter className="!bg-transparent border-t-[0.5px] border-[var(--border-subtle)] pt-4">
            <Button
              onClick={handleHandleSubmit}
              disabled={!handleInput.trim() || submitting}
            >
              Save & submit score
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
