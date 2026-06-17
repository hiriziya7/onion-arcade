export interface Player {
  id: string;
  handle: string | null;
  /** Reserved for a future OnionDAO badge link (wallet / member / NFT id). */
  badge_id: string | null;
  /** Set when an admin flags the player out of leaderboards/payouts. */
  flagged_at: string | null;
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

export interface Deposit {
  id: string;
  player_id: string | null;
  external_id: string;
  onion_tx_id: string | null;
  amount: number;
  status: string;
  /** Set for admin pool-seed deposits (which game's pool it feeds). */
  game_id: string | null;
  created_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  handle: string | null;
  value: number;
  created_at: string;
}

export interface AdminLeaderboardEntry {
  rank: number;
  player_id: string;
  handle: string | null;
  best: number;
  roundsPlayed: number;
  totalSpent: number;
  hidden: boolean;
}

export interface HistoryEntry {
  kind: string; // 'payout' | 'devsend'
  amount: number;
  recipient: string | null;
  gameId: string | null;
  created_at: string;
  winners: Array<{ rank: number; handle: string | null; amount: number }>;
}

export interface Withdrawal {
  id: string;
  kind: "cashout" | "payout" | "dev";
  player_id: string | null;
  recipient: string;
  amount: number;
  external_id: string;
  onion_tx_id: string | null;
  status: string;
  created_at: string;
  settled_at: string | null;
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
  /** Admin leaderboard incl. hidden players, with rounds played + total spent. */
  getAdminLeaderboard(
    gameId: string,
    limit: number,
    lowerIsBetter: boolean
  ): AdminLeaderboardEntry[];
}

export interface PlayerRepo {
  createPlayer(): Player;
  getPlayer(id: string): Player | null;
  /** Case-insensitive lookup by onion id (handle). */
  getPlayerByHandle(handle: string): Player | null;
  setHandle(id: string, handle: string): Player;
  getOrCreatePlayer(id: string): Player;
  /** Flag/unflag a player out of all leaderboards + payouts (moderation). */
  setFlagged(id: string, flagged: boolean): void;
}

export interface LedgerRepo {
  addEntry(playerId: string, delta: number, reason: string): LedgerEntry;
  getBalance(playerId: string): number;
  seedWelcome(playerId: string, amount?: number): void;
  /** Total onions owed back to all players (the LIABILITY bucket). */
  liabilityTotal(): number;
  /** Total onions spent on gameplay across all players (positive). */
  spentTotal(): number;
  /** Total onions spent on one game (exact reason match, positive). */
  spentTotalForGame(gameId: string): number;
  /** Count of plays of a game in the half-open window [from, to) (null = open). */
  countPlays(gameId: string, from: string | null, to: string | null): number;
  /** Distinct players who have played a game (metrics). */
  uniquePlayersForGame(gameId: string): number;
  /**
   * Atomically debit `amount` onions from `playerId`. Reads the balance and
   * writes the negative ledger row inside a single transaction so concurrent
   * spends cannot both pass the balance check. Returns the post-spend balance
   * on success, or the unchanged balance with `ok:false` when too low.
   */
  spend(
    playerId: string,
    amount: number,
    reason: string
  ): { ok: boolean; balance: number };
}

export interface DepositRepo {
  create(playerId: string, externalId: string, amount: number): Deposit;
  /** Create an admin pool-seed deposit (player_id NULL, tagged to a game). */
  createSeed(externalId: string, amount: number, gameId: string): Deposit;
  getById(id: string): Deposit | null;
  getByExternalId(externalId: string): Deposit | null;
  getByPlayer(playerId: string): Deposit[];
  markStatus(id: string, status: string, onionTxId?: string): Deposit;
  /**
   * Atomically credit a completed deposit to the player's ledger exactly once.
   * Returns whether this call performed the credit and the resulting balance.
   */
  creditOnce(
    depositId: string,
    creditAmount: number,
    onionTxId?: string
  ): { credited: boolean; balance: number };
}

export interface WithdrawalRepo {
  getById(id: string): Withdrawal | null;
  getByExternalId(externalId: string): Withdrawal | null;
  /**
   * Atomically reserve a player's ENTIRE balance for cash-out: debit the ledger
   * and open a 'pending' row in one transaction. Returns null when there's
   * nothing to cash out (balance <= 0). A concurrent second call no-ops.
   */
  reserveCashout(playerId: string, recipient: string): Withdrawal | null;
  /**
   * Open a 'pending' payout/dev withdrawal of `amount`, only if it fits within
   * `cap` (checked inside the transaction). Returns null if it exceeds the cap.
   */
  reservePoolWithdrawal(
    kind: "payout" | "dev",
    recipient: string,
    amount: number,
    cap: number
  ): Withdrawal | null;
  /** Flip a pending row to completed/failed (idempotent on already-settled). */
  markStatus(
    externalId: string,
    status: string,
    onionTxId?: string
  ): Withdrawal | null;
  /** Definitively reject a pending row, restoring a cash-out player's balance. */
  reverseWithdrawal(externalId: string): Withdrawal | null;
  /** Sum of amounts for a kind; includePending counts in-flight, else only completed. */
  sumByKind(kind: string, includePending: boolean): number;
  listPending(): Withdrawal[];
}

export interface ArcadeEvent {
  id: string;
  kind: string; // 'add' | 'payout' | 'devsend'
  amount: number;
  /** that game's spend when recorded — the fold's ordering key. */
  spent_at: number;
  /** which game's pool this affects; null for aggregate dev-send. */
  game_id: string | null;
  payout_id: string | null;
  /** OnionDAO username for dev-send events (null otherwise). */
  recipient: string | null;
  created_at: string;
}

export interface Winner {
  id: string;
  payout_id: string;
  rank: number;
  handle: string | null;
  amount: number;
  created_at: string;
}

export interface ArcadePoolRepo {
  addEvent(
    kind: "add" | "devsend",
    amount: number,
    spentAt: number,
    gameId: string | null,
    recipient?: string
  ): ArcadeEvent;
  /** One game's add+payout events, ordered by spend count, for the fold. */
  poolEvents(gameId: string): ArcadeEvent[];
  /** Sum of a kind; gameId null = all games (aggregate devsend). */
  sumByKind(kind: string, gameId: string | null): number;
  recordPayout(
    payoutId: string,
    winners: Array<{ rank: number; handle: string | null; amount: number }>,
    totalPaid: number,
    spentAt: number,
    gameId: string
  ): void;
  latestWinners(gameId: string): Winner[];
  /** Payout + dev-send log across all games, newest first. */
  history(limit: number): HistoryEntry[];
  /** Record a settled pool-seed deposit's 'add' event exactly once. */
  settleSeedOnce(
    depositId: string,
    addAmount: number,
    spentAt: number,
    onionTxId?: string
  ): { recorded: boolean };
}

export interface DataRepos {
  players: PlayerRepo;
  scores: ScoreRepo;
  ledger: LedgerRepo;
  deposits: DepositRepo;
  withdrawals: WithdrawalRepo;
  arcadePool: ArcadePoolRepo;
}
