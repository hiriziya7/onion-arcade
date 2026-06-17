#!/usr/bin/env node
// Onion wallet DEBUG PROTOCOL.
//
// Prints a checklist of exactly what's configured and what's reachable, so you
// can see at a glance why the arcade is (or isn't) connected to OnionDAO.
// Reads .env.local the same way the app does, then probes the real API.
//
// Usage:
//   node scripts/onion-doctor.mjs
//   ONION_API_BASE=https://oniondao.dev node scripts/onion-doctor.mjs   # override
//
// Nothing here mutates anything — it's all read-only GETs. Secrets are never
// printed (only their presence + length).

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env.local");

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};
const ok = (s) => `${C.green}✅ ${s}${C.reset}`;
const bad = (s) => `${C.red}❌ ${s}${C.reset}`;
const warn = (s) => `${C.yellow}⚠️  ${s}${C.reset}`;
const head = (s) => `\n${C.bold}${C.cyan}${s}${C.reset}`;

// --- load .env.local (real process.env wins, mirroring Next precedence) ------
function parseEnvFile(p) {
  const map = {};
  if (!fs.existsSync(p)) return { exists: false, map };
  for (const raw of fs.readFileSync(p, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    map[key] = val;
  }
  return { exists: true, map };
}

const { exists: envExists, map: fileEnv } = parseEnvFile(ENV_PATH);
const get = (k) => process.env[k] ?? fileEnv[k] ?? "";

const base = get("ONION_API_BASE").replace(/\/+$/, "");
const externalKey = get("ONION_EXTERNAL_API_KEY");
const accountId = get("ONION_ESCROW_ACCOUNT_ID");
const accountSecret = get("ONION_ESCROW_ACCOUNT_SECRET");
const adminSecret = get("ARCADE_ADMIN_SECRET");
const callbackSecret = get("ONION_CALLBACK_SECRET");
const gameCost = get("GAME_COST");

const present = (v) => (v ? ok(`SET (${v.length} chars)`) : bad("MISSING"));

console.log(`${C.bold}🧅 Onion wallet doctor${C.reset} ${C.dim}(read-only)${C.reset}`);

console.log(head("1. .env.local"));
console.log(envExists ? ok(`.env.local found at ${ENV_PATH}`) : bad(`.env.local NOT found at ${ENV_PATH}`));
if (!envExists) console.log(`   ${C.dim}Copy .env.example to .env.local and fill it in.${C.reset}`);

console.log(head("2. Required vars (the 4 that flip isOnionConfigured -> true)"));
console.log(`   ONION_API_BASE              ${base ? ok(base) : bad("MISSING")}`);
console.log(`   ONION_EXTERNAL_API_KEY      ${present(externalKey)}`);
console.log(`   ONION_ESCROW_ACCOUNT_ID     ${present(accountId)}`);
console.log(`   ONION_ESCROW_ACCOUNT_SECRET ${present(accountSecret)}`);

console.log(head("3. Optional vars"));
console.log(`   ARCADE_ADMIN_SECRET (payout) ${adminSecret ? ok(`SET (${adminSecret.length} chars)`) : warn("missing — /admin/payout will 401")}`);
console.log(`   ONION_CALLBACK_SECRET        ${callbackSecret ? ok(`SET (${callbackSecret.length} chars)`) : warn("missing — escrow callbacks won't verify (polling still works)")}`);
console.log(`   GAME_COST                    ${gameCost ? ok(gameCost) : `${C.dim}unset -> defaults to 5${C.reset}`}`);

const configured = !!(base && externalKey && accountId && accountSecret);
console.log(head("4. Verdict: isOnionConfigured()"));
console.log(configured
  ? ok("CONFIGURED — the arcade will use real OnionDAO usernames + escrow top-ups.")
  : bad("NOT configured — arcade runs in LOCAL mode (local @id + 100 welcome onions; 'Add onions' will say \"OnionDAO not connected yet\")."));

// --- live connectivity probes (only if we have something to test) -----------
async function probe(label, url, opts) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { label, status: res.status, ok: res.ok, json, text };
  } catch (e) {
    return { label, status: 0, ok: false, error: String(e?.message || e) };
  }
}

