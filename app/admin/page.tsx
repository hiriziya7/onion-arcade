"use client";

// Onion Arcade ADMIN DASHBOARD — admin-only, secret-gated, logic-first
// (intentionally unstyled; UI is a later pass). THREE segregated per-game pools
// + one aggregate dev pot + the no-onions-missing totals check. Every action is
// checked server-side via the x-admin-secret header.

import { useCallback, useEffect, useState } from "react";

interface LbRow {
  rank: number;
  player_id: string;
  handle: string | null;
  best: number;
  roundsPlayed: number;
  totalSpent: number;
  hidden: boolean;
}
interface GameView {
  gameId: string;
  name: string;
  totalSpent: number;
  pool: number;
  poolCap: number;
  capRemaining: number;
  fillPct: number;
  poolFull: boolean;
  devEarned: number;
  onionsPaidOut: number;
  leaderboard: LbRow[];
  winners: Array<{ rank: number; handle: string | null; amount: number }>;
  metrics: { totalPlays: number; uniquePlayers: number };
}
interface State {
  games: GameView[];
  dev: {
    devEarned: number;
    rakeEarned: number;
    overflowEarned: number;
    devWithdrawn: number;
    devBalance: number;
  };
  config: { gameCost: number; rake: number; poolCap: number; payoutCurve: number[] };
}
interface Totals {
  configured: boolean;
  poolsTotal?: number;
  devBalance?: number;
  creditsOwed?: number;
  books?: number;
  walletHeld?: number;
  drift?: number;
  ok?: boolean;
}
interface HistRow {
  kind: string;
  amount: number;
  recipient: string | null;
  gameId: string | null;
  created_at: string;
  winners: Array<{ rank: number; handle: string | null; amount: number }>;
}
interface Preview {
  gameId: string;
  pool: number;
  shares: Array<{ rank: number; handle: string | null; amount: number }>;
  paid: number;
  remainder: number;
}

const box: React.CSSProperties = { border: "1px solid #444", padding: 16, borderRadius: 6, marginBottom: 14, background: "#111" };
const card: React.CSSProperties = { border: "1px solid #333", padding: 14, borderRadius: 6, marginBottom: 12, background: "#161616" };
const h2: React.CSSProperties = { fontSize: 15, marginBottom: 10, color: "#9cf" };
const dim: React.CSSProperties = { color: "#888", fontSize: 12 };
const num = (n: number | undefined) => (n ?? 0).toLocaleString();

