// SERVER-ONLY. The Onion Arcade admin-dashboard economy.
//
// Onions are integers. The pool/dev balances are DERIVED by folding the
// append-only event log (admin adds + payouts from arcade_events) together with
// the onion-chop play rows (from the ledger) in timestamp order — never from a
// mutable stored counter, so they can't drift.
//
// The spec's aggregate formula (overflow = max(0, pool_raw - CAP) with
// onions_paid_out subtracted inside pool_raw) is BROKEN: a payout shrinks
// pool_raw and retroactively erases dev overflow already earned. This module
// uses the monotonic event-fold instead — dev_earned only ever grows; payouts
// touch only the pool. Verified by scripts/verify-money-model.mjs (53 checks).

import { getRepos } from "@/lib/data/sqlite";
import { gameMeta } from "@/lib/games/registry-data";

export const GAME_COST = 5;
export const RAKE = 0.12;
export const POOL_CAP = 500;
export const PAYOUT_CURVE = [0.5, 0.3, 0.2] as const;

/** The games that have their own prize pool, in display order. */
export const GAMES = gameMeta.map((g) => ({
  id: g.id,
  name: g.name,
  lowerIsBetter: g.lowerIsBetter,
}));
export const GAME_IDS = GAMES.map((g) => g.id);

export function isGameId(id: unknown): id is string {
  return typeof id === "string" && GAME_IDS.includes(id);
}

export function lowerIsBetter(gameId: string): boolean {
  return GAMES.find((g) => g.id === gameId)?.lowerIsBetter ?? false;
}

/** One game's pool view (dev earned per game; dev BALANCE is aggregate-only). */
export interface ArcadeView {
  gameId: string;
  name: string;
  totalSpent: number;
  pool: number;
  poolCap: number;
  capRemaining: number;
  /** pool as a 0..100 percentage of the cap (display only). */
  fillPct: number;
  /** true once the pool is at the cap — overflow now all flows to dev. */
  poolFull: boolean;
  /** this game's contribution to the dev pot (rake + over-cap overflow). */
  devEarned: number;
  rakeEarned: number;
  overflowEarned: number;
  onionsAdded: number;
  onionsPaidOut: number;
}

/** The single aggregate dev pot + the conservation terms. */
export interface DevTotals {
  perGame: ArcadeView[];
  devEarned: number;
  rakeEarned: number;
  overflowEarned: number;
  devWithdrawn: number;
  devBalance: number;
  creditsOwed: number;
  poolsTotal: number;
}

/**
 * Apply a run of `rounds` plays to the running (pool, devEarned, spent). Within
 * a run the pool only grows, so the cap is a single min — equivalent to folding
 * the rounds one at a time. Returns the new {pool, devEarned, spent}.
 */
function applyRounds(
  rounds: number,
  pool: number,
  devEarned: number,
  spent: number
): { pool: number; devEarned: number; spent: number } {
  if (rounds <= 0) return { pool, devEarned, spent };
  const spentAfter = spent + rounds * GAME_COST;
  // Rake is floor(total_spent * RAKE); this run's rake is the change in that
  // floor (telescopes exactly to the cumulative rake — no drift).
  const rakeRun =
    Math.floor(spentAfter * RAKE) - Math.floor(spent * RAKE);
  const inflow = rounds * GAME_COST - rakeRun;
  const space = POOL_CAP - pool;
  const toPool = Math.min(inflow, space);
  const overflow = inflow - toPool; // above the cap → dev's, permanently
  return {
    pool: pool + toPool,
    devEarned: devEarned + rakeRun + overflow,
    spent: spentAfter,
  };
}

/**
 * Fold the play rows + admin events into the current pool & dev balances.
 *
 * Segments are keyed on `spent_at` (the total onion-chop spend recorded on each
 * event), NOT on timestamps — onions-spent is an exact monotonic count, so the
 * number of plays before an event is simply (event.spent_at - prevSpent)/5.
 * This is immune to same-second collisions between a play and an admin event
 * (the bug a timestamp-window fold has).
 */