if (base) {
  console.log(head("5. Live connectivity (real GETs against ONION_API_BASE)"));

  const pub = await probe("public", `${base}/api/public/usernames?q=a`, { method: "GET" });
  console.log(`   a. Base reachable (GET /api/public/usernames)`);
  console.log(`      ${pub.ok ? ok(`HTTP ${pub.status} — reachable, ${pub.json?.total ?? "?"} users`) : bad(`HTTP ${pub.status} ${pub.error || pub.text?.slice(0, 120) || ""}`)}`);

  if (externalKey) {
    const esc = await probe("external", `${base}/api/public/onions/escrow/accounts?requester=arcade`, {
      method: "GET", headers: { Authorization: `Bearer ${externalKey}` },
    });
    console.log(`   b. External API key valid (GET escrow accounts ?requester=arcade)`);
    if (esc.ok) {
      const accts = esc.json?.accounts ?? [];
      console.log(`      ${ok(`HTTP ${esc.status} — key accepted, ${accts.length} escrow account(s) for requester 'arcade'`)}`);
      for (const a of accts) {
        console.log(`         ${C.dim}- ${a.account?.externalId} (id ${a.account?.id?.slice(0, 8)}…) balances total=${a.balances?.total}${C.reset}`);
      }
    } else {
      console.log(`      ${bad(`HTTP ${esc.status} — ${esc.status === 401 ? "key rejected/invalid" : (esc.error || esc.text?.slice(0, 120) || "")}`)}`);
    }
  } else {
    console.log(`   b. External API key valid — ${warn("skipped (ONION_EXTERNAL_API_KEY missing)")}`);
  }

  if (accountId && accountSecret) {
    const acct = await probe("account", `${base}/api/public/onions/escrow/accounts/${accountId}`, {
      method: "GET", headers: { Authorization: `Bearer ${accountSecret}` },
    });
    console.log(`   c. Escrow account readable (GET escrow account by id, with accountSecret)`);
    if (acct.ok) {
      const b = acct.json?.balances ?? acct.json?.account?.balances;
      console.log(`      ${ok(`HTTP ${acct.status} — account reachable`)}`);
      console.log(`      ${C.dim}balances: ${JSON.stringify(b ?? "?")}${C.reset}`);
      // Show the transactions-array shape the poller depends on.
      const keys = Object.keys(acct.json ?? {});
      const txKey = ["transactions", "recentTransactions", "items"].find((k) => Array.isArray(acct.json?.[k]));
      console.log(`      ${txKey ? ok(`transactions array found under key "${txKey}" (${acct.json[txKey].length} rows)`) : warn(`no transactions[] array at top level — poller keys: top-level=${keys.join(",")}`)}`);
    } else {
      console.log(`      ${bad(`HTTP ${acct.status} — ${acct.status === 401 ? "accountSecret rejected" : acct.status === 404 ? "account id not found" : (acct.error || acct.text?.slice(0, 120) || "")}`)}`);
    }
  } else {
    console.log(`   c. Escrow account readable — ${warn("skipped (ACCOUNT_ID/SECRET missing — run scripts/onion-setup.mjs)")}`);
  }
} else {
  console.log(head("5. Live connectivity"));
  console.log(`   ${warn("skipped — ONION_API_BASE is not set, nothing to probe.")}`);
}

// --- next step --------------------------------------------------------------
console.log(head("Next step"));
if (configured) {
  console.log(`   ${ok("Config looks complete. If section 5 is all green, deposits should work.")}`);
  console.log(`   ${C.dim}If 5b/5c failed, the keys are set but rejected — re-check the values.${C.reset}`);
} else if (base && externalKey && !(accountId && accountSecret)) {
  console.log(`   You have a base + external key but no escrow account. Create one:`);
  console.log(`   ${C.cyan}node scripts/onion-setup.mjs${C.reset}  ${C.dim}(prints ACCOUNT_ID + ACCOUNT_SECRET to paste into .env.local)${C.reset}`);
} else if (!externalKey) {
  console.log(`   You still need an ${C.bold}ONION_EXTERNAL_API_KEY${C.reset} from the OnionDAO side.`);
  console.log(`   ${C.dim}Without it the arcade can't create an escrow account or take deposits.${C.reset}`);
} else {
  console.log(`   Fill the missing required vars in .env.local, then re-run this doctor.`);
}
console.log("");
