import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { REASON } from "@/lib/onions/reasons";
import type {
  AdminLeaderboardEntry,
  ArcadeEvent,
  ArcadePoolRepo,
  DataRepos,
  HistoryEntry,
  Deposit,
  DepositRepo,
  LeaderboardEntry,
  LedgerEntry,
  LedgerRepo,
  Player,
  PlayerRepo,
  Score,
  ScoreRepo,
  Winner,
  Withdrawal,
  WithdrawalRepo,
} from "./repo";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "arcade.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    migrate(db);
  }
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      handle TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Every onion id (@handle) must stay distinct. Partial + COLLATE NOCASE so
    -- many players can still have a NULL handle, but set handles are unique
    -- case-insensitively.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_players_handle
      ON players(handle COLLATE NOCASE) WHERE handle IS NOT NULL;

    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      player_id TEXT NOT NULL REFERENCES players(id),
      value REAL NOT NULL,
      meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_scores_game ON scores(game_id);
    CREATE INDEX IF NOT EXISTS idx_scores_player_game ON scores(player_id, game_id);

    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id),
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_player ON ledger(player_id);

    -- OnionDAO escrow deposits. external_id is UNIQUE so a top-up is recorded
    -- exactly once and credited at most once (status guard + this constraint).
    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY,
      player_id TEXT,
      external_id TEXT UNIQUE,
      onion_tx_id TEXT,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deposits_player ON deposits(player_id);

    -- Escrow -> user transfers (cash-outs, prize payouts, dev-rake withdrawals).
    -- One saga table for every onion that LEAVES escrow. external_id is UNIQUE
    -- and is the idempotency key sent to OnionDAO, so the same transfer can
    -- never be executed twice. A 'pending' row is money already debited locally
    -- but not yet confirmed gone from escrow (the IN_FLIGHT bucket).
    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,                 -- 'cashout' | 'payout' | 'dev'
      player_id TEXT,                     -- set for cashout; NULL for payout/dev
      recipient TEXT NOT NULL,            -- OnionDAO username
      amount INTEGER NOT NULL,
      external_id TEXT UNIQUE NOT NULL,
      onion_tx_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'failed'
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      settled_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_withdrawals_player ON withdrawals(player_id);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

    -- Onion Arcade admin-dashboard economy (separate from the escrow model
    -- above). Append-only event log; pool & dev balances are DERIVED by folding
    -- these events together with the onion-chop play rows from the ledger, in
    -- timestamp order (see lib/arcade/pool.ts). kind: 'add' (admin tops up the
    -- pool), 'payout' (top-3 prize, drains pool), 'devsend' (manual dev draw).
    -- spent_at = total onion-chop onions spent at the moment the event was
    -- recorded. The fold segments plays by this COUNT (not by timestamp) so
    -- same-second collisions between plays and events can't misorder anything.
    -- game_id segregates the per-game pools; NULL for aggregate dev-send events.
    CREATE TABLE IF NOT EXISTS arcade_events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      amount INTEGER NOT NULL,
      spent_at INTEGER NOT NULL DEFAULT 0,
      game_id TEXT,
      payout_id TEXT,
      recipient TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_arcade_events_kind ON arcade_events(kind);
    CREATE INDEX IF NOT EXISTS idx_arcade_events_game ON arcade_events(game_id, spent_at);

    -- One row per winner per 'pay out top 3' (grouped by payout_id) for the
    -- Winners panel.
    CREATE TABLE IF NOT EXISTS arcade_winners (
      id TEXT PRIMARY KEY,
      payout_id TEXT NOT NULL,
      rank INTEGER NOT NULL,
      handle TEXT,
      amount INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_arcade_winners_payout ON arcade_winners(payout_id);
  `);

  // Forward hook for the future "connect your OnionDAO badge" feature: a
  // nullable, unique external id. Added via ALTER so existing DBs upgrade
  // cleanly (SQLite lacks ADD COLUMN IF NOT EXISTS).
  const playerCols = database
    .prepare("PRAGMA table_info(players)")
    .all() as Array<{ name: string }>;
  if (!playerCols.some((c) => c.name === "badge_id")) {
    database.exec("ALTER TABLE players ADD COLUMN badge_id TEXT");
  }
  database.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_players_badge
       ON players(badge_id) WHERE badge_id IS NOT NULL;`
  );

  // Player-level moderation flag (anti-spoofing): a flagged player is excluded
  // from the public leaderboard AND the top-3 payout — including ANY future
  // scores they submit (the flag is on the player, not individual score rows).
  // Reversible. Added via ALTER for clean upgrades.
  const playerModCols = database
    .prepare("PRAGMA table_info(players)")
    .all() as Array<{ name: string }>;
  if (!playerModCols.some((c) => c.name === "flagged_at")) {
    database.exec("ALTER TABLE players ADD COLUMN flagged_at TEXT");
  }

  // Recipient (OnionDAO username) for dev-send arcade events, so payout history
  // can show who was paid. Nullable; older rows stay NULL.
  const aeCols = database
    .prepare("PRAGMA table_info(arcade_events)")
    .all() as Array<{ name: string }>;
  if (!aeCols.some((c) => c.name === "recipient")) {
    database.exec("ALTER TABLE arcade_events ADD COLUMN recipient TEXT");
  }
  // Per-game segregation. Backfill existing rows to onion-chop (the only game
  // the previous single-pool code ever wrote), preserving that pool.
  if (!aeCols.some((c) => c.name === "game_id")) {
    database.exec("ALTER TABLE arcade_events ADD COLUMN game_id TEXT");
    database.exec(
      "UPDATE arcade_events SET game_id = 'onion-chop' WHERE game_id IS NULL AND kind != 'devsend'"
    );
  }

  // game_id on deposits so an admin pool-seed deposit (player_id NULL) knows
  // which game's pool it feeds.
  const depCols = database
    .prepare("PRAGMA table_info(deposits)")
    .all() as Array<{ name: string }>;
  if (!depCols.some((c) => c.name === "game_id")) {
    database.exec("ALTER TABLE deposits ADD COLUMN game_id TEXT");
  }
}

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * True when an error is a SQLite UNIQUE-constraint violation. Lets routes turn
 * a lost handle-uniqueness race (two players claiming the same @id at once,
 * which the partial unique index rejects) into a clean 409 instead of a
 * generic 400.
 */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function createPlayerRepo(database: Database.Database): PlayerRepo {
  return {
    createPlayer(): Player {
      const id = generateId();
      database
        .prepare("INSERT INTO players (id, handle) VALUES (?, NULL)")
        .run(id);
      return database
        .prepare("SELECT * FROM players WHERE id = ?")
        .get(id) as Player;
    },

    getPlayer(id: string): Player | null {
      return (
        (database.prepare("SELECT * FROM players WHERE id = ?").get(id) as
          | Player
          | undefined) ?? null
      );
    },

    getPlayerByHandle(handle: string): Player | null {
      return (
        (database
          .prepare("SELECT * FROM players WHERE handle = ? COLLATE NOCASE")
          .get(handle) as Player | undefined) ?? null
      );
    },

    setHandle(id: string, handle: string): Player {
      database
        .prepare("UPDATE players SET handle = ? WHERE id = ?")
        .run(handle.trim(), id);
      return database
        .prepare("SELECT * FROM players WHERE id = ?")
        .get(id) as Player;
    },

    getOrCreatePlayer(id: string): Player {
      const existing = this.getPlayer(id);
      if (existing) return existing;
      database
        .prepare("INSERT INTO players (id, handle) VALUES (?, NULL)")
        .run(id);
      return database
        .prepare("SELECT * FROM players WHERE id = ?")
        .get(id) as Player;
    },

    // Flag / unflag a player for moderation. A flagged player (and every score
    // they have or later post) is excluded from the public board and payouts.
    setFlagged(id: string, flagged: boolean): void {
      database
        .prepare(
          flagged
            ? "UPDATE players SET flagged_at = datetime('now') WHERE id = ? AND flagged_at IS NULL"
            : "UPDATE players SET flagged_at = NULL WHERE id = ?"
        )
        .run(id);
    },
  };
}

