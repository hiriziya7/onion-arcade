import { getRepos } from "@/lib/data/sqlite";

export function getOnionBalance(playerId: string): number {
  return getRepos().ledger.getBalance(playerId);
}

export function ensureWelcomeOnions(playerId: string): void {
  getRepos().ledger.seedWelcome(playerId);
}
