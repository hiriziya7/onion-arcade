#!/usr/bin/env node
// No-onions-lost proof. Mirrors the EXACT SQL/logic of the ledger + withdrawals
// repos (lib/data/sqlite.ts) and the 90/10 accounting view (lib/onions/
// accounting.ts) against a real in-memory SQLite DB, then drives a full money
// sequence asserting the invariant  E == liability + prizePool + devRemaining +
// inFlight  at every quiescent step. Run: node scripts/test-noloss.mjs
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE ledger (id TEXT PRIMARY KEY, player_id TEXT, delta INTEGER, reason TEXT, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE withdrawals (id TEXT PRIMARY KEY, kind TEXT, player_id TEXT, recipient TEXT, amount INTEGER, external_id TEXT UNIQUE, onion_tx_id TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')), settled_at TEXT);
`);

// ---- repo logic (faithful to lib/data/sqlite.ts) ---------------------------
// playable balance includes welcome (funds local play); real/cashable excludes it.
const balanceOf = (p) => db.prepare("SELECT COALESCE(SUM(delta),0) v FROM ledger WHERE player_id=?").get(p).v;
const realBalanceOf = (p) => db.prepare("SELECT COALESCE(SUM(delta),0) v FROM ledger WHERE player_id=? AND reason!='welcome'").get(p).v;
const addLedger = (p, d, r) => db.prepare("INSERT INTO ledger (id,player_id,delta,reason) VALUES (?,?,?,?)").run(randomUUID(), p, d, r);

function spend(p, amt) {
  const t = db.transaction(() => {
    const b = balanceOf(p);
    if (b < amt) return false;
    addLedger(p, -amt, "play:game");
    return true;
  });
  return t();
}
function reserveCashout(p, recipient) {
  const t = db.transaction(() => {
    const b = realBalanceOf(p); // excludes welcome — only escrow-backed onions cash out
    if (b <= 0) return null;
    const id = randomUUID();
    addLedger(p, -b, "cashout:" + id);
    db.prepare("INSERT INTO withdrawals (id,kind,player_id,recipient,amount,external_id,status) VALUES (?,'cashout',?,?,?,?, 'pending')").run(id, p, recipient, b, "cashout_" + id);
    return db.prepare("SELECT * FROM withdrawals WHERE id=?").get(id);
  });
  return t();
}
function reservePool(kind, recipient, amount, cap) {
  const t = db.transaction(() => {
    const used = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM withdrawals WHERE kind=? AND status!='failed'").get(kind).v;
    if (used + amount > cap) return null;
    const id = randomUUID();
    db.prepare("INSERT INTO withdrawals (id,kind,player_id,recipient,amount,external_id,status) VALUES (?,?,NULL,?,?,?, 'pending')").run(id, kind, recipient, amount, kind + "_" + id);
    return db.prepare("SELECT * FROM withdrawals WHERE id=?").get(id);
  });
  return t();
}
const markCompleted = (extId) => db.prepare("UPDATE withdrawals SET status='completed', settled_at=datetime('now') WHERE external_id=? AND status='pending'").run(extId);
function reverseWithdrawal(extId) {
  const t = db.transaction(() => {
    const w = db.prepare("SELECT * FROM withdrawals WHERE external_id=? AND status='pending'").get(extId);
    if (!w) return;
    db.prepare("UPDATE withdrawals SET status='failed', settled_at=datetime('now') WHERE id=?").run(w.id);
    if (w.kind === "cashout" && w.player_id) addLedger(w.player_id, w.amount, "cashout-refund:" + w.id);
  });
  t();
}
// creditOnce simplified: a settled deposit credits the player.
const creditDeposit = (p, amt) => addLedger(p, amt, "deposit:" + randomUUID());

// ---- accounting view (faithful to lib/onions/accounting.ts) ----------------
const splitSpend = (s) => { const pool = Math.floor((s * 90) / 100); return { pool, dev: s - pool }; };
function poolView() {
  const liability = db.prepare("SELECT COALESCE(SUM(delta),0) v FROM ledger WHERE reason!='welcome'").get().v;
  const spent = db.prepare("SELECT COALESCE(SUM(-delta),0) v FROM ledger WHERE reason LIKE 'play:%'").get().v;
  const { pool: poolAccrued, dev: devAccrued } = splitSpend(spent);
  const sumKind = (k) => db.prepare("SELECT COALESCE(SUM(amount),0) v FROM withdrawals WHERE kind=? AND status!='failed'").get(k).v;
  const inFlight = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM withdrawals WHERE status='pending'").get().v;
  return { liability, spent, poolAccrued, devAccrued, prizePool: poolAccrued - sumKind("payout"), devRemaining: devAccrued - sumKind("dev"), inFlight };
}
const books = (v) => v.liability + v.prizePool + v.devRemaining + v.inFlight;

// simulated live escrow = completed deposits minus completed withdrawals
let escrow = 0;

// ---- assertions ------------------------------------------------------------
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label} ${extra}`); }
}
function invariant(label) {
  const v = poolView();
  const b = books(v);
  check(`${label}: books(${b}) == escrow(${escrow})  [L${v.liability} P${v.prizePool} D${v.devRemaining} F${v.inFlight}]`, b === escrow, `drift=${escrow - b}`);
}

