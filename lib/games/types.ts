export type GlowColor = "blue" | "purple" | "green" | "red" | "orange";

export interface GameProps {
  onScore: (value: number, meta?: Record<string, unknown>) => void;
  personalBest: number | null;
  disabled?: boolean;
}

/**
 * Server-safe descriptive metadata for a game. No React parts, so this can be
 * imported from API routes and server components.
 */
export interface GameMeta {
  id: string;
  name: string;
  /** Short label for the score unit, e.g. "ms off". */
  scoreLabel: string;
  lowerIsBetter: boolean;
  /** Punchy one-liner shown under the title on the cabinet card. */
  tagline: string;
  /** What the game actually asks you to do. */
  objective: string;
  /** Neon hue used for the glow card + accents. */
  glow: GlowColor;
}

/** A fully wired game: descriptive meta + its React components. */
export interface ArcadeGame extends GameMeta {
  Component: React.FC<GameProps>;
  /** Tiny animated teaser rendered inside the dashboard card. */
  Preview: React.FC;
}
