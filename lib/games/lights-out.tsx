"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "./types";

type Phase = "ready" | "sequence" | "hold" | "go" | "falseStart" | "result";

const LIGHT_COUNT = 5;
const LIGHT_INTERVAL_MS = 1000;
const HOLD_MIN_MS = 500;
const HOLD_MAX_MS = 3000;

function ratingFor(ms: number) {
  if (ms < 180) return { label: "LIGHTNING", color: "var(--neon-primary)" };
  if (ms < 250) return { label: "QUICK", color: "var(--neon-cyan)" };
  if (ms < 350) return { label: "DECENT", color: "var(--neon-yellow)" };
  return { label: "SLUGGISH", color: "var(--neon-red)" };
}

export function LightsOut({ onScore, personalBest, disabled }: GameProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [litCount, setLitCount] = useState(0);
  const [reactionMs, setReactionMs] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const goTimeRef = useRef<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rafRef = useRef<number | null>(null);
  const submittedRef = useRef(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setPhase("ready");
    setLitCount(0);
    setReactionMs(0);
    setIsNewBest(false);
    goTimeRef.current = null;
    submittedRef.current = false;
  }, [clearTimers]);

  const startSequence = useCallback(() => {
    if (disabled) return;
    clearTimers();
    setPhase("sequence");
    setLitCount(0);
    goTimeRef.current = null;
    submittedRef.current = false;

    // Drive the light-up cadence on animation frames so the visual transitions
    // stay aligned with the render loop (esp. on high-refresh displays). The
    // intervals/scoring are unchanged: each light lights at (i+1)*INTERVAL,
    // then a randomized hold precedes GO.
    const startedAt = performance.now();
    let shown = 0;

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const due = Math.min(
        LIGHT_COUNT,
        Math.floor(elapsed / LIGHT_INTERVAL_MS),
      );
      if (due > shown) {
        shown = due;
        setLitCount(shown);
        if (shown === LIGHT_COUNT) {
          rafRef.current = null;
          setPhase("hold");
          const holdMs =
            HOLD_MIN_MS + Math.random() * (HOLD_MAX_MS - HOLD_MIN_MS);
          const goTimer = setTimeout(() => {
            goTimeRef.current = performance.now();
            setLitCount(0);
            setPhase("go");
          }, holdMs);
          timersRef.current.push(goTimer);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, clearTimers]);

  const handleTap = useCallback(() => {
    if (disabled) return;

    if (phase === "ready") {
      startSequence();
      return;
    }

    if (phase === "sequence" || phase === "hold") {
      clearTimers();
      setPhase("falseStart");
      return;
    }

    if (phase === "go" && goTimeRef.current !== null) {
      const reaction = performance.now() - goTimeRef.current;
      setReactionMs(reaction);
      const newBest = personalBest === null ? true : reaction < personalBest;
      setIsNewBest(newBest);
      setPhase("result");
      if (!submittedRef.current) {
        submittedRef.current = true;
        onScore(reaction);
      }
    }
  }, [disabled, phase, personalBest, onScore, startSequence, clearTimers]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isFormField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (target?.isContentEditable ?? false);
      if (isFormField) return;
      e.preventDefault();
      handleTap();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleTap]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const isInteractive =
    !disabled && phase !== "result" && phase !== "falseStart";
  const showLights = phase === "sequence" || phase === "hold" || phase === "go";
  const rating = ratingFor(reactionMs);

  return (
    <div
      onClick={isInteractive ? handleTap : undefined}
      className={`flex h-full w-full select-none flex-col items-center justify-center gap-8 p-8 text-center text-[var(--text)]${
        isInteractive ? " cursor-pointer" : ""
      }`}
    >
      {phase === "ready" && (
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <p className="arcade-title text-5xl font-bold uppercase text-[var(--text)]">
            Lights Out
          </p>
          <p className="text-base text-[var(--text-muted)]">
            React the instant the lights go dark
          </p>
          <p className="mt-2 text-sm text-[var(--text-faint)]">
            Press{" "}
            <kbd className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[var(--text-muted)]">
              SPACE
            </kbd>{" "}
            or tap to start
          </p>
        </div>
      )}

      {showLights && (
        <div className="flex gap-6">
          {Array.from({ length: LIGHT_COUNT }).map((_, i) => {
            const lit = litCount > i && phase !== "go";
            return (
              <div
                key={i}
                className="h-14 w-14 rounded-full border-[0.5px] transition-[background-color,border-color,box-shadow] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  borderColor: lit ? "var(--neon-red)" : "var(--border-subtle)",
                  backgroundColor: lit ? "var(--neon-red)" : "var(--surface)",
                  boxShadow: lit
                    ? "inset 0 0 0 1px var(--neon-red), 0 0 16px var(--neon-red)"
                    : "0 0 0 0.5px var(--border-subtle)",
                }}
              />
            );
          })}
        </div>
      )}

      {phase === "go" && (
        <p className="arcade-title text-7xl font-bold uppercase text-[var(--neon-primary)] animate-scale-in">
          GO
        </p>
      )}

      {phase === "falseStart" && (
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <p className="arcade-title text-5xl font-bold uppercase text-[var(--neon-red)]">
            Jump Start
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            You went before the lights died.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              reset();
            }}
            className="mt-2 rounded-lg border border-[var(--border-strong)] bg-transparent px-6 py-2 text-sm font-medium uppercase tracking-wider text-[var(--text)] transition-[color,background-color,border-color] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[var(--neon-red)] hover:text-[var(--neon-red)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-red)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            Back to grid
          </button>
        </div>
      )}

      {phase === "result" && (
        <div className="flex flex-col items-center gap-4 animate-rise-in">
          <p
            className="text-sm font-medium uppercase tracking-wide text-[var(--text-muted)]"
          >
            {rating.label}
          </p>
          <p
            style={{ color: rating.color }}
            className="font-mono text-7xl font-semibold"
          >
            {Math.round(reactionMs)}
            <span className="ml-1 text-2xl font-normal text-[var(--text-muted)]">
              ms
            </span>
          </p>

          {isNewBest && (
            <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-[var(--text-muted)]">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "var(--neon-accent)" }}
                aria-hidden="true"
              />
              New personal best
            </p>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              reset();
            }}
            className="mt-2 rounded-lg border border-[var(--border-strong)] bg-transparent px-6 py-2 text-sm font-medium uppercase tracking-wider text-[var(--text)] transition-[color,background-color,border-color] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[var(--neon-primary)] hover:text-[var(--neon-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
