"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getStoredPlayerId } from "@/lib/player/client";

interface PlayerState {
  playerId: string;
  handle: string | null;
  balance: number;
  loading: boolean;
  refresh: () => Promise<void>;
  setHandle: (handle: string) => Promise<void>;
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
    async (newHandle: string) => {
      const res = await fetch("/api/player", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, handle: newHandle }),
      });
      if (res.ok) {
        const data = await res.json();
        setHandleState(data.handle);
        setBalance(data.balance);
      }
    },
    [playerId]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <PlayerContext.Provider
      value={{ playerId, handle, balance, loading, refresh, setHandle }}
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
