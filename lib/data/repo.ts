export interface Player {
  id: string;
  handle: string | null;
  /** Reserved for a future OnionDAO badge link (wallet / member / NFT id). */
  badge_id: string | null;
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
  player_id: string;
  external_id: string;
  onion_tx_id: string | null;
  amount: number;
  status: string;
  created_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  handle: string | null;
  value: number;
  created_at: string;
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
}

export interface PlayerRepo {
  createPlayer(): Player;
  getPlayer(id: string): Player | null;
  /** Case-insensitive lookup by onion id (handle). */
  getPlayerByHandle(handle: string): Player | null;
  setHandle(id: string, handle: string): Player;
  getOrCreatePlayer(id: string): Player;
}

export interface LedgerRepo {
  addEntry(playerId: string, delta: number, reason: string): LedgerEntry;
  getBalance(playerId: string): number;
  seedWelcome(playerId: string, amount?: number): void;
  /** Total onions owed back to all players (the LIABILITY bucket). */
  liabilityTotal(): number;
  /** Total onions spent on gameplay across all players (positive). */
  spentTotal(): number;
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

export interface DataRepos {
  players: PlayerRepo;
  scores: ScoreRepo;
  ledger: LedgerRepo;
  deposits: DepositRepo;
  withdrawals: WithdrawalRepo;
}
