"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PixelButton } from "@/components/ui/8bit/pixel-button";
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
    <header className="sticky top-0 z-40 grid h-14 shrink-0 grid-cols-3 items-center border-b-[3px] border-dashed border-[var(--border-strong)] bg-[var(--bg-deep)] px-4 md:px-6">
      {/* Left: brand + mode */}
      <div className="flex items-center gap-2.5 justify-self-start">
        <Link
          href="/"
          className="retro text-sm uppercase text-[var(--neon-primary)] neon-text-subtle transition-[opacity] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-80"
        >
          [ ONIONDAO ]
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
      <div className="flex items-center gap-3 justify-self-center">
        {!loading && handle && (
          <span className="hidden retro text-[0.55rem] uppercase text-[var(--text)] sm:inline">
            {handle}
          </span>
        )}
        <div className="flex items-center gap-2 border-[3px] border-[var(--onion)] bg-[var(--surface)] px-2.5 py-1">
          <span aria-hidden>🧅</span>
          <span className="retro text-[0.6rem] text-[var(--onion)] neon-text-subtle">
            {loading ? "—" : balance}
          </span>
        </div>
        <PixelButton
          variant="outline"
          onClick={() => setTopUpOpen(true)}
          style={{ ["--pixel-edge" as string]: "var(--neon-primary)" }}
        >
          Add onions
        </PixelButton>
        {configured && (
          <PixelButton
            variant="ghost"
            onClick={() => setCashOutOpen(true)}
            disabled={loading || balance <= 0}
            title={
              balance <= 0
                ? "No onions to cash out"
                : "Send your unused onions back to your OnionDAO wallet"
            }
          >
            Cash out
          </PixelButton>
        )}
      </div>

      {/* Right: prize pool */}
      <div className="flex items-center gap-3 justify-self-end">
        {configured && prizePool > 0 && (
          <span
            className="hidden items-center gap-2 border-[3px] border-[var(--neon-yellow)] bg-[var(--surface)] px-2.5 py-1 sm:flex"
            title="Current tournament prize pool"
          >
            <span aria-hidden>🏆</span>
            <span className="retro text-[0.6rem] text-[var(--neon-yellow)] neon-text-subtle">
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