function createLedgerRepo(database: Database.Database): LedgerRepo {
  return {
    addEntry(playerId: string, delta: number, reason: string): LedgerEntry {
      const id = generateId();
      database
        .prepare(
          "INSERT INTO ledger (id, player_id, delta, reason) VALUES (?, ?, ?, ?)"
        )
        .run(id, playerId, delta, reason);
      return database
        .prepare("SELECT * FROM ledger WHERE id = ?")
        .get(id) as LedgerEntry;
    },

    getBalance(playerId: string): number {
      const row = database
        .prepare(
          "SELECT COALESCE(SUM(delta), 0) as balance FROM ledger WHERE player_id = ?"
        )
        .get(playerId) as { balance: number };
      return row.balance;
    },

    seedWelcome(playerId: string, amount: number = 100): void {
      const existing = database
        .prepare(
          "SELECT id FROM ledger WHERE player_id = ? AND reason = ? LIMIT 1"
        )
        .get(playerId, REASON.WELCOME);
      if (!existing) {
        // A zero grant (configured mode) still writes a marker row so the seed
        // is recorded and never retried.
        this.addEntry(playerId, amount, REASON.WELCOME);
      }
    },

    // Total REAL onions the arcade owes players back (the LIABILITY term of the
    // no-loss invariant). Welcome grants are excluded: they are a local-play
    // courtesy, NOT escrow-backed, so they are never a real liability and must
    // never be cashable (otherwise a local-mode welcome grant could drain the
    // escrow for onions nobody deposited).
    liabilityTotal(): number {
      const row = database
        .prepare(
          "SELECT COALESCE(SUM(delta), 0) as v FROM ledger WHERE reason != ?"
        )
        .get(REASON.WELCOME) as { v: number };
      return row.v;
    },

    // Total onions spent on gameplay across all players (a positive number).
    // This is the base the 90/10 prize-pool / dev split is computed from.
    spentTotal(): number {
      const row = database
        .prepare(
          "SELECT COALESCE(SUM(-delta), 0) as v FROM ledger WHERE reason LIKE ?"
        )
        .get(REASON.PLAY_PREFIX + "%") as { v: number };
      return row.v;
    },

    // Total onions spent on ONE game (exact reason match). The arcade-dashboard
    // pool is built only from onion-chop spend.
    spentTotalForGame(gameId: string): number {
      const row = database
        .prepare("SELECT COALESCE(SUM(-delta), 0) as v FROM ledger WHERE reason = ?")
        .get(REASON.PLAY_PREFIX + gameId) as { v: number };
      return row.v;
    },

    // Count of plays of `gameId` in the half-open time window [from, to). null
    // bounds are open. Used by the arcade-pool fold to count rounds per segment
    // between admin events.
    countPlays(gameId: string, from: string | null, to: string | null): number {
      let sql = "SELECT COUNT(*) as v FROM ledger WHERE reason = ?";
      const params: string[] = [REASON.PLAY_PREFIX + gameId];
      if (from !== null) {
        sql += " AND created_at >= ?";
        params.push(from);
      }
      if (to !== null) {
        sql += " AND created_at < ?";
        params.push(to);
      }
      return (database.prepare(sql).get(...params) as { v: number }).v;
    },

    uniquePlayersForGame(gameId: string): number {
      return (
        database
          .prepare(
            "SELECT COUNT(DISTINCT player_id) as v FROM ledger WHERE reason = ?"
          )
          .get(REASON.PLAY_PREFIX + gameId) as { v: number }
      ).v;
    },

    spend(
      playerId: string,
      amount: number,
      reason: string
    ): { ok: boolean; balance: number } {
      const txn = database.transaction(() => {
        const row = database
          .prepare(
            "SELECT COALESCE(SUM(delta), 0) as balance FROM ledger WHERE player_id = ?"
          )
          .get(playerId) as { balance: number };
        const balance = row.balance;
        if (balance < amount) {
          return { ok: false, balance };
        }
        const id = generateId();
        database
          .prepare(
            "INSERT INTO ledger (id, player_id, delta, reason) VALUES (?, ?, ?, ?)"
          )
          .run(id, playerId, -amount, reason);
        return { ok: true, balance: balance - amount };
      });
      return txn();
    },
  };
}