console.log("splitSpend never mints/drops an onion:");
for (let s = 0; s <= 23; s++) { const { pool, dev } = splitSpend(s); if (pool + dev !== s) fail++; }
check("splitSpend(s).pool + .dev === s for s in 0..23", true);
check("splitSpend(5) == {pool:4,dev:1}", JSON.stringify(splitSpend(5)) === JSON.stringify({ pool: 4, dev: 1 }));

console.log("\nFull lifecycle (buy-in 100 → play x4 → cash-out → payout → dev):");
const P = "player1";
creditDeposit(P, 100); escrow += 100; invariant("after buy-in 100");
for (let i = 0; i < 4; i++) spend(P, 5); invariant("after 4 plays (spent 20)");
check("balance is 80 after 4 plays", balanceOf(P) === 80);
check("prizePool is floor(20*0.9)=18", poolView().prizePool === 18);
check("devRemaining is 2", poolView().devRemaining === 2);

const w = reserveCashout(P, "player1");          // reserve 80
invariant("cash-out reserved (pending, pre-transfer)");
check("balance 0 while cash-out pending", balanceOf(P) === 0);
markCompleted(w.external_id); escrow -= 80;       // transfer settles
invariant("cash-out completed");

const pay = reservePool("payout", "winner", 10, poolView().poolAccrued);
check("payout 10 reserved (<= pool 18)", !!pay);
invariant("payout reserved (pending)");
markCompleted(pay.external_id); escrow -= 10;
invariant("payout completed");

const dev = reservePool("dev", "devacct", 2, poolView().devAccrued);
check("dev withdraw 2 reserved", !!dev);
markCompleted(dev.external_id); escrow -= 2;
invariant("dev withdrawal completed");
check("final escrow == 8", escrow === 8);

console.log("\nEdge cases:");
const P2 = "player2";
creditDeposit(P2, 50); escrow += 50;
const a = reserveCashout(P2, "p2");
const b2 = reserveCashout(P2, "p2");             // concurrent second click
check("second concurrent cash-out is a no-op (null)", b2 === null);
check("only one pending cashout row for player2", db.prepare("SELECT COUNT(*) c FROM withdrawals WHERE player_id=? AND status='pending'").get(P2).c === 1);
reverseWithdrawal(a.external_id);                // transfer rejected
check("reversed cash-out restores balance to 50", balanceOf(P2) === 50);
invariant("after rejected cash-out reversed");

const tooBig = reservePool("payout", "x", 999, poolView().poolAccrued);
check("payout exceeding pool is rejected (null)", tooBig === null);

// BLOCKER fix: welcome onions (local-mode grant) must NEVER drain escrow.
const G = "grandfathered";
addLedger(G, 100, "welcome");                    // got 100 free in local mode
check("welcome grant shows in playable balance (100)", balanceOf(G) === 100);
check("welcome grant is NOT cashable (real balance 0)", realBalanceOf(G) === 0);
const drain = reserveCashout(G, "g");            // tries to cash out welcome
check("cash-out of welcome-only balance is rejected (null) — escrow safe", drain === null);
invariant("after welcome-only player (no escrow change)"); // escrow unchanged, books unchanged

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
