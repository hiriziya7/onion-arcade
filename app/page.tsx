import { GameGrid } from "@/components/GameGrid";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-16 md:px-8 md:py-24">
      {/* Hero */}
      <section className="animate-rise-in mb-10">
        <h1 className="retro neon-text-subtle text-2xl uppercase text-balance text-[var(--neon-primary)] md:text-3xl">
          Arcade
        </h1>
        <p className="mt-5 max-w-sm text-base leading-relaxed text-[var(--text-muted)]">
          Two games. One leaderboard. Pure reflex.
        </p>
      </section>

      {/* Section heading — arcade prompt + blinking cursor */}
      <div className="animate-fade-in mb-5 flex items-center gap-1">
        <span aria-hidden="true" className="retro text-[0.6rem] uppercase text-[var(--neon-primary)]">
          &gt;
        </span>
        <h2 className="retro text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
          Select a cabinet
        </h2>
        <span
          aria-hidden="true"
          className="cursor-blink retro text-[0.6rem] text-[var(--neon-primary)]"
        >
          _
        </span>
      </div>
      <div className="pixel-divider mb-6" />

      {/* Cabinets */}
      <GameGrid />
    </main>
  );
}
