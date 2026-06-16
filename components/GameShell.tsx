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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/scores?gameId=${game.id}&playerId=${playerId}&personalBest=1`
      );
      if (res.ok) {
        const data = await res.json();
        if (!cancelled) setPersonalBest(data.personalBest);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game.id, playerId]);

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
            onScore={onScore}
            personalBest={personalBest}
            disabled={drawerOpen || submitting || handlePromptOpen}
          />
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

      <Dialog open={handlePromptOpen} onOpenChange={setHandlePromptOpen}>
        <DialogContent
          showCloseButton={false}
          className="animate-scale-in gap-6 rounded-none !border-[3px] !border-[var(--neon-primary)] !bg-[var(--surface)]"
        >
          <DialogHeader>
            <DialogTitle className="retro text-xs uppercase tracking-wider neon-text-subtle text-[var(--neon-primary)]">
              Enter your initials
            </DialogTitle>
            <DialogDescription className="text-base leading-relaxed text-[var(--text-muted)]">
              Set your name to appear on the leaderboard.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
            placeholder="Your handle"
            maxLength={32}
            className="rounded-none border-[3px] border-[var(--border-strong)] bg-[var(--bg)] text-[var(--text)]"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleHandleSubmit();
            }}
          />
          <DialogFooter className="!bg-transparent border-t-[3px] border-dashed border-[var(--border-strong)] pt-4 opacity-100">
            <PixelButton
              variant="solid"
              onClick={handleHandleSubmit}
              disabled={!handleInput.trim() || submitting}
              className="retro text-[0.6rem] tracking-wider"
              style={{ ["--pixel-edge" as string]: "var(--neon-primary)" }}
            >
              Save & submit score
            </PixelButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
