export interface Player {
  id: string;
  handle: string | null;
  created_at: string;
}

export interface Score {
  id: string;
  game_id: string;
  player_id: string;
  value: number;
  meta: string | null;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  player_id: string;
  delta: number;
  reason: string;
  created_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  handle: string | null;
  value: number;
  created_at: string;
}

export interface ScoreRepo {
  addScore(
    gameId: string,
    playerId: string,
    value: number,
    meta?: Record<string, unknown>
  ): Score;
  getTopScores(
    gameId: string,
    limit: number,
    lowerIsBetter: boolean
  ): LeaderboardEntry[];
  getPersonalBest(
    gameId: string,
    playerId: string,
    lowerIsBetter: boolean
  ): number | null;
}

export interface PlayerRepo {
  createPlayer(): Player;
  getPlayer(id: string): Player | null;
  setHandle(id: string, handle: string): Player;
  getOrCreatePlayer(id: string): Player;
}

export interface LedgerRepo {
  addEntry(playerId: string, delta: number, reason: string): LedgerEntry;
  getBalance(playerId: string): number;
  seedWelcome(playerId: string): void;
}

export interface DataRepos {
  players: PlayerRepo;
  scores: ScoreRepo;
  ledger: LedgerRepo;
}
