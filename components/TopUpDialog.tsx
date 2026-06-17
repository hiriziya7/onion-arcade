"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "@/components/PlayerProvider";
import { PixelPanel } from "@/components/ui/8bit/pixel-panel";
import { PixelButton } from "@/components/ui/8bit/pixel-button";
import { Input } from "@/components/ui/input";

const PRESETS = [25, 50, 100] as const;
const MAX_AMOUNT = 100000;
const POLL_INTERVAL_MS = 2000;
// Stop polling after this long so a never-approved deposit can't trap the
// dialog open (the Close button is disabled while a poll is in flight).
const POLL_TIMEOUT_MS = 180000;

/** Statuses the deposit poll can report. "completed" credits; the others are terminal failures. */
const DENIED = new Set(["denied", "failed", "cancelled", "canceled", "expired"]);

/** Human copy for each in-flight deposit status. */
function statusLabel(status: string | null): string {
  switch (status) {
    case "awaiting_badge_signature":
      return "Approve in your OnionDAO portal…";
    case "pending":
      return "Waiting for OnionDAO to confirm…";
    case "processing":
      return "Processing your deposit…";
    default:
      return "Approve in your OnionDAO portal…";
  }
}

type Phase =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "polling"; status: string | null }
  | { kind: "error"; message: string }
  | { kind: "not_configured" };

/**
 * Mount wrapper: only render the dialog body while open. Mounting fresh each
 * time gives us clean state (selected pack / phase) without resetting inside an
 * effect, and unmounting tears down any live poll via the body's cleanup.
 */
export function TopUpDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return <TopUpDialogBody onClose={onClose} />;
}

function TopUpDialogBody({ onClose }: { onClose: () => void }) {
  const { playerId, refresh } = usePlayer();
  const [amount, setAmount] = useState<number>(PRESETS[0]);
  const [custom, setCustom] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Tear down any live poll on unmount (dialog closed).
  useEffect(() => clearPoll, [clearPoll]);

  const busy = phase.kind === "creating" || phase.kind === "polling";

  const close = useCallback(() => {
    if (busy) return; // don't abandon an in-flight deposit by accident
    clearPoll();
    onClose();
  }, [busy, clearPoll, onClose]);

  const pollDeposit = useCallback(
    (depositId: string) => {
      clearPoll();
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      const tick = async () => {
        if (Date.now() > deadline) {
          clearPoll();
          setPhase({
            kind: "error",
            message:
              "Still waiting on OnionDAO. Approve it in your portal, then reopen to check your balance.",
          });
          return;
        }
        try {
          const res = await fetch(
            `/api/onions/deposit?depositId=${encodeURIComponent(depositId)}`
          );
          const data = await res.json().catch(() => null);
          if (!res.ok || !data) return; // transient; keep polling
          const status: string | null = data.status ?? null;
          if (status === "completed") {
            clearPoll();
            await refresh();
            onClose();
            return;
          }
          if (status && DENIED.has(status)) {
            clearPoll();
            setPhase({
              kind: "error",
              message: "Deposit was declined. No onions were charged.",
            });
            return;
          }
          setPhase({ kind: "polling", status });
        } catch {
          // network blip — keep polling
        }
      };
      pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
      void tick();
    },
    [clearPoll, refresh, onClose]
  );

  const confirm = useCallback(async () => {
    const value = Math.trunc(amount);
    if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) {
      setPhase({
        kind: "error",
        message: `Enter an amount between 1 and ${MAX_AMOUNT}.`,
      });
      return;
    }
    setPhase({ kind: "creating" });
    try {
      const res = await fetch("/api/onions/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, amount: value }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 400 && data?.error === "not_configured") {
        setPhase({ kind: "not_configured" });
        return;
      }
      if (!res.ok || !data?.depositId) {
        setPhase({
          kind: "error",
          message:
            data?.error === "no_identity"
              ? "Claim an onion id before adding onions."
              : "Couldn't start the deposit. Try again.",
        });
        return;
      }
      setPhase({ kind: "polling", status: null });
      pollDeposit(data.depositId);
    } catch {
      setPhase({ kind: "error", message: "Network error. Try again." });
    }
  }, [amount, playerId, pollDeposit]);

  const notConfigured = phase.kind === "not_configured";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)]/95 px-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="topup-title"
      onClick={close}
    >
      <PixelPanel
        tone="text-[var(--neon-primary)]"
        className="w-full max-w-sm bg-[var(--bg-deep)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-5 p-7">
          <div className="flex flex-col gap-2 text-center">
            <span aria-hidden className="text-3xl">
              🧅
            </span>
            <h2
              id="topup-title"
              className="arcade-title text-xl font-semibold uppercase text-[var(--neon-primary)] neon-text-subtle"
            >
              Add onions
            </h2>
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">
              {notConfigured
                ? "OnionDAO not connected yet."
                : "Top up your balance to keep playing. Deposits clear through your OnionDAO portal."}
            </p>
          </div>

          {!busy && !notConfigured && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((preset) => {
                  const selected = !custom && amount === preset;
                  return (
                    <PixelButton
                      key={preset}
                      type="button"
                      variant={selected ? "solid" : "outline"}
                      onClick={() => {
                        setCustom("");
                        setAmount(preset);
                        if (phase.kind === "error") setPhase({ kind: "idle" });
                      }}
                      style={
                        {
                          ["--pixel-edge"]: "var(--neon-primary)",
                        } as React.CSSProperties
                      }
                    >
                      {preset}
                    </PixelButton>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <Input
                  inputMode="numeric"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="Custom amount"
                  value={custom}
                  aria-label="Custom onion amount"
                  aria-invalid={phase.kind === "error"}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, "");
                    setCustom(digits);
                    setAmount(digits ? Number(digits) : 0);
                    if (phase.kind === "error") setPhase({ kind: "idle" });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirm();
                  }}
                  className="border-[var(--border-strong)] bg-[var(--bg)] text-center font-mono text-[var(--text)]"
                />
                <p
                  className="min-h-4 text-center text-xs"
                  style={{
                    color:
                      phase.kind === "error"
                        ? "var(--neon-red)"
                        : "var(--text-faint)",
                  }}
                >
                  {phase.kind === "error"
                    ? phase.message
                    : `1–${MAX_AMOUNT} onions`}
                </p>
              </div>

              <PixelButton
                type="button"
                variant="solid"
                onClick={confirm}
                disabled={amount <= 0}
                style={
                  {
                    ["--pixel-edge"]: "var(--neon-primary)",
                  } as React.CSSProperties
                }
              >
                Add {amount > 0 ? amount : ""} onions
              </PixelButton>
            </>
          )}

          {busy && (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span
                aria-hidden
                className="inline-block size-5 animate-spin rounded-full border-2 border-[var(--neon-primary)] border-t-transparent"
              />
              <p
                className="text-sm text-[var(--text)]"
                role="status"
                aria-live="polite"
              >
                {phase.kind === "creating"
                  ? "Starting deposit…"
                  : statusLabel(phase.status)}
              </p>
              <p className="text-xs text-[var(--text-faint)]">
                Keep this open until it clears.
              </p>
            </div>
          )}

          {(notConfigured || phase.kind === "error" || !busy) && (
            <PixelButton
              type="button"
              variant="ghost"
              onClick={close}
              disabled={busy}
            >
              {phase.kind === "error" ? "Back" : "Close"}
            </PixelButton>
          )}
        </div>
      </PixelPanel>
    </div>,
    document.body
  );
}
