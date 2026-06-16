"use client";

import Link from "next/link";
import { PixelButton } from "@/components/ui/8bit/pixel-button";
import { usePlayer } from "@/components/PlayerProvider";

export function TopBar() {
  const { balance, loading } = usePlayer();

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b-[3px] border-dashed border-[var(--border-strong)] bg-[var(--bg-deep)] px-4 md:px-6">
      <Link
        href="/"
        className="retro text-sm uppercase text-[var(--neon-primary)] neon-text-subtle transition-[opacity] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-80"
      >
        [ ONIONDAO ]
      </Link>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 border-[3px] border-[var(--onion)] bg-[var(--surface)] px-2.5 py-1">
          <span aria-hidden>🧅</span>
          <span className="retro text-[0.6rem] text-[var(--onion)] neon-text-subtle">
            {loading ? "—" : balance}
          </span>
        </div>

        <PixelButton variant="ghost" disabled>
          Connect Wallet — soon
        </PixelButton>
      </div>
    </header>
  );
}
