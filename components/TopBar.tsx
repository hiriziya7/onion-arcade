"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/components/PlayerProvider";
import { TopUpDialog } from "@/components/TopUpDialog";
import { CashOutDialog } from "@/components/CashOutDialog";

export function TopBar() {
  const { balance, handle, loading } = usePlayer();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [cashOutOpen, setCashOutOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [prizePool, setPrizePool] = useState<number>(0);

  // Discover connected-vs-local mode and the live prize pool. Re-checked when
  // the player's balance changes (a play grows the pool; a top-up/cash-out
  // changes things) so the figures stay roughly live without a constant poll.
  useEffect(() => {
    let active = true;
    fetch("/api/onions/status")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setConfigured(!!d?.configured);
        if (typeof d?.prizePool === "number") setPrizePool(d.prizePool);
      })
      .catch(() => active && setConfigured(false));
    return () => {
      active = false;
    };
  }, [balance]);

  return (
    <header className="sticky top-0 z-40 grid h-14 shrink-0 grid-cols-3 items-center border-b border-[var(--border-subtle)] bg-[var(--bg-deep)]/80 px-4 backdrop-blur-md md:px-6">
      {/* Left: brand + mode */}
      <div className="flex items-center gap-2.5 justify-self-start">
        <Link
          href="/"
          className="arcade-title text-lg font-semibold text-[var(--text-muted)] transition-[color] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[var(--text)]"
        >
          OnionDAO
        </Link>
        {configured !== null && (
          <span
            className="pixel-badge retro hidden text-[8px] uppercase sm:inline-block"
            style={{
              color: configured ? "var(--neon-primary)" : "var(--text-faint)",
              borderColor: configured
                ? "var(--neon-primary)"
                : "var(--border-subtle)",
            }}
            title={
              configured
                ? "Connected to OnionDAO — real onions"
                : "Local play — onions are local to this arcade"
            }
          >
            {configured ? "Connected" : "Local play"}
          </span>
        )}
      </div>

      {/* Center: the wallet — balance + buy-in / cash-out, the focal action. */}
      <div className="flex items-center gap-2 justify-self-center rounded-sm border-[0.5px] border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1">
        {!loading && handle && (
          <span className="hidden font-mono text-xs font-medium text-[var(--text)] sm:inline">
            {handle}
          </span>
        )}
        <span className="flex items-center gap-1 text-xs">
          <span aria-hidden>🧅</span>
          <span className="font-mono font-medium text-[var(--onion)] neon-text-subtle">
            {loading ? "—" : balance}
          </span>
        </span>
        <Button variant="outline" size="sm" onClick={() => setTopUpOpen(true)}>
          Add onions
        </Button>
        {configured && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCashOutOpen(true)}
            disabled={loading || balance <= 0}
            title={
              balance <= 0
                ? "No onions to cash out"
                : "Send your unused onions back to your OnionDAO wallet"
            }
          >
            Cash out
          </Button>
        )}
      </div>

      {/* Right: prize pool */}
      <div className="flex items-center gap-3 justify-self-end">
        {configured && prizePool > 0 && (
          <span
            className="hidden items-center gap-1.5 rounded-sm border-[0.5px] border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1 text-xs sm:flex"
            title="Current tournament prize pool"
          >
            <span aria-hidden>🏆</span>
            <span className="font-mono font-medium text-[var(--neon-yellow)]">
              {prizePool} 🧅
            </span>
          </span>
        )}
      </div>

      <TopUpDialog open={topUpOpen} onClose={() => setTopUpOpen(false)} />
      <CashOutDialog open={cashOutOpen} onClose={() => setCashOutOpen(false)} />
    </header>
  );
}
