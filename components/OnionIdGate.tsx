"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/components/PlayerProvider";
import { PixelPanel } from "@/components/ui/8bit/pixel-panel";
import { PixelButton } from "@/components/ui/8bit/pixel-button";
import { Input } from "@/components/ui/input";
import { normalizeOnionId, ONION_ID_RULE } from "@/lib/player/onionId";

/**
 * Start-of-site identity gate. Until a player claims an identity the whole
 * arcade is covered by this overlay — that identity is how they appear on every
 * leaderboard. Renders nothing once an identity exists (or while we're still
 * loading it), so returning visitors never see it.
 *
 * Two modes, decided by GET /api/onions/status on mount:
 *  - OnionDAO configured  → claim a real OnionDAO USERNAME via /api/onions/claim.
 *  - not configured       → the existing local "@id" flow (PATCH /api/player).
 */
export function OnionIdGate() {
  const { loading, hasIdentity, playerId, setHandle, refresh } = usePlayer();
  // null = still discovering which mode we're in.
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [value, setValue] = useState("@");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Discover whether OnionDAO is wired up. Failures fall back to local mode so
  // the arcade keeps working with no OnionDAO env set.
  useEffect(() => {
    let active = true;
    fetch("/api/onions/status")
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const isConfigured = !!data?.configured;
        setConfigured(isConfigured);
        // Username mode has no leading "@"; only the local @id flow prefills it.
        if (isConfigured) setValue("");
      })
      .catch(() => {
        if (active) setConfigured(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading || hasIdentity || configured === null) return null;

  // When switching into username mode, drop the local "@" prefill once.
  const placeholder = configured ? "spicychef" : "@spicychef";
  const rule = configured
    ? "Enter your OnionDAO username to play under."
    : ONION_ID_RULE;

  const submitLocal = async () => {
    const normalized = normalizeOnionId(value);
    if (!normalized) {
      setError(ONION_ID_RULE);
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await setHandle(normalized);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      setSubmitting(false);
    }
    // On success the provider's handle flips truthy → this gate unmounts itself.
  };

  const submitOnion = async () => {
    const username = value.trim().replace(/^@/, "");
    if (!username) {
      setError("Enter your OnionDAO username.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onions/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, username }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        // Pull the new handle into the provider → gate unmounts itself.
        await refresh();
        return;
      }
      if (data?.error === "not_found") {
        setError(`No OnionDAO user "${username}".`);
      } else if (data?.error === "taken") {
        setError("That username is already claimed here.");
      } else if (res.status === 502 || data?.error === "upstream_unavailable") {
        setError("Couldn't reach OnionDAO. Try again in a moment.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } catch {
      setError("Couldn't reach OnionDAO. Try again.");
    }
    setSubmitting(false);
  };

  const submit = configured ? submitOnion : submitLocal;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)]/95 px-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onion-gate-title"
    >
      <PixelPanel
        tone="text-[var(--neon-primary)]"
        className="w-full max-w-sm bg-[var(--bg-deep)]"
      >
        <div className="flex flex-col gap-5 p-7">
          <div className="flex flex-col gap-2 text-center">
            <span aria-hidden className="text-3xl">
              🧅
            </span>
            <h2
              id="onion-gate-title"
              className="arcade-title text-xl font-semibold uppercase text-[var(--neon-primary)] neon-text-subtle"
            >
              {configured ? "Sign in with OnionDAO" : "Claim your onion id"}
            </h2>
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">
              {configured ? (
                <>
                  Enter your{" "}
                  <span className="text-[var(--text)]">OnionDAO username</span>.
                  It&apos;s how you show up on every leaderboard, and your onions
                  travel with you.
                </>
              ) : (
                <>
                  Pick the <span className="text-[var(--text)]">@id</span>{" "}
                  you&apos;ll play under. It&apos;s how you show up on every
                  leaderboard, and it stays yours.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Input
              value={value}
              autoFocus
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              maxLength={configured ? 40 : 19}
              placeholder={placeholder}
              aria-invalid={!!error}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              className="border-[var(--border-strong)] bg-[var(--bg)] text-center font-mono text-[var(--text)]"
            />
            <p
              className="min-h-4 text-center text-xs"
              style={{
                color: error ? "var(--neon-red)" : "var(--text-faint)",
              }}
            >
              {error ?? rule}
            </p>
          </div>

          <PixelButton
            type="button"
            variant="solid"
            onClick={submit}
            disabled={submitting}
            style={
              { ["--pixel-edge"]: "var(--neon-primary)" } as React.CSSProperties
            }
          >
            {submitting
              ? configured
                ? "Signing in…"
                : "Claiming…"
              : "Enter the arcade"}
          </PixelButton>
        </div>
      </PixelPanel>
    </div>
  );
}
