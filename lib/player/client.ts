"use client";

const PLAYER_ID_KEY = "arcade_player_id";

export function getStoredPlayerId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}
