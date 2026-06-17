"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PixelPanel } from "@/components/ui/8bit/pixel-panel";
import { PixelButton } from "@/components/ui/8bit/pixel-button";
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
        <PixelPanel
          tone="text-[var(--neon-red)]"
          className="animate-fade-in"
        >
          <div className="flex flex-col items-center gap-4 p-8">
            <p className="retro neon-text-subtle text-2xl uppercase text-[var(--neon-red)]">
              Lights Out
            </p>
            <div aria-hidden="true" className="pixel-divider w-full" />
            <p className="text-base leading-relaxed text-[var(--text-muted)]">
              React the instant the lights go dark
            </p>
            <p className="retro mt-2 text-[0.6rem] uppercase tracking-wider text-[var(--text-faint)]">
              Press{" "}
              <kbd className="border-y-[3px] border-[var(--border-strong)] bg-[var(--surface)] px-2 py-0.5 retro text-[0.6rem] uppercase text-[var(--text-muted)]">
                SPACE
              </kbd>{" "}
              or tap to start
            </p>
          </div>
        </PixelPanel>
      )}

      {showLights && (
        <div className="flex gap-6">
          {Array.from({ length: LIGHT_COUNT }).map((_, i) => {
            const lit = litCount > i && phase !== "go";
            return (
              <div
                key={i}
                className="pixelated h-14 w-14 rounded-none border-[3px] transition-[background-color,border-color,box-shadow] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  borderColor: lit ? "var(--neon-red)" : "var(--border-strong)",
                  backgroundColor: lit ? "var(--neon-red)" : "var(--surface)",
                  boxShadow: lit
                    ? "4px 4px 0 0 #000, 0 0 16px var(--neon-red)"
                    : "4px 4px 0 0 #000",
                }}
              />
            );
          })}
        </div>
      )}

      {phase === "go" && (
        <p className="retro neon-text-subtle text-5xl uppercase text-[var(--neon-primary)] animate-scale-in">
          GO
        </p>
      )}

      {phase === "falseStart" && (
        <PixelPanel
          tone="text-[var(--neon-red)]"
          className="animate-fade-in"
        >
          <div className="flex flex-col items-center gap-4 p-8">
            <p className="retro neon-text-subtle text-2xl uppercase text-[var(--neon-red)]">
              Jump Start
            </p>
            <div aria-hidden="true" className="pixel-divider w-full" />
            <p className="text-base leading-relaxed text-[var(--text-muted)]">
              You went before the lights died.
            </p>
            <PixelButton
              type="button"
              variant="outline"
              style={{ ["--pixel-edge" as string]: "var(--neon-red)" }}
              className="mt-2"
              onClick={(e) => {
                e.stopPropagation();
                reset();
              }}
            >
              Back to grid
            </PixelButton>
          </div>
        </PixelPanel>
      )}

      {phase === "result" && (
        <PixelPanel
          tone="text-[var(--neon-red)]"
          className="animate-rise-in"
        >
          <div className="flex flex-col items-center gap-4 p-8">
            <p
              className="retro text-[0.6rem] uppercase tracking-wider"
              style={{ color: rating.color }}
            >
              {rating.label}
            </p>
            <p
              style={{ color: rating.color }}
              className="retro text-4xl"
            >
              {Math.round(reactionMs)}
              <span className="ml-2 retro text-sm text-[var(--text-muted)]">
                ms
              </span>
            </p>

            {isNewBest && (
              <p className="pixel-badge retro text-[0.5rem] tracking-wider text-[var(--neon-red)]">
                New personal best
              </p>
            )}

            <div aria-hidden="true" className="pixel-divider w-full" />

            <PixelButton
              type="button"
              variant="solid"
              style={{ ["--pixel-edge" as string]: "var(--neon-red)" }}
              className="mt-2"
              onClick={(e) => {
                e.stopPropagation();
                reset();
              }}
            >
              Play again
            </PixelButton>
          </div>
        </PixelPanel>
      )}
    </div>
  );
}
