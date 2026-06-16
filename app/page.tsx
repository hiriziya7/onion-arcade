import { GameGrid } from "@/components/GameGrid";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-16 md:px-8 md:py-24">
      {/* Hero */}
      <section className="animate-rise-in mb-10">
        <h1 className="arcade-title text-4xl font-semibold uppercase text-balance text-[var(--text)] md:text-5xl">
          Arcade
        </h1>
        <p className="mt-4 max-w-sm text-base text-[var(--text-muted)]">
          Two games. One leaderboard. Pure reflex.
        </p>
      </section>

      {/* Cabinets */}
      <GameGrid />
    </main>
  );
}
