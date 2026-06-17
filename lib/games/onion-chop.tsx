"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PixelPanel } from "@/components/ui/8bit/pixel-panel";
import { PixelButton } from "@/components/ui/8bit/pixel-button";
import type { GameProps } from "./types";

const PERIOD_MS = 1050;
const MAX_CHOPS = 20;

// Grading bands (distance from center target at 0.5).
//
// PERFECT is a TRUE frame-perfect hit: its window is exactly ONE frame at
// PERFECT_FRAME_FPS of knife travel, so nailing it means landing the chop on the
// exact frame the knife crosses center. The knife covers 1 unit per half-period
// (speed = 2/PERIOD_MS units per ms), so a one-frame window spans
// (2/PERIOD_MS)·(1000/FPS); the one-sided band is half that = 1000/(FPS·PERIOD_MS).
// Higher FPS => tighter window => rarer perfects => a more scattered leaderboard.
// At 30fps this is ~33ms (~0.0317 wide); bump to 45–60 to make perfects rarer.
const PERFECT_FRAME_FPS = 30;
const PERFECT_BAND = 1000 / (PERFECT_FRAME_FPS * PERIOD_MS);
const GOOD_BAND = 0.095;

// The target hops left/right randomly every swing, so you can't memorise "chop
// at the middle" — you must re-spot it and time the knife to it each chop. Kept
// inside [TARGET_MIN, TARGET_MAX] so the bands stay fully on the track and the
// knife travels at a constant speed through it (fair: the PERFECT window is the
// same duration wherever the target lands).
const TARGET_MIN = 0.2;
const TARGET_MAX = 0.8;
const TARGET_MIN_SHIFT = 0.14; // guarantee it visibly moves each time

/** Pick the next target, far enough from `prev` that it clearly relocates. */
function nextTarget(prev: number): number {
  let t = prev;
  for (let i = 0; i < 8 && Math.abs(t - prev) < TARGET_MIN_SHIFT; i++) {
    t = TARGET_MIN + Math.random() * (TARGET_MAX - TARGET_MIN);
  }
  return t;
}

type Phase = "idle" | "playing" | "result";
type Grade = "PERFECT" | "GOOD" | "MISS";

/** Triangle-wave knife position in [0,1] from an absolute timestamp. */
function knifePosAt(now: number, startedAt: number) {
  const phase = ((now - startedAt) % PERIOD_MS) / PERIOD_MS;
  return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
}

function gradeFor(distance: number): { grade: Grade; base: number } {
  if (distance <= PERFECT_BAND) return { grade: "PERFECT", base: 120 };
  if (distance <= GOOD_BAND) return { grade: "GOOD", base: 55 };
  return { grade: "MISS", base: 5 };
}

/** Combo multiplier read AFTER the combo has been incremented. */
function multiplierFor(combo: number) {
  if (combo >= 18) return 5;
  if (combo >= 12) return 4;
  if (combo >= 7) return 3;
  if (combo >= 3) return 2;
  return 1;
}

const GRADE_COLOR: Record<Grade, string> = {
  PERFECT: "var(--neon-primary)",
  GOOD: "var(--neon-yellow)",
  MISS: "var(--neon-red)",
};