export function computeArcadeView(gameId: string): ArcadeView {
  const { ledger, arcadePool } = getRepos();
  const totalSpent = ledger.spentTotalForGame(gameId);
  const events = arcadePool.poolEvents(gameId); // this game's add + payout

  let pool = 0;
  let devEarned = 0;
  let spent = 0;

  for (const ev of events) {
    // Plays between the previous event and this one = the spend delta.
    const rounds = Math.max(0, Math.floor((ev.spent_at - spent) / GAME_COST));
    ({ pool, devEarned, spent } = applyRounds(rounds, pool, devEarned, spent));

    if (ev.kind === "add") {
      // A seed is REAL escrow onions. If it lands over the cap (the pool grew
      // between the deposit request and its approval), the excess is conserved
      // to dev — exactly like gameplay overflow — never dropped.
      const toPool = Math.min(ev.amount, POOL_CAP - pool);
      pool += toPool;
      devEarned += ev.amount - toPool;
    } else if (ev.kind === "payout") {
      pool -= Math.min(ev.amount, pool); // never below 0
    }
  }

  // Plays after the last event (up to the current total spend).
  const tailRounds = Math.max(0, Math.floor((totalSpent - spent) / GAME_COST));
  ({ pool, devEarned, spent } = applyRounds(tailRounds, pool, devEarned, spent));

  // Rake telescopes exactly to floor(totalSpent*RAKE); the rest of devEarned is
  // the over-the-cap overflow.
  const rakeEarned = Math.floor(spent * RAKE);
  return {
    gameId,
    name: GAMES.find((g) => g.id === gameId)?.name ?? gameId,
    totalSpent: spent,
    pool,
    poolCap: POOL_CAP,
    capRemaining: POOL_CAP - pool,
    fillPct: POOL_CAP > 0 ? Math.round((pool / POOL_CAP) * 100) : 0,
    poolFull: pool >= POOL_CAP,
    devEarned,
    rakeEarned,
    overflowEarned: devEarned - rakeEarned,
    onionsAdded: arcadePool.sumByKind("add", gameId),
    onionsPaidOut: arcadePool.sumByKind("payout", gameId),
  };
}

/**
 * The aggregate dev pot across ALL games + the conservation terms. dev rake +
 * overflow from every game pool into ONE withdrawable balance (dev-send draws
 * this aggregate, never a single game).
 */
export function computeDevAndTotals(): DevTotals {
  const { arcadePool, ledger } = getRepos();
  const perGame = GAME_IDS.map((id) => computeArcadeView(id));
  const devEarned = perGame.reduce((s, v) => s + v.devEarned, 0);
  const rakeEarned = perGame.reduce((s, v) => s + v.rakeEarned, 0);
  const overflowEarned = perGame.reduce((s, v) => s + v.overflowEarned, 0);
  const devWithdrawn = arcadePool.sumByKind("devsend", null); // aggregate
  const poolsTotal = perGame.reduce((s, v) => s + v.pool, 0);
  return {
    perGame,
    devEarned,
    rakeEarned,
    overflowEarned,
    devWithdrawn,
    devBalance: devEarned - devWithdrawn,
    creditsOwed: ledger.liabilityTotal(),
    poolsTotal,
  };
}

export interface PayoutShare {
  rank: number;
  handle: string | null;
  amount: number;
}

/**
 * Split `pool` across the top players by PAYOUT_CURVE (50/30/20), integer
 * onions. With 3+ players the full pool goes out and any leftover onion(s) from
 * flooring go to #1 (shares sum EXACTLY to pool). With fewer than 3 players,
 * pay only the ranks that exist their curve share and LEAVE the remainder in
 * the pool. Never exceeds pool.
 */
export function splitTop3(
  pool: number,
  players: Array<{ handle: string | null }>
): { shares: PayoutShare[]; paid: number; remainder: number } {
  const ranks = Math.min(players.length, 3);
  if (ranks === 0 || pool <= 0) return { shares: [], paid: 0, remainder: pool };

  const shares: PayoutShare[] = [];
  let distributed = 0;
  for (let i = 0; i < ranks; i++) {
    const amt = Math.floor(pool * PAYOUT_CURVE[i]);
    shares.push({ rank: i + 1, handle: players[i].handle, amount: amt });
    distributed += amt;
  }

  if (ranks === 3) {
    // Full payout — leftover onion(s) to #1 so the three sum exactly to pool.
    shares[0].amount += pool - distributed;
    return { shares, paid: pool, remainder: 0 };
  }
  // Fewer than 3 players: remainder stays in the pool for next time.
  return { shares, paid: distributed, remainder: pool - distributed };
}
