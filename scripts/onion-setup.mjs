#!/usr/bin/env node
// One-time setup: creates the arcade's OnionDAO escrow account.
//
// The escrow account is the app-owned wallet that collects user-approved
// onion top-ups and (via /api/onions/payout) transfers prizes back out.
// `accountSecret` is returned ONLY on first creation — paste it into
// .env.local immediately; it cannot be retrieved again.
//
// Usage:
//   ONION_API_BASE=https://onion.example ONION_EXTERNAL_API_KEY=sk_... node scripts/onion-setup.mjs
//   node scripts/onion-setup.mjs <ONION_API_BASE> <ONION_EXTERNAL_API_KEY> [ONION_CALLBACK_URL]
//
// Optionally pass ONION_CALLBACK_URL (your deployed, publicly reachable
// /api/onions/escrow-callback endpoint). When set, the account is created with
// that callback URL and a freshly generated callbackSecret — OnionDAO then
// POSTs signed deposit/transfer results to it. Without it, the arcade relies
// only on deposit polling (still works, but no server-push safety net).

import { randomBytes } from "node:crypto";

const base = (process.argv[2] || process.env.ONION_API_BASE || "").replace(/\/+$/, "");
const externalKey = process.argv[3] || process.env.ONION_EXTERNAL_API_KEY || "";
const callbackUrl = process.argv[4] || process.env.ONION_CALLBACK_URL || "";
const callbackSecret = callbackUrl ? randomBytes(32).toString("hex") : "";

if (!base || !externalKey) {
  console.error("Missing config.");
  console.error("Set ONION_API_BASE and ONION_EXTERNAL_API_KEY (env or argv).");
  console.error("");
  console.error("  ONION_API_BASE=https://onion.example \\");
  console.error("  ONION_EXTERNAL_API_KEY=sk_... \\");
  console.error("  node scripts/onion-setup.mjs");
  process.exit(1);
}

const url = `${base}/api/public/onions/escrow/accounts`;

console.log(`Creating escrow account at ${url} ...`);

let res;
try {
  res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${externalKey}`,
    },
    body: JSON.stringify({
      requester: "arcade",
      externalId: "arcade-main",
      name: "Arcade Wallet",
      // Only sent when a callback URL was provided.
      ...(callbackUrl ? { callbackUrl, callbackSecret } : {}),
    }),
  });
} catch (err) {
  console.error("Request failed (network/DNS):", err?.message || err);
  process.exit(1);
}

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.error(`Non-JSON response (HTTP ${res.status}):`);
  console.error(text);
  process.exit(1);
}

if (!res.ok) {
  console.error(`Escrow account creation failed (HTTP ${res.status}):`);
  console.error(JSON.stringify(data, null, 2));
  // If the account already exists, the secret is gone — must reuse stored one.
  if (res.status === 409) {
    console.error("");
    console.error("An escrow account with externalId 'arcade-main' already exists.");
    console.error("The accountSecret is only shown on first creation — reuse the");
    console.error("value already stored in your .env.local.");
  }
  process.exit(1);
}

const accountId = data?.account?.id;
const accountSecret = data?.accountSecret;

if (!accountId || !accountSecret) {
  console.error("Unexpected response shape — missing account.id or accountSecret:");
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("");
console.log("Escrow account created.");
console.log("");
console.log("Paste this COMPLETE block into .env.local (server-only — never commit,");
console.log("never NEXT_PUBLIC_). All four ONION_* vars below are required for the");
console.log("arcade to flip into connected mode — base + key included so you don't");
console.log("land back at \"OnionDAO not connected yet\":");
console.log("");
console.log("# ---- .env.local ----");
console.log(`ONION_API_BASE=${base}`);
console.log(`ONION_EXTERNAL_API_KEY=${externalKey}`);
console.log(`ONION_ESCROW_ACCOUNT_ID=${accountId}`);
console.log(`ONION_ESCROW_ACCOUNT_SECRET=${accountSecret}`);
if (callbackUrl) {
  console.log(`ONION_CALLBACK_URL=${callbackUrl}`);
  console.log(`ONION_CALLBACK_SECRET=${callbackSecret}`);
}
console.log("# set a long random ARCADE_ADMIN_SECRET to enable /admin/payout");
console.log("# --------------------");
console.log("");
console.log("accountSecret is shown only once. If you lose it you must create a new account.");
console.log("Then RESTART the dev server (Next reads .env.local only at boot) and run");
console.log("`node scripts/onion-doctor.mjs` to confirm everything is green.");
if (callbackUrl) {
  console.log("");
  console.log(`Callbacks will be POSTed to ${callbackUrl}`);
  console.log("ONION_CALLBACK_SECRET above must match what that endpoint verifies — paste it too.");
} else {
  console.log("");
  console.log("No ONION_CALLBACK_URL set — escrow callbacks are NOT registered.");
  console.log("Deposits still credit via polling. To enable the callback safety net,");
  console.log("set ONION_CALLBACK_URL=https://<host>/api/onions/escrow-callback on the");
  console.log("FIRST run — the callback is fixed at creation (re-running returns the");
  console.log("existing account without updating it).");
}