function createScoreRepo(database: Database.Database): ScoreRepo {
  return {
    addScore(
      gameId: string,
      playerId: string,
      value: number,
      meta?: Record<string, unknown>
    ): Score {
      const id = generateId();
      const metaJson = meta ? JSON.stringify(meta) : null;
      database
        .prepare(
          "INSERT INTO scores (id, game_id, player_id, value, meta) VALUES (?, ?, ?, ?, ?)"
        )
        .run(id, gameId, playerId, value, metaJson);
      return database
        .prepare("SELECT * FROM scores WHERE id = ?")
        .get(id) as Score;
    },

    getTopScores(
      gameId: string,
      limit: number,
      lowerIsBetter: boolean
    ): LeaderboardEntry[] {
      const order = lowerIsBetter ? "ASC" : "DESC";
      // Each player's entry is their BEST score: MIN when lower-is-better, MAX
      // otherwise. (Previously MIN unconditionally, which surfaced the WORST
      // score for higher-is-better games like Onion Chop — wrong for ranking.)
      const agg = lowerIsBetter ? "MIN" : "MAX";
      const rows = database
        .prepare(
          `
        SELECT
          s.player_id,
          p.handle,
          ${agg}(s.value) as value,
          MIN(s.created_at) as created_at
        FROM scores s
        JOIN players p ON p.id = s.player_id
        WHERE s.game_id = ? AND p.flagged_at IS NULL
        GROUP BY s.player_id
        ORDER BY value ${order}, created_at ASC
        LIMIT ?
      `
        )
        .all(gameId, limit) as Array<{
        player_id: string;
        handle: string | null;
        value: number;
        created_at: string;
      }>;

      return rows.map((row, index) => ({
        rank: index + 1,
        player_id: row.player_id,
        handle: row.handle,
        value: row.value,
        created_at: row.created_at,
      }));
    },

    getPersonalBest(
      gameId: string,
      playerId: string,
      lowerIsBetter: boolean
    ): number | null {
      const agg = lowerIsBetter ? "MIN" : "MAX";
      const row = database
        .prepare(
          `SELECT ${agg}(value) as best FROM scores WHERE game_id = ? AND player_id = ?`
        )
        .get(gameId, playerId) as { best: number | null };
      return row.best;
    },

    // Admin leaderboard: best score + rounds played + total onions spent per
    // player, INCLUDING hidden players (so the admin can unhide). The public
    // getTopScores excludes hidden rows.
    getAdminLeaderboard(
      gameId: string,
      limit: number,
      lowerIsBetter: boolean
    ): AdminLeaderboardEntry[] {
      const agg = lowerIsBetter ? "MIN" : "MAX";
      const order = lowerIsBetter ? "ASC" : "DESC";
      const rows = database
        .prepare(
          `
        SELECT
          s.player_id,
          p.handle,
          ${agg}(s.value) as best,
          MIN(s.created_at) as created_at,
          MAX(CASE WHEN p.flagged_at IS NOT NULL THEN 1 ELSE 0 END) as hidden,
          COALESCE(l.rounds, 0) as rounds_played,
          COALESCE(l.spent, 0) as total_spent
        FROM scores s
        JOIN players p ON p.id = s.player_id
        LEFT JOIN (
          SELECT player_id, COUNT(*) as rounds, SUM(-delta) as spent
          FROM ledger WHERE reason = ? GROUP BY player_id
        ) l ON l.player_id = s.player_id
        WHERE s.game_id = ?
        GROUP BY s.player_id
        ORDER BY best ${order}, created_at ASC
        LIMIT ?
      `
        )
        .all(REASON.PLAY_PREFIX + gameId, gameId, limit) as Array<{
        player_id: string;
        handle: string | null;
        best: number;
        created_at: string;
        hidden: number;
        rounds_played: number;
        total_spent: number;
      }>;
      return rows.map((r, i) => ({
        rank: i + 1,
        player_id: r.player_id,
        handle: r.handle,
        best: r.best,
        roundsPlayed: r.rounds_played,
        totalSpent: r.total_spent,
        hidden: r.hidden === 1,
      }));
    },

  };
}

