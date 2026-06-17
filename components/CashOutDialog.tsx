"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "@/components/PlayerProvider";
import { PixelPanel } from "@/components/ui/8bit/pixel-panel";
import { PixelButton } from "@/components/ui/8bit/pixel-button";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 180000;

type Phase =
  | { kind: "confirm" }
  | { kind: "sending" }
  | { kind: "pending"; withdrawalId: string }
  | { kind: "done"; amount: number }
  | { kind: "error"; message: string };

export function CashOutDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return <CashOutBody onClose={onClose} />;
}

function CashOutBody({ onClose }: { onClose: () => void }) {
  const { playerId, balance, refresh } = usePlayer();
  const [phase, setPhase] = useState<Phase>({ kind: "confirm" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);
  useEffect(() => clearPoll, [clearPoll]);

  const busy = phase.kind === "sending" || phase.kind === "pending";
  const close = useCallback(() => {
    if (busy) return;
    clearPoll();
    onClose();
  }, [busy, clearPoll, onClose]);

  const poll = useCallback(
    (withdrawalId: string) => {
      clearPoll();
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      const tick = async () => {
        if (Date.now() > deadline) {
          clearPoll();
          setPhase({
            kind: "error",
            message:
              "Still confirming with OnionDAO. Your onions are on the way — check your wallet shortly.",
          });
          return;
        }
        try {
          const res = await fetch(
            `/api/onions/cashout?withdrawalId=${encodeURIComponent(withdrawalId)}`
          );
          const data = await res.json().catch(() => null);
          if (!res.ok || !data) return;
          if (data.status === "completed") {
            clearPoll();
            await refresh();
            setPhase({ kind: "done", amount: data.amount });
          } else if (data.status === "failed") {
            clearPoll();
            await refresh();
            setPhase({
              kind: "error",
              message: "Cash-out was declined — your onions were returned to your balance.",
            });
          }
        } catch {
          // keep polling
        }
      };
      pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
      void tick();
    },
    [clearPoll, refresh]
  );

  const confirm = useCallback(async () => {
    setPhase({ kind: "sending" });
    try {
      const res = await fetch("/api/onions/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setPhase({
          kind: "error",
          message:
            data?.error === "nothing_to_cash_out"
              ? "You have no onions to cash out."
              : data?.error === "no_identity"
                ? "Claim your OnionDAO username first."
                : "Couldn't start the cash-out. Try again.",
        });
        return;
      }
      if (data.status === "completed") {
        await refresh();
        setPhase({ kind: "done", amount: data.amount });
      } else if (data.status === "failed") {
        await refresh();
        setPhase({
          kind: "error",
          message: "Cash-out was declined — your onions are still in your balance.",
        });
      } else {
        // pending — settles asynchronously (e.g. badge/token wallet)
        await refresh();
        setPhase({ kind: "pending", withdrawalId: data.withdrawalId });
        poll(data.withdrawalId);
      }
    } catch {
      setPhase({ kind: "error", message: "Network error. Try again." });
    }
  }, [playerId, refresh, poll]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)]/95 px-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cashout-title"
      onClick={close}
    >
      <PixelPanel
        tone="text-[var(--neon-cyan)]"
        className="w-full max-w-sm bg-[var(--bg-deep)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-5 p-7 text-center">
          <span aria-hidden className="text-3xl">
            🧅↩
          </span>
          <h2
            id="cashout-title"
            className="arcade-title text-xl font-semibold uppercase text-[var(--neon-cyan)] neon-text-subtle"
          >
            Cash out
          </h2>

          {phase.kind === "confirm" && (
            <>
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                Send your{" "}
                <span className="font-mono text-[var(--text)]">{balance} 🧅</span>{" "}
                unused onions back to your OnionDAO wallet. Spent onions stay in
                the arcade.
              </p>
              <PixelButton
                type="button"
                variant="solid"
                onClick={confirm}
                disabled={balance <= 0}
                style={{ ["--pixel-edge"]: "var(--neon-cyan)" } as React.CSSProperties}
              >
                {balance > 0 ? `Cash out ${balance} 🧅` : "Nothing to cash out"}
              </PixelButton>
              <PixelButton type="button" variant="ghost" onClick={close}>
                Cancel
              </PixelButton>
            </>
          )}

          {busy && (
            <div className="flex flex-col items-center gap-3 py-2">
              <span
                aria-hidden
                className="inline-block size-5 animate-spin rounded-full border-2 border-[var(--neon-cyan)] border-t-transparent"
              />
              <p className="text-sm text-[var(--text)]" role="status" aria-live="polite">
                {phase.kind === "sending"
                  ? "Sending your onions…"
                  : "Sent — confirming with OnionDAO…"}
              </p>
            </div>
          )}

          {phase.kind === "done" && (
            <>
              <p className="text-sm leading-relaxed text-[var(--text)]">
                <span className="font-mono">{phase.amount} 🧅</span> sent to your
                OnionDAO wallet. 🎉
              </p>
              <PixelButton
                type="button"
                variant="solid"
                onClick={close}
                style={{ ["--pixel-edge"]: "var(--neon-cyan)" } as React.CSSProperties}
              >
                Done
              </PixelButton>
            </>
          )}

          {phase.kind === "error" && (
            <>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--neon-red)" }}
              >
                {phase.message}
              </p>
              <PixelButton type="button" variant="ghost" onClick={close}>
                Close
              </PixelButton>
            </>
          )}
        </div>
      </PixelPanel>
    </div>,
    document.body
  );
}
