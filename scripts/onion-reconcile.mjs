#!/usr/bin/env node
// No-onions-lost audit. Calls the admin reconcile endpoint on a running arcade
// and exits NON-ZERO if the books don't match the live escrow balance — so it
// can gate a deploy or run on a cron.
//
// Usage:
//   node scripts/onion-reconcile.mjs
//   ARCADE_BASE=http://localhost:3000 node scripts/onion-reconcile.mjs
// Reads ARCADE_ADMIN_SECRET from the environment or .env.local.

import fs from "node:fs";
import path from "node:path";

function fromEnvFile(key) {
  try {
    const p = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(p)) return "";
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i !== -1 && t.slice(0, i).trim() === key) {
        let v = t.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        return v;
      }
    }
  } catch {}
  return "";
}

const base = (process.env.ARCADE_BASE || "http://localhost:3000").replace(/\/+$/, "");
const secret = process.env.ARCADE_ADMIN_SECRET || fromEnvFile("ARCADE_ADMIN_SECRET");

if (!secret) {
  console.error("Missing ARCADE_ADMIN_SECRET (env or .env.local).");
  process.exit(2);
}

let res;
try {
  res = await fetch(`${base}/api/onions/admin/reconcile`, {
    headers: { "x-admin-secret": secret },
    signal: AbortSignal.timeout(10000),
  });
} catch (e) {
  console.error(`Could not reach ${base}: ${e?.message || e}`);
  process.exit(2);
}

const data = await res.json().catch(() => null);
if (!res.ok || !data) {
  console.error(`Reconcile failed (HTTP ${res.status}):`, JSON.stringify(data));
  process.exit(2);
}

const fmt = (n) => String(n).padStart(8);
console.log("🧅 Onion reconcile");
console.log(`  liability (player tickets) ${fmt(data.liability)}`);
console.log(`  prize pool (90%)           ${fmt(data.prizePool)}`);
console.log(`  dev cut (10%)              ${fmt(data.devRemaining)}`);
console.log(`  in-flight transfers        ${fmt(data.inFlight)}`);
console.log(`  ─────────────────────────────────`);
console.log(`  books total                ${fmt(data.books)}`);
console.log(`  live escrow balance        ${fmt(data.escrow)}`);
console.log(`  drift                      ${fmt(data.drift)}`);

if (data.drift === 0) {
  console.log("✅ Balanced — no onions lost.");
  process.exit(0);
}
if (data.drift > 0) {
  console.warn("⚠️  Wallet richer than books (safe-lag). Investigate pending deposits; funds are safe.");
  process.exit(1);
}
console.error("❌ Wallet SHORT of books — possible loss. Investigate immediately.");
process.exit(1);
