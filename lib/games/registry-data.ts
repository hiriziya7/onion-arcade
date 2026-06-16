import type { GameMeta } from "./types";

export const gameMeta: GameMeta[] = [
  {
    id: "seven",
    name: "Seven",
    scoreLabel: "ms off",
    lowerIsBetter: true,
    tagline: "Stop the clock at exactly 7.000s",
    objective: "Trust your internal clock — no timer, no mercy.",
    glow: "green",
  },
  {
    id: "lights-out",
    name: "Lights Out",
    scoreLabel: "ms",
    lowerIsBetter: true,
    tagline: "React the instant the lights die",
    objective: "Five red lights, then darkness. Don't jump the start.",
    glow: "red",
  },
  {
    id: "onion-chop",
    name: "Onion Chop",
    scoreLabel: "pts",
    lowerIsBetter: false,
    tagline: "Chop dead-center, stack the combo",
    objective: "A blade sweeps the board. Chop at the center — 20 swings, ride the combo for the high score.",
    glow: "orange",
  },
];

export function getGameMeta(gameId: string) {
  return gameMeta.find((g) => g.id === gameId);
}
