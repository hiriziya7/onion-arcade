import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type {
  DataRepos,
  LeaderboardEntry,
  LedgerEntry,
  LedgerRepo,
  Player,
  PlayerRepo,
  Score,
  ScoreRepo,
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
  `);
}

function generateId(): string {
  return crypto.randomUUID();
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

    seedWelcome(playerId: string): void {
      const existing = database
        .prepare(
          "SELECT id FROM ledger WHERE player_id = ? AND reason = 'welcome' LIMIT 1"
        )
        .get(playerId);
      if (!existing) {
        this.addEntry(playerId, 100, "welcome");
      }
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
      const rows = database
        .prepare(
          `
        SELECT
          s.player_id,
          p.handle,
          MIN(s.value) as value,
          MIN(s.created_at) as created_at
        FROM scores s
        JOIN players p ON p.id = s.player_id
        WHERE s.game_id = ?
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
    };
  }
  return repos;
}