function createDepositRepo(database: Database.Database): DepositRepo {
  return {
    create(playerId: string, externalId: string, amount: number): Deposit {
      const id = generateId();
      database
        .prepare(
          "INSERT INTO deposits (id, player_id, external_id, amount, status) VALUES (?, ?, ?, ?, 'pending')"
        )
        .run(id, playerId, externalId, amount);
      return database
        .prepare("SELECT * FROM deposits WHERE id = ?")
        .get(id) as Deposit;
    },

    // Admin pool-seed deposit: no player, tagged to a game's pool. Settles into
    // an arcade 'add' event (not a player credit) via arcadePool.settleSeedOnce.
    createSeed(externalId: string, amount: number, gameId: string): Deposit {
      const id = generateId();
      database
        .prepare(
          "INSERT INTO deposits (id, player_id, external_id, amount, status, game_id) VALUES (?, NULL, ?, ?, 'pending', ?)"
        )
        .run(id, externalId, amount, gameId);
      return database
        .prepare("SELECT * FROM deposits WHERE id = ?")
        .get(id) as Deposit;
    },

    getById(id: string): Deposit | null {
      return (
        (database.prepare("SELECT * FROM deposits WHERE id = ?").get(id) as
          | Deposit
          | undefined) ?? null
      );
    },

    getByExternalId(externalId: string): Deposit | null {
      return (
        (database
          .prepare("SELECT * FROM deposits WHERE external_id = ?")
          .get(externalId) as Deposit | undefined) ?? null
      );
    },

    getByPlayer(playerId: string): Deposit[] {
      return database
        .prepare(
          "SELECT * FROM deposits WHERE player_id = ? ORDER BY created_at DESC"
        )
        .all(playerId) as Deposit[];
    },

    markStatus(id: string, status: string, onionTxId?: string): Deposit {
      // Never clobber a credited deposit. A late terminal-failure signal (e.g.
      // the GET poll resuming after the callback already credited) must not
      // flip a 'completed' row back to 'failed' — that would re-open it to a
      // second credit in creditOnce.
      if (onionTxId !== undefined) {
        database
          .prepare(
            "UPDATE deposits SET status = ?, onion_tx_id = ? WHERE id = ? AND status != 'completed'"
          )
          .run(status, onionTxId, id);
      } else {
        database
          .prepare(
            "UPDATE deposits SET status = ? WHERE id = ? AND status != 'completed'"
          )
          .run(status, id);
      }
      return database
        .prepare("SELECT * FROM deposits WHERE id = ?")
        .get(id) as Deposit;
    },

    // Credit a completed deposit to the player's ledger exactly once. The
    // re-check of status, the ledger insert, and the status flip all run inside
    // one transaction so the deposit GET poll and the escrow callback (which may
    // fire within the same window) cannot both credit the same deposit.
    creditOnce(
      depositId: string,
      creditAmount: number,
      onionTxId?: string
    ): { credited: boolean; balance: number } {
      const txn = database.transaction(() => {
        const dep = database
          .prepare("SELECT * FROM deposits WHERE id = ?")
          .get(depositId) as Deposit | undefined;
        if (!dep) return { credited: false, balance: 0 };

        const balanceOf = () =>
          (
            database
              .prepare(
                "SELECT COALESCE(SUM(delta), 0) as balance FROM ledger WHERE player_id = ?"
              )
              .get(dep.player_id) as { balance: number }
          ).balance;

        // Any terminal state is final: a deposit credited once ('completed') or
        // declined ('failed') is never (re-)credited, regardless of which
        // signal — poll or callback — arrives, or in what order.
        if (dep.status === "completed" || dep.status === "failed") {
          return { credited: false, balance: balanceOf() };
        }

        database
          .prepare(
            "INSERT INTO ledger (id, player_id, delta, reason) VALUES (?, ?, ?, ?)"
          )
          .run(
            generateId(),
            dep.player_id,
            creditAmount,
            REASON.DEPOSIT_PREFIX + (onionTxId || dep.external_id)
          );
        database
          .prepare(
            "UPDATE deposits SET status = 'completed', onion_tx_id = ? WHERE id = ?"
          )
          .run(onionTxId ?? dep.onion_tx_id, depositId);
        return { credited: true, balance: balanceOf() };
      });
      return txn();
    },
  };
}

