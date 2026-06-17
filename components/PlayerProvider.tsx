"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getStoredPlayerId } from "@/lib/player/client";

export interface SetHandleResult {
  ok: boolean;
  /** Human-readable reason when ok is false (e.g. taken / invalid). */
  error?: string;
}

interface PlayerState {
  playerId: string;
  handle: string | null;
  balance: number;
  loading: boolean;
  /** True once the player has claimed an onion id. */
  hasIdentity: boolean;
  refresh: () => Promise<void>;
  setHandle: (handle: string) => Promise<SetHandleResult>;
}

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [playerId] = useState(() => getStoredPlayerId());
  const [handle, setHandleState] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!playerId) return;
    const res = await fetch(`/api/player?playerId=${playerId}`);
    if (res.ok) {
      const data = await res.json();
      setHandleState(data.handle);
      setBalance(data.balance);
    }
    setLoading(false);
  }, [playerId]);

  const setHandle = useCallback(
    async (newHandle: string): Promise<SetHandleResult> => {
      const res = await fetch("/api/player", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, handle: newHandle }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setHandleState(data.handle);
        setBalance(data.balance);
        return { ok: true };
      }
      return { ok: false, error: data?.message ?? "Something went wrong." };
    },
    [playerId]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <PlayerContext.Provider
      value={{
        playerId,
        handle,
        balance,
        loading,
        // Any claimed handle counts — a local @id or a real OnionDAO username.
        hasIdentity: !!handle,
        refresh,
        setHandle,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
