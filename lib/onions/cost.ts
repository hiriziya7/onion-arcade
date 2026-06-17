// CLIENT-SAFE. No env access, no secrets. Safe to import from anywhere
// (client components, UI). Used for display and as the default cost.
// The server enforces the authoritative cost via config GAME_COST.

export const GAME_COST = 5;

/** Devs' rake on spent onions, as a percentage. Prize pool shows the rest. */
export const DEV_RAKE_PERCENT = 10;

/**
 * Split a quantity of *spent* onions into the prize-pool share and the dev cut,
 * using integer math so the two parts ALWAYS re-sum to `spent` exactly — no
 * fractional onion can be minted or dropped by rounding. Pool rounds down; the
 * remainder is the dev cut.
 */
export function splitSpend(spent: number): { pool: number; dev: number } {
  const pool = Math.floor((spent * (100 - DEV_RAKE_PERCENT)) / 100);
  return { pool, dev: spent - pool };
}
