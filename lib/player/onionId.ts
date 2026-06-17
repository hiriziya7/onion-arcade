/**
 * The public "onion id" — how a player shows up on every leaderboard. Always
 * starts with "@", 2–18 chars of [a-z0-9_] after it. Stored as typed (case
 * preserved) but treated case-insensitively for uniqueness. Shared by the
 * client gate and the server API so both agree on what's valid.
 */
export const ONION_ID_RE = /^@[a-z0-9_]{2,18}$/i;

export const ONION_ID_RULE =
  "Start with @, then 2–18 letters, numbers or underscores (e.g. @spicychef).";

/**
 * Normalize raw input into a valid onion id, or null if it can't be one.
 * A leading "@" is added if missing so users can type either way.
 */
export function normalizeOnionId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let v = raw.trim();
  if (!v) return null;
  if (!v.startsWith("@")) v = "@" + v;
  return ONION_ID_RE.test(v) ? v : null;
}
