// SERVER-ONLY. Reads OnionDAO secrets from process.env. Never import this from
// a client component — it would leak ONION_* keys into the browser bundle.
// The only client-safe onion module is ./cost.

import { timingSafeEqual } from "node:crypto";

export interface OnionConfig {
  base: string | undefined;
  externalKey: string | undefined;
  accountId: string | undefined;
  accountSecret: string | undefined;
  adminSecret: string | undefined;
  callbackSecret: string | undefined;
}

export function getOnionConfig(): OnionConfig {
  return {
    base: process.env.ONION_API_BASE,
    externalKey: process.env.ONION_EXTERNAL_API_KEY,
    accountId: process.env.ONION_ESCROW_ACCOUNT_ID,
    accountSecret: process.env.ONION_ESCROW_ACCOUNT_SECRET,
    adminSecret: process.env.ARCADE_ADMIN_SECRET,
    callbackSecret: process.env.ONION_CALLBACK_SECRET,
  };
}

/**
 * True only when the four secrets needed to talk to the escrow API are present.
 * When false the arcade falls back to the local @id identity flow and spends
 * local welcome-ledger onions.
 */
export function isOnionConfigured(): boolean {
  const { base, externalKey, accountId, accountSecret } = getOnionConfig();
  return !!(base && externalKey && accountId && accountSecret);
}

/** Server-enforced cost of one play, in onions. */
export const GAME_COST: number = Number(process.env.GAME_COST) || 5;

/**
 * Constant-time check of an admin-secret header against ARCADE_ADMIN_SECRET.
 * Returns false when the secret is unset (admin routes stay locked by default).
 */
export function checkAdminSecret(provided: string | null): boolean {
  const expected = process.env.ARCADE_ADMIN_SECRET;
  if (!expected || provided == null) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
