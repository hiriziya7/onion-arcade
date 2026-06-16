"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "./types";
import { PixelPanel } from "@/components/ui/8bit/pixel-panel";
import { PixelButton } from "@/components/ui/8bit/pixel-button";

const TARGET_MS = 7000;

type Phase = "ready" | "running" | "result";

function ratingFor(offBy: number) {
  if (offBy < 40) return { label: "PERFECT", color: "var(--neon-primary)" };
  if (offBy < 150) return { label: "SHARP", color: "var(--neon-cyan)" };
  if (offBy < 400) return { label: "CLOSE", color: "var(--neon-yellow)" };
  return { label: "OFF BEAT", color: "var(--neon-red)" };
}

/**
 * Single calm pulse ring. Memoized + CSS-contained so game-state updates never
 * restart its loop or trigger layout/paint outside its own box.
 */
const PulseRing = memo(function PulseRing() {
  return (
    <span
      aria-hidden
      className="gpu-motion pointer-events-none absolute h-28 w-28 rounded-full border border-[var(--neon-primary)]"
      style={{
        animation: "pulse-ring 1.2s var(--ease) infinite",
        contain: "layout paint",
      }}
    />
  );
});

export function Seven({ onScore, personalBest, disabled }: GameProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [delta, setDelta] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const startRef = useRef<number | null>(null);
  const submittedRef = useRef(false);

  const reset = useCallback(() => {
    setPhase("ready");
    setElapsedMs(0);
    setDelta(0);
    setIsNewBest(false);
    startRef.current = null;
    submittedRef.current = false;
  }, []);

  const handleAction = useCallback(() => {
    if (disabled) return;

    if (phase === "ready") {
      startRef.current = performance.now();
      setPhase("running");
      return;
    }

    if (phase === "running" && startRef.current !== null) {
      const elapsed = performance.now() - startRef.current;
      const offBy = Math.abs(elapsed - TARGET_MS);
      setElapsedMs(elapsed);
      setDelta(offBy);
      const newBest = personalBest === null ? true : offBy < personalBest;
      setIsNewBest(newBest);
      setPhase("result");
      if (!submittedRef.current) {
        submittedRef.current = true;
        onScore(offBy, { elapsedMs: elapsed });
      }
    }
  }, [disabled, phase, personalBest, onScore]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target;
      const onBody = target === document.body;
      const inGame =
        target instanceof Element && target.closest(".game-container") !== null;
      const inField =
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable='true']") !==
          null;
      if ((onBody || inGame) && !inField) {
        e.preventDefault();
        handleAction();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleAction]);

  const isInteractive = !disabled && phase !== "result";
  const rating = ratingFor(delta);
  const accuracy = Math.max(0, 100 - (delta / TARGET_MS) * 100);

  return (
    <div
      onClick={isInteractive ? handleAction : undefined}
      className={`game-container flex h-full w-full select-none flex-col items-center justify-center gap-6 p-8 text-center text-[var(--text)]${
        isInteractive ? " cursor-pointer" : ""
      }`}
    >
      {phase === "ready" && (
        <div className="animate-fade-in flex flex-col items-center gap-6">
          <p className="retro arcade-title text-2xl sm:text-3xl uppercase text-[var(--neon-primary)] neon-text-subtle">
            Seven
          </p>
          <div className="h-[3px] w-40 border-b-[3px] border-dashed border-[var(--border-strong)] opacity-50" />
          <p className="text-base leading-relaxed text-[var(--text-muted)]">
            Stop the clock at exactly{" "}
            <span className="retro text-[0.7rem] text-[var(--text)]">7.000s</span>
          </p>
          <p className="retro text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
            Press{" "}
            <kbd className="retro rounded-none border-y-[3px] border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-[0.6rem] uppercase text-[var(--text)]">
              SPACE
            </kbd>{" "}
            or tap to start
          </p>
        </div>
      )}

      {phase === "running" && (
        <div className="animate-fade-in relative flex h-56 w-56 items-center justify-center">
          <PulseRing />
          <span className="arcade-title retro relative text-[5rem] sm:text-[7rem] leading-none text-[var(--neon-primary)] neon-text-subtle">
            7
          </span>
          <span className="absolute -bottom-8 retro text-[0.6rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
            tap to stop
          </span>
        </div>
      )}

      {phase === "result" && (
        <div className="animate-rise-in flex flex-col items-center gap-6">
          <PixelPanel
            tone="text-[var(--neon-primary)]"
            className="flex flex-col items-center gap-5 px-8 py-6"
          >
            <p
              className="retro arcade-title text-lg sm:text-xl uppercase tracking-[0.12em] neon-text-subtle"
              style={{ color: rating.color }}
            >
              {rating.label}
            </p>
            <div className="pixel-divider w-full opacity-50" />
            <p className="retro text-3xl sm:text-4xl leading-none text-[var(--text)]">
              {(elapsedMs / 1000).toFixed(3)}
              <span className="retro text-base text-[var(--text-muted)]">s</span>
            </p>
            <p
              className="retro text-[0.6rem] uppercase tracking-wider"
              style={{ color: rating.color }}
            >
              {Math.round(delta)} ms off target
            </p>

            {/* accuracy meter — sharp pixel bar with dashed frame */}
            <div className="w-56 border-[3px] border-dashed border-[var(--border-strong)] bg-[var(--bg-deep)] p-[3px]">
              <div
                className="h-2 transition-[width] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  width: `${accuracy}%`,
                  background: rating.color,
                }}
              />
            </div>

            {isNewBest && (
              <span className="pixel-badge retro text-[0.5rem] tracking-wider text-[var(--highlight)]">
                New personal best
              </span>
            )}
          </PixelPanel>

          <PixelButton
            type="button"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              reset();
            }}
            style={{ ["--pixel-edge"]: "var(--neon-primary)" } as React.CSSProperties}
          >
            Play again
          </PixelButton>
        </div>
      )}
    </div>
  );
}
