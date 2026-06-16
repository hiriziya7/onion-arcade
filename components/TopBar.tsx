"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/components/PlayerProvider";

export function TopBar() {
  const { balance, loading } = usePlayer();

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-deep)]/80 px-4 backdrop-blur-md md:px-6">
      <Link
        href="/"
        className="arcade-title text-lg font-semibold text-[var(--text-muted)] transition-[color] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[var(--text)]"
      >
        OnionDAO
      </Link>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-sm border-[0.5px] border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1 text-xs">
          <span aria-hidden>🧅</span>
          <span className="font-mono font-medium text-[var(--onion)] neon-text-subtle">
            {loading ? "—" : balance}
          </span>
        </div>

        <Button variant="ghost" size="sm" disabled>
          Connect Wallet — soon
        </Button>
      </div>
    </header>
  );
}