function createWithdrawalRepo(database: Database.Database): WithdrawalRepo {
  const get = (id: string) =>
    (database.prepare("SELECT * FROM withdrawals WHERE id = ?").get(id) as
      | Withdrawal
      | undefined) ?? null;

  return {
    getById(id: string): Withdrawal | null {
      return get(id);
    },

    getByExternalId(externalId: string): Withdrawal | null {
      return (
        (database
          .prepare("SELECT * FROM withdrawals WHERE external_id = ?")
          .get(externalId) as Withdrawal | undefined) ?? null
      );
    },

    // Reserve a player's ENTIRE balance for cash-out, atomically: read the
    // balance, and if positive, in ONE transaction debit it from the ledger and
    // open a 'pending' withdrawal row. A second concurrent click reads balance
    // 0 and no-ops. Returns the row to drive the transfer, or null when there's
    // nothing to cash out.
    reserveCashout(
      playerId: string,
      recipient: string
    ): Withdrawal | null {
      const txn = database.transaction(() => {
        // Cash out only REAL (escrow-backed) onions — exclude welcome grants so
        // a free local-play grant can never be withdrawn as real escrow onions.
        const balance = (
          database
            .prepare(
              "SELECT COALESCE(SUM(delta), 0) as v FROM ledger WHERE player_id = ? AND reason != ?"
            )
            .get(playerId, REASON.WELCOME) as { v: number }
        ).v;
        if (balance <= 0) return null;

        const id = generateId();
        const externalId = "cashout_" + id;
        // Debit the whole ticket first so it can't be spent or cashed out again.
        database
          .prepare(
            "INSERT INTO ledger (id, player_id, delta, reason) VALUES (?, ?, ?, ?)"
          )
          .run(generateId(), playerId, -balance, REASON.CASHOUT_PREFIX + id);
        database
          .prepare(
            "INSERT INTO withdrawals (id, kind, player_id, recipient, amount, external_id, status) VALUES (?, 'cashout', ?, ?, ?, ?, 'pending')"
          )
          .run(id, playerId, recipient, balance, externalId);
        return get(id);
      });
      return txn();
    },

    // Open a 'pending' payout/dev withdrawal of `amount`, but only if it fits
    // within `cap` (the remaining prize pool or dev balance), checked INSIDE the
    // transaction so two requests can't both pass a stale cap. Returns null when
    // the amount exceeds the cap.
    reservePoolWithdrawal(
      kind: "payout" | "dev",
      recipient: string,
      amount: number,
      cap: number
    ): Withdrawal | null {
      const txn = database.transaction(() => {
        // Sum of pending+completed withdrawals of this kind already committed
        // against the same cap source, re-read inside the txn.
        const used = (
          database
            .prepare(
              "SELECT COALESCE(SUM(amount), 0) as v FROM withdrawals WHERE kind = ? AND status != 'failed'"
            )
            .get(kind) as { v: number }
        ).v;
        if (used + amount > cap) return null;

        const id = generateId();
        const externalId = kind + "_" + id;
        database
          .prepare(
            "INSERT INTO withdrawals (id, kind, player_id, recipient, amount, external_id, status) VALUES (?, ?, NULL, ?, ?, ?, 'pending')"
          )
          .run(id, kind, recipient, amount, externalId);
        return get(id);
      });
      return txn();
    },

    markStatus(
      externalId: string,
      status: string,
      onionTxId?: string
    ): Withdrawal | null {
      database
        .prepare(
          "UPDATE withdrawals SET status = ?, onion_tx_id = COALESCE(?, onion_tx_id), settled_at = datetime('now') WHERE external_id = ? AND status = 'pending'"
        )
        .run(status, onionTxId ?? null, externalId);
      return this.getByExternalId(externalId);
    },

    // Definitively-rejected transfer: mark the row failed AND, for a cashout,
    // write the compensating ledger credit so the player's balance is fully
    // restored (payout/dev never touched a player ledger — marking them failed
    // simply releases the pool/dev they reserved). Atomic and guarded so it runs
    // at most once per row.
    reverseWithdrawal(externalId: string): Withdrawal | null {
      const txn = database.transaction(() => {
        const w = database
          .prepare(
            "SELECT * FROM withdrawals WHERE external_id = ? AND status = 'pending'"
          )
          .get(externalId) as Withdrawal | undefined;
        if (!w) return this.getByExternalId(externalId);

        database
          .prepare(
            "UPDATE withdrawals SET status = 'failed', settled_at = datetime('now') WHERE id = ?"
          )
          .run(w.id);
        if (w.kind === "cashout" && w.player_id) {
          database
            .prepare(
              "INSERT INTO ledger (id, player_id, delta, reason) VALUES (?, ?, ?, ?)"
            )
            .run(
              generateId(),
              w.player_id,
              w.amount,
              REASON.CASHOUT_REFUND_PREFIX + w.id
            );
        }
        return this.getById(w.id);
      });
      return txn();
    },

    sumByKind(kind: string, includePending: boolean): number {
      const clause = includePending
        ? "status != 'failed'"
        : "status = 'completed'";
      const row = database
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as v FROM withdrawals WHERE kind = ? AND ${clause}`
        )
        .get(kind) as { v: number };
      return row.v;
    },

    listPending(): Withdrawal[] {
      return database
        .prepare("SELECT * FROM withdrawals WHERE status = 'pending'")
        .all() as Withdrawal[];
    },
  };
}

function createArcadePoolRepo(database: Database.Database): ArcadePoolRepo {
  return {
    // Append a pool event. 'add' (admin top-up, per game), 'devsend' (aggregate
    // dev draw — gameId null). spentAt is that game's total spend at record time
    // (the fold's ordering key).
    addEvent(
      kind: "add" | "devsend",
      amount: number,
      spentAt: number,
      gameId: string | null,
      recipient?: string
    ): ArcadeEvent {
      const id = generateId();
      database
        .prepare(
          "INSERT INTO arcade_events (id, kind, amount, spent_at, game_id, recipient) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(id, kind, amount, spentAt, gameId, recipient ?? null);
      return database
        .prepare("SELECT * FROM arcade_events WHERE id = ?")
        .get(id) as ArcadeEvent;
    },

    // One game's pool-affecting events (add + payout), ordered by spend count.
    poolEvents(gameId: string): ArcadeEvent[] {
      return database
        .prepare(
          "SELECT * FROM arcade_events WHERE game_id = ? AND kind IN ('add','payout') ORDER BY spent_at ASC, rowid ASC"
        )
        .all(gameId) as ArcadeEvent[];
    },

    // Sum of a kind, optionally scoped to one game (gameId null = all games,
    // used for the aggregate devsend total).
    sumByKind(kind: string, gameId: string | null): number {
      const row =
        gameId === null
          ? (database
              .prepare(
                "SELECT COALESCE(SUM(amount), 0) as v FROM arcade_events WHERE kind = ?"
              )
              .get(kind) as { v: number })
          : (database
              .prepare(
                "SELECT COALESCE(SUM(amount), 0) as v FROM arcade_events WHERE kind = ? AND game_id = ?"
              )
              .get(kind, gameId) as { v: number });
      return row.v;
    },

    recordPayout(
      payoutId: string,
      winners: Array<{ rank: number; handle: string | null; amount: number }>,
      totalPaid: number,
      spentAt: number,
      gameId: string
    ): void {
      const txn = database.transaction(() => {
        database
          .prepare(
            "INSERT INTO arcade_events (id, kind, amount, spent_at, game_id, payout_id) VALUES (?, 'payout', ?, ?, ?, ?)"
          )
          .run(generateId(), totalPaid, spentAt, gameId, payoutId);
        for (const w of winners) {
          database
            .prepare(
              "INSERT INTO arcade_winners (id, payout_id, rank, handle, amount) VALUES (?, ?, ?, ?, ?)"
            )
            .run(generateId(), payoutId, w.rank, w.handle, w.amount);
        }
      });
      txn();
    },

    latestWinners(gameId: string): Winner[] {
      const last = database
        .prepare(
          "SELECT payout_id FROM arcade_events WHERE kind = 'payout' AND game_id = ? AND payout_id IS NOT NULL ORDER BY created_at DESC, rowid DESC LIMIT 1"
        )
        .get(gameId) as { payout_id: string } | undefined;
      if (!last) return [];
      return database
        .prepare(
          "SELECT * FROM arcade_winners WHERE payout_id = ? ORDER BY rank ASC"
        )
        .all(last.payout_id) as Winner[];
    },

    // Payout + dev-send log across all games, newest first.
    history(limit: number): HistoryEntry[] {
      const events = database
        .prepare(
          "SELECT * FROM arcade_events WHERE kind IN ('payout','devsend') ORDER BY created_at DESC, rowid DESC LIMIT ?"
        )
        .all(limit) as ArcadeEvent[];
      return events.map((e) => ({
        kind: e.kind,
        amount: e.amount,
        recipient: e.recipient,
        gameId: e.game_id,
        created_at: e.created_at,
        winners:
          e.kind === "payout" && e.payout_id
            ? (database
                .prepare(
                  "SELECT rank, handle, amount FROM arcade_winners WHERE payout_id = ? ORDER BY rank ASC"
                )
                .all(e.payout_id) as Array<{
                rank: number;
                handle: string | null;
                amount: number;
              }>)
            : [],
      }));
    },

    // Settle an admin pool-seed deposit exactly once: when its escrow deposit
    // completes, record the real 'add' event for that game's pool. Idempotent on
    // the deposit row status (guards a racing poll/callback).
    settleSeedOnce(
      depositId: string,
      addAmount: number,
      spentAt: number,
      onionTxId?: string
    ): { recorded: boolean } {
      const txn = database.transaction(() => {
        const dep = database
          .prepare("SELECT * FROM deposits WHERE id = ?")
          .get(depositId) as Deposit | undefined;
        if (!dep || !dep.game_id) return { recorded: false };
        if (dep.status === "completed" || dep.status === "failed") {
          return { recorded: false };
        }
        database
          .prepare(
            "INSERT INTO arcade_events (id, kind, amount, spent_at, game_id) VALUES (?, 'add', ?, ?, ?)"
          )
          .run(generateId(), addAmount, spentAt, dep.game_id);
        database
          .prepare(
            "UPDATE deposits SET status = 'completed', onion_tx_id = ? WHERE id = ?"
          )
          .run(onionTxId ?? dep.onion_tx_id, depositId);
        return { recorded: true };
      });
      return txn();
    },
  };
}

let repos: DataRepos | null = null;

export function getRepos(): DataRepos {
  if (!repos) {
    const database = getDb();
    repos = {
      players: createPlayerRepo(database),
      scores: createScoreRepo(database),
      ledger: createLedgerRepo(database),
      deposits: createDepositRepo(database),
      withdrawals: createWithdrawalRepo(database),
      arcadePool: createArcadePoolRepo(database),
    };
  }
  return repos;
}
