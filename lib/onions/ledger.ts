import { getRepos } from "@/lib/data/sqlite";
import { isOnionConfigured } from "./config";

/** Local welcome grant when OnionDAO is NOT configured (pure-local play). */
const LOCAL_WELCOME_GRANT = 100;

export function getOnionBalance(playerId: string): number {
  return getRepos().ledger.getBalance(playerId);
}

/**
 * Seed a player's starting onions exactly once.
 *
 * - Unconfigured (local) mode: grant LOCAL_WELCOME_GRANT so the arcade is
 *   playable with no OnionDAO backing.
 * - Configured (real OnionDAO) mode: grant 0 — players must top up from their
 *   OnionDAO wallet before playing. A zero-value welcome row is still written
 *   so the seed stays idempotent.
 */
export function ensureWelcomeOnions(playerId: string): void {
  const grant = isOnionConfigured() ? 0 : LOCAL_WELCOME_GRANT;
  getRepos().ledger.seedWelcome(playerId, grant);
}
