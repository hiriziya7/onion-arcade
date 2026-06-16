"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "./types";

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
          <p className="arcade-title text-6xl font-black uppercase text-[var(--text)]">
            Seven
          </p>
          <p className="text-base text-[var(--text-muted)]">
            Stop the clock at exactly{" "}
            <span className="font-mono text-[var(--text)]">7.000s</span>
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            Press{" "}
            <kbd className="rounded-sm border-[0.5px] border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-0.5 font-mono">
              SPACE
            </kbd>{" "}
            or tap to start
          </p>
        </div>
      )}

      {phase === "running" && (
        <div className="animate-fade-in relative flex h-56 w-56 items-center justify-center">
          <PulseRing />
          <span className="arcade-title relative text-[7rem] sm:text-[9rem] font-black leading-none text-[var(--text)]">
            7
          </span>
          <span className="absolute -bottom-6 text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
            tap to stop
          </span>
        </div>
      )}

      {phase === "result" && (
        <div className="animate-rise-in flex flex-col items-center gap-6">
          <p
            className="arcade-title text-2xl font-semibold uppercase tracking-[0.18em]"
            style={{ color: rating.color }}
          >
            {rating.label}
          </p>
          <p className="font-mono text-5xl font-bold text-[var(--text)]">
            {(elapsedMs / 1000).toFixed(3)}
            <span className="text-2xl text-[var(--text-muted)]">s</span>
          </p>
          <p
            className="font-mono text-sm"
            style={{ color: rating.color }}
          >
            {Math.round(delta)} ms off target
          </p>

          {/* accuracy meter — color conveys feedback, no glow */}
          <div className="h-1.5 w-56 overflow-hidden rounded-full border-[0.5px] border-[var(--border-subtle)] bg-[var(--bg-deep)]">
            <div
              className="h-full rounded-full transition-[width] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                width: `${accuracy}%`,
                background: rating.color,
              }}
            />
          </div>

          {isNewBest && (
            <p className="text-sm font-medium uppercase tracking-wide text-[var(--highlight)]">
              New personal best
            </p>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              reset();
            }}
            className="mt-2 rounded-lg border-[0.5px] border-[var(--border-strong)] bg-transparent px-6 py-2 text-sm font-medium uppercase tracking-wider text-[var(--text)] transition-[color,background-color,border-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[var(--neon-primary)] hover:text-[var(--neon-primary)] focus-visible:ring-2 focus-visible:ring-[var(--neon-primary)] focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