export function OnionChop({ onScore, personalBest, disabled }: GameProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [chopsUsed, setChopsUsed] = useState(0);
  const [lastGrade, setLastGrade] = useState<Grade | null>(null);
  const [perfectHits, setPerfectHits] = useState(0);
  const [goodHits, setGoodHits] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);

  // Rendered knife position (0..1), driven by rAF.
  const [knife, setKnife] = useState(0.5);
  // Current target (0..1). Ref is the authority used for synchronous grading;
  // state drives where the bands render.
  const [target, setTarget] = useState(0.5);
  const targetRef = useRef(0.5);

  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const submittedRef = useRef(false);

  // Authoritative run tally kept in refs so a chop computes synchronously from
  // the live values (no stale closures) and all side effects stay OUTSIDE
  // setState updaters — safe under React 19 StrictMode double-invocation.
  const comboRef = useRef(0);
  const scoreRef = useRef(0);
  const chopsRef = useRef(0);
  const perfectRef = useRef(0);
  const goodRef = useRef(0);
  const bestComboRef = useRef(0);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopLoop();
    setPhase("idle");
    setScore(0);
    setCombo(0);
    setChopsUsed(0);
    setLastGrade(null);
    setPerfectHits(0);
    setGoodHits(0);
    setBestCombo(0);
    setIsNewBest(false);
    setKnife(0.5);
    setTarget(0.5);
    targetRef.current = 0.5;
    startRef.current = null;
    submittedRef.current = false;
    comboRef.current = 0;
    scoreRef.current = 0;
    chopsRef.current = 0;
    perfectRef.current = 0;
    goodRef.current = 0;
    bestComboRef.current = 0;
  }, [stopLoop]);

  // Animation loop — only runs while playing.
  useEffect(() => {
    if (phase !== "playing") return;
    const tick = (now: number) => {
      if (startRef.current !== null) {
        setKnife(knifePosAt(now, startRef.current));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => stopLoop();
  }, [phase, stopLoop]);

  const chop = useCallback(() => {
    if (disabled) return;

    // First press starts the run — does not consume a chop or score.
    if (phase === "idle") {
      startRef.current = performance.now();
      submittedRef.current = false;
      const first = nextTarget(0.5);
      targetRef.current = first;
      setTarget(first);
      setPhase("playing");
      return;
    }

    if (phase !== "playing" || startRef.current === null) return;
    if (chopsRef.current >= MAX_CHOPS) return;

    // Sample knife position from the exact event time, not the rendered frame.
    const now = performance.now();
    const pos = knifePosAt(now, startRef.current);
    const distance = Math.abs(pos - targetRef.current);
    const { grade, base } = gradeFor(distance);

    // Compute the whole step synchronously from the live refs. Combo is
    // incremented BEFORE the multiplier is read (so the chop reaching 3 already
    // scores ×2); a miss resets the combo.
    const nextChops = chopsRef.current + 1;
    const nextCombo = grade === "MISS" ? 0 : comboRef.current + 1;
    const gained = base * multiplierFor(nextCombo);
    const nextScore = scoreRef.current + gained;
    const nextBestCombo = Math.max(bestComboRef.current, nextCombo);
    const nextPerfect = perfectRef.current + (grade === "PERFECT" ? 1 : 0);
    const nextGood = goodRef.current + (grade === "GOOD" ? 1 : 0);

    chopsRef.current = nextChops;
    comboRef.current = nextCombo;
    scoreRef.current = nextScore;
    bestComboRef.current = nextBestCombo;
    perfectRef.current = nextPerfect;
    goodRef.current = nextGood;

    setChopsUsed(nextChops);
    setCombo(nextCombo);
    setScore(nextScore);
    setBestCombo(nextBestCombo);
    setPerfectHits(nextPerfect);
    setGoodHits(nextGood);
    setLastGrade(grade);

    // Hop the target left/right for the next swing (skill: re-aim every chop).
    if (nextChops < MAX_CHOPS) {
      const t = nextTarget(targetRef.current);
      targetRef.current = t;
      setTarget(t);
    }

    // Run ends after the 20th chop — submit the final total exactly once.
    if (nextChops >= MAX_CHOPS) {
      stopLoop();
      setKnife(0.5);
      setPhase("result");
      if (!submittedRef.current) {
        submittedRef.current = true;
        setIsNewBest(nextScore > (personalBest ?? -1));
        onScore(nextScore, { chops: MAX_CHOPS });
      }
    }
  }, [disabled, phase, personalBest, onScore, stopLoop]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
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
        chop();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chop]);

  const chopsLeft = MAX_CHOPS - chopsUsed;
  const multiplier = multiplierFor(combo);
  const totalHits = perfectHits + goodHits;
  const accuracy = chopsUsed > 0 ? Math.round((totalHits / chopsUsed) * 100) : 0;
  const lastColor = lastGrade ? GRADE_COLOR[lastGrade] : "var(--text-muted)";

  // Band widths as a % of the track (full band is 2× the one-sided distance).
  const perfectPct = PERFECT_BAND * 2 * 100;
  const goodPct = GOOD_BAND * 2 * 100;

  return (
    <div className="game-container flex h-full w-full select-none flex-col items-center justify-center px-6 py-12 text-center text-[var(--text)]">
      {phase === "idle" && (
        <div className="animate-fade-in flex flex-col items-center gap-6">
          <p className="retro arcade-title text-2xl sm:text-3xl uppercase text-[var(--neon-yellow)] neon-text">
            Onion Chop
          </p>
          <PixelPanel
            tone="text-[var(--neon-yellow)]"
            className="bg-[var(--bg-deep)]"
          >
            <div className="flex max-w-xs flex-col items-center gap-2 p-6">
              <span className="retro text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                Goal
              </span>
              <p className="text-base leading-relaxed text-[var(--text-muted)]">
                Chop when the knife crosses the center. 20 chops — chain combos
                for a bigger multiplier.
              </p>
            </div>
          </PixelPanel>
          <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            Press
            <kbd className="retro rounded-none border-y-[3px] border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-[0.6rem] uppercase text-[var(--text)]">
              SPACE
            </kbd>
            or tap to chop
          </p>
        </div>
      )}

      {phase === "playing" && (
        <div className="animate-fade-in flex w-full max-w-md flex-col items-center gap-6">
          {/* HUD — three pixel readouts framed by a dashed rule */}
          <div className="flex w-full items-stretch justify-between gap-2 border-b-[3px] border-dashed border-[var(--border-strong)] pb-3">
            <div className="flex flex-1 flex-col items-start gap-1">
              <span className="retro text-[0.5rem] uppercase tracking-wider text-[var(--text-muted)]">
                Score
              </span>
              <span className="retro text-base text-[var(--text)]">{score}</span>
            </div>
            <div className="flex flex-1 flex-col items-center gap-1 border-x-[3px] border-dashed border-[var(--border-strong)]">
              <span className="retro text-[0.5rem] uppercase tracking-wider text-[var(--text-muted)]">
                Combo
              </span>
              <span className="retro text-base text-[var(--neon-yellow)] neon-text-subtle">
                {combo}{" "}
                <span className="text-[0.7rem] text-[var(--neon-yellow)]">
                  x{multiplier}
                </span>
              </span>
            </div>
            <div className="flex flex-1 flex-col items-end gap-1">
              <span className="retro text-[0.5rem] uppercase tracking-wider text-[var(--text-muted)]">
                Chops Left
              </span>
              <span className="retro text-base text-[var(--text)]">
                {chopsLeft}
              </span>
            </div>
          </div>

          {/* Last result flash — pixel grade tag that pops on the current hue */}
          <p
            className="retro h-4 text-[0.7rem] uppercase tracking-[0.3em] neon-text-subtle"
            style={{ color: lastColor }}
          >
            {lastGrade ?? ""}
          </p>

          {/* Track — pixel cabinet slot: scanlines, sharp thick frame */}
          <div
            className="scanlines relative h-16 w-full overflow-hidden rounded-none border-y-[6px] border-[var(--border-strong)] bg-[var(--bg-deep)] shadow-[inset_0_0_0_3px_var(--bg-deep)]"
            style={{ imageRendering: "pixelated" }}
          >
            {/* GOOD band (wider, yellow tint) — follows the moving target.
                Crisp blocky fill with bright pixel edges, no soft blur. */}
            <div
              className="absolute top-0 bottom-0 border-x-[3px] border-[var(--neon-yellow)]"
              style={{
                left: `${target * 100 - goodPct / 2}%`,
                width: `${goodPct}%`,
                background: "var(--neon-yellow)",
                opacity: 0.16,
                imageRendering: "pixelated",
              }}
              aria-hidden="true"
            />
            {/* PERFECT band (narrow, green tint) — follows the moving target */}
            <div
              className="absolute top-0 bottom-0 border-x-[3px] border-[var(--neon-primary)]"
              style={{
                left: `${target * 100 - perfectPct / 2}%`,
                width: `${perfectPct}%`,
                background: "var(--neon-primary)",
                opacity: 0.4,
                imageRendering: "pixelated",
              }}
              aria-hidden="true"
            />
            {/* Target line — where you must chop this swing. Sharp green core
                with notch caps top & bottom for a pixel-crisp read. */}
            <div
              className="absolute top-0 bottom-0 w-[3px] -translate-x-1/2 bg-[var(--neon-primary)]"
              style={{
                left: `${target * 100}%`,
                boxShadow: "0 0 6px var(--neon-primary)",
                imageRendering: "pixelated",
              }}
              aria-hidden="true"
            >
              <span className="absolute -top-px left-1/2 h-[5px] w-[7px] -translate-x-1/2 bg-[var(--neon-primary)]" />
              <span className="absolute -bottom-px left-1/2 h-[5px] w-[7px] -translate-x-1/2 bg-[var(--neon-primary)]" />
            </div>
            {/* Knife marker — bright WHITE bar, easy to track against the
                yellow GOOD / green PERFECT bands; thin crisp core so you can
                read the exact frame it crosses center. */}
            <div
              className="absolute top-0 bottom-0 w-[5px]"
              style={{
                left: `${knife * 100}%`,
                transform: "translateX(-50%)",
                background: "#ffffff",
                boxShadow:
                  "0 0 8px #ffffff, 0 0 18px rgba(255,255,255,0.75), 0 0 2px #ffffff",
              }}
              aria-hidden="true"
            />
          </div>

          <PixelButton
            type="button"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              chop();
            }}
            disabled={disabled}
            style={{ ["--pixel-edge"]: "var(--neon-yellow)" } as React.CSSProperties}
            className="text-[var(--neon-yellow)]"
          >
            Chop 🔪
          </PixelButton>
        </div>
      )}

      {phase === "result" && (
        <div className="animate-rise-in flex flex-col items-center gap-6">
          <p className="retro arcade-title text-base sm:text-lg uppercase tracking-[0.12em] text-[var(--neon-yellow)] neon-text-subtle">
            Service Done
          </p>

          <PixelPanel
            tone="text-[var(--neon-yellow)]"
            className="bg-[var(--bg-deep)]"
          >
            <div className="flex flex-col items-center gap-3 px-8 py-6">
              <span className="retro text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                Final Score
              </span>
              <span className="retro text-3xl sm:text-4xl leading-none text-[var(--text)] neon-text-subtle">
                {score}
              </span>
              <div className="pixel-divider w-full" aria-hidden="true" />
              {/* PERFECT / GOOD tally — pixel pills echoing the track bands */}
              <div className="flex items-center gap-2">
                <span className="pixel-badge retro text-[0.5rem] text-[var(--neon-primary)]">
                  {perfectHits} Perfect
                </span>
                <span className="pixel-badge retro text-[0.5rem] text-[var(--neon-yellow)]">
                  {goodHits} Good
                </span>
              </div>
              <span className="retro text-[0.5rem] uppercase tracking-wider text-[var(--text-muted)]">
                Best combo {bestCombo} · {accuracy}% on target
              </span>
            </div>
          </PixelPanel>

          {isNewBest && (
            <span className="pixel-badge retro text-[0.5rem] text-[var(--neon-yellow)] neon-text-xs">
              New personal best
            </span>
          )}

          <PixelButton
            variant="outline"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              reset();
            }}
            style={{ ["--pixel-edge"]: "var(--neon-yellow)" } as React.CSSProperties}
            className="text-[var(--neon-yellow)]"
          >
            Play again
          </PixelButton>
        </div>
      )}
    </div>
  );
}