export default function AdminDashboard() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [st, setSt] = useState<State | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [history, setHistory] = useState<HistRow[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [devTo, setDevTo] = useState("");
  const [devAmt, setDevAmt] = useState("");
  const [seed, setSeed] = useState<Record<string, { user: string; amt: string; status: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, t, h] = await Promise.all([
        fetch("/api/arcade/state", { headers: { "x-admin-secret": secret } }),
        fetch("/api/arcade/totals", { headers: { "x-admin-secret": secret } }),
        fetch("/api/arcade/history", { headers: { "x-admin-secret": secret } }),
      ]);
      if (s.status === 401) { setErr("Wrong admin key."); setAuthed(false); return; }
      setAuthed(true); setErr(null);
      if (s.ok) setSt(await s.json());
      if (t.ok) setTotals(await t.json());
      if (h.ok) setHistory((await h.json()).history ?? []);
    } catch (e) { setErr(String(e)); }
  }, [secret]);

  useEffect(() => {
    if (!authed) return;
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, [authed, reload]);

  const post = useCallback(async (label: string, path: string, body?: unknown) => {
    setBusy(label); setErr(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) setErr(`${label}: ${JSON.stringify(data)}`);
      await reload();
      return { ok: res.ok, data };
    } catch (e) { setErr(String(e)); return { ok: false, data: null }; }
    finally { setBusy(null); }
  }, [secret, reload]);

  const doPreview = useCallback(async (game: string) => {
    setBusy("preview");
    try {
      const res = await fetch(`/api/arcade/preview?game=${game}`, { headers: { "x-admin-secret": secret } });
      if (res.ok) setPreview(await res.json());
    } finally { setBusy(null); }
  }, [secret]);

  // Real seed: POST -> poll the deposit until it settles in the portal.
  const doSeed = useCallback(async (game: string) => {
    const s = seed[game];
    if (!s?.user.trim() || !s?.amt) return;
    setSeed((p) => ({ ...p, [game]: { ...p[game], status: "starting" } }));
    const res = await post(`seed:${game}`, "/api/arcade/add-to-pool", {
      gameId: game, adminUsername: s.user.trim(), amount: Number(s.amt),
    });
    if (!res.ok || !res.data?.depositId) {
      setSeed((p) => ({ ...p, [game]: { ...p[game], status: "failed" } }));
      return;
    }
    const depositId = res.data.depositId;
    const poll = async (): Promise<void> => {
      const r = await fetch(`/api/arcade/add-to-pool?depositId=${depositId}`, { headers: { "x-admin-secret": secret } });
      const d = await r.json().catch(() => null);
      const status = d?.status ?? "pending";
      setSeed((p) => ({ ...p, [game]: { ...p[game], status } }));
      if (status === "completed") { await reload(); return; }
      if (status === "failed") return;
      setTimeout(poll, 2500);
    };
    setSeed((p) => ({ ...p, [game]: { ...p[game], status: "approve" } }));
    poll();
  }, [seed, post, secret, reload]);

  const flag = (playerId: string, hidden: boolean) => post("flag", "/api/arcade/leaderboard/flag", { playerId, hidden });

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 24, fontFamily: "ui-monospace, monospace", color: "#ddd" }}>
      <h1 style={{ fontSize: 22, marginBottom: 14 }}>🧅 Onion Arcade — Admin</h1>

      <div style={box}>
        <label>Admin key:{" "}
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && reload()} style={{ padding: 4 }} />
        </label>{" "}
        <button onClick={reload} disabled={!secret}>Enter</button>
        {err && <div style={{ color: "#f66", marginTop: 8 }}>{err}</div>}
      </div>

      {authed && st && (
        <>
          {/* TOTALS CHECK */}
          <div style={box}>
            <div style={h2}>Totals check — no onions missing</div>
            {!totals || totals.configured === false ? (
              <div style={dim}>Wallet check unavailable (local mode).</div>
            ) : (
              <>
                <div>wallet {num(totals.walletHeld)} vs books {num(totals.books)} (pools {num(totals.poolsTotal)} + dev {num(totals.devBalance)} + credits {num(totals.creditsOwed)})</div>
                <div style={{ fontWeight: 700, color: totals.ok ? "#5c9" : "#f55", marginTop: 4 }}>
                  {totals.ok ? "✓ BALANCED" : "✗ DRIFT — investigate"} · drift {num(totals.drift)}
                </div>
              </>
            )}
          </div>

          {/* DEV POOL (aggregate) */}
          <div style={box}>
            <div style={h2}>Dev pool (aggregate across all games)</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{num(st.dev.devBalance)} onions</div>
            <div style={dim}>earned {num(st.dev.devEarned)} = rake {num(st.dev.rakeEarned)} + overflow {num(st.dev.overflowEarned)} · withdrawn {num(st.dev.devWithdrawn)}</div>
            <div style={{ marginTop: 10 }}>
              <input placeholder="recipient username" value={devTo} onChange={(e) => setDevTo(e.target.value)} style={{ padding: 4, width: 170 }} />{" "}
              <input type="number" min={1} placeholder="amount" value={devAmt} onChange={(e) => setDevAmt(e.target.value)} style={{ padding: 4, width: 90 }} />{" "}
              <button disabled={busy !== null || st.dev.devBalance <= 0 || !devTo.trim() || !devAmt}
                onClick={() => post("dev-send", "/api/arcade/dev-send", { recipientUsername: devTo.trim(), amount: Number(devAmt) }).then(() => setDevAmt(""))}>
                Send (max {num(st.dev.devBalance)})
              </button>
            </div>
          </div>

          {/* THREE PER-GAME POOL SECTIONS */}
          {st.games.map((g) => {
            const sd = seed[g.gameId] ?? { user: "", amt: "", status: "" };
            const setSd = (patch: Partial<typeof sd>) => setSeed((p) => ({ ...p, [g.gameId]: { ...sd, ...patch } }));
            return (
              <div key={g.gameId} style={box}>
                <div style={{ ...h2, color: "#fc9" }}>{g.name} — pool</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{num(g.pool)} / {num(g.poolCap)}</div>
                <div style={{ height: 12, background: "#222", borderRadius: 4, overflow: "hidden", margin: "6px 0" }}>
                  <div style={{ width: `${g.fillPct}%`, height: "100%", background: g.poolFull ? "#e6b800" : "#5c9" }} />
                </div>
                {g.poolFull && <div style={{ color: "#e6b800", fontWeight: 700 }}>POOL FULL — overflow now flows to dev</div>}
                <div style={dim}>spent {num(g.totalSpent)} · paid out {num(g.onionsPaidOut)} · dev contrib {num(g.devEarned)} · plays {num(g.metrics.totalPlays)} · players {num(g.metrics.uniquePlayers)}</div>

                {/* SEED (real deposit) */}
                <div style={{ marginTop: 10 }}>
                  <input placeholder="your OnionDAO username" value={sd.user} onChange={(e) => setSd({ user: e.target.value })} style={{ padding: 4, width: 175 }} />{" "}
                  <input type="number" min={1} placeholder="onions" value={sd.amt} onChange={(e) => setSd({ amt: e.target.value })} style={{ padding: 4, width: 90 }} />{" "}
                  <button disabled={busy !== null || g.capRemaining <= 0 || !sd.user.trim() || !sd.amt}
                    onClick={() => doSeed(g.gameId)}>
                    {g.capRemaining <= 0 ? "Pool full" : `Add real onions (max ${num(g.capRemaining)})`}
                  </button>
                  {sd.status === "approve" && <span style={{ color: "#e6b800", marginLeft: 8 }}>Approve the deposit in your OnionDAO portal…</span>}
                  {sd.status === "completed" && <span style={{ color: "#5c9", marginLeft: 8 }}>Added ✓</span>}
                  {sd.status === "failed" && <span style={{ color: "#f55", marginLeft: 8 }}>Failed / declined</span>}
                </div>

                {/* PAYOUT (preview -> confirm) */}
                <div style={{ marginTop: 10 }}>
                  <button disabled={busy !== null || g.pool <= 0} onClick={() => doPreview(g.gameId)}>Preview payout</button>
                  {preview && preview.gameId === g.gameId && (
                    <span style={{ marginLeft: 10 }}>
                      {preview.shares.map((s) => `#${s.rank} ${s.handle ?? "—"}=${num(s.amount)}`).join("  ")}
                      {" "}
                      <button disabled={busy !== null || preview.shares.length === 0}
                        onClick={() => post("payout", `/api/arcade/payout?game=${g.gameId}`).then(() => setPreview(null))}>
                        CONFIRM pay {num(preview.paid)}
                      </button>
                    </span>
                  )}
                </div>

                {/* LEADERBOARD */}
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginTop: 10 }}>
                  <thead><tr style={{ textAlign: "left", color: "#888" }}><th>#</th><th>player</th><th>best</th><th>rounds</th><th>spent</th><th></th></tr></thead>
                  <tbody>
                    {g.leaderboard.map((e) => (
                      <tr key={e.player_id} style={{ opacity: e.hidden ? 0.4 : 1, borderTop: "1px solid #222" }}>
                        <td>{e.rank}</td><td>{e.handle ?? e.player_id.slice(0, 8)}</td><td>{num(e.best)}</td>
                        <td>{num(e.roundsPlayed)}</td><td>{num(e.totalSpent)}</td>
                        <td><button disabled={busy !== null} onClick={() => flag(e.player_id, !e.hidden)}>{e.hidden ? "unhide" : "hide"}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* PAYOUT HISTORY */}
          <div style={box}>
            <div style={h2}>Payout history</div>
            {history.length === 0 ? <div style={dim}>None yet.</div> : (
              <ul style={{ fontSize: 12 }}>
                {history.map((h, i) => (
                  <li key={i}>
                    <span style={dim}>{h.created_at}</span>{" "}
                    {h.kind === "devsend"
                      ? `dev send ${num(h.amount)} → ${h.recipient ?? "—"}`
                      : `[${h.gameId ?? "?"}] payout ${num(h.amount)} → ${h.winners.map((w) => `#${w.rank} ${w.handle ?? "—"}(${num(w.amount)})`).join(", ")}`}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* CONFIG */}
          <div style={box}>
            <div style={h2}>Config</div>
            <div style={dim}>GAME_COST {st.config.gameCost} · RAKE {st.config.rake} · POOL_CAP {st.config.poolCap} · PAYOUT_CURVE [{st.config.payoutCurve.join(", ")}]</div>
          </div>
        </>
      )}
    </main>
  );
}
