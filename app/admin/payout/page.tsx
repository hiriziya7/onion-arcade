"use client";

import { useState } from "react";
import { PixelPanel } from "@/components/ui/8bit/pixel-panel";
import { PixelButton } from "@/components/ui/8bit/pixel-button";
import { Input } from "@/components/ui/input";

/**
 * Owner-only console: see the books (prize pool, dev cut, drift), pay a prize
 * from the pool to a winner, and pull the dev cut. The admin secret travels in
 * the x-admin-secret header, never the body or the URL.
 */
interface Report {
  liability: number;
  spent: number;
  prizePool: number;
  devRemaining: number;
  inFlight: number;
  books: number;
  escrow: number;
  drift: number;
  ok: boolean;
}

export default function AdminPayoutPage() {
  const [secret, setSecret] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hdrs = () => ({
    "Content-Type": "application/json",
    "x-admin-secret": secret,
  });

  const loadReport = async () => {
    setError(null);
    setBusy("report");
    try {
      const res = await fetch("/api/onions/admin/reconcile", {
        headers: { "x-admin-secret": secret },
      });
      const data = await res.json();
      if (res.ok) setReport(data as Report);
      else setError(`HTTP ${res.status} — ${data?.error ?? "failed"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  };

  const send = async (path: string, label: string) => {
    setError(null);
    setResult(null);
    const amt = Number(amount);
    if (!recipient.trim()) return setError("Recipient username is required.");
    if (!Number.isInteger(amt) || amt <= 0)
      return setError("Amount must be a positive whole number.");
    setBusy(label);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ recipientUsername: recipient.trim(), amount: amt }),
      });
      const data = await res.json();
      const pretty = JSON.stringify(data, null, 2);
      if (res.ok) {
        setResult(pretty);
        await loadReport();
      } else {
        setError(`HTTP ${res.status}\n${pretty}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  };

  const cell = "flex items-baseline justify-between gap-3 font-mono text-sm";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-12">
      <PixelPanel tone="text-[var(--neon-primary)]" className="bg-[var(--bg-deep)]">
        <div className="flex flex-col gap-5 p-7">
          <h1 className="arcade-title text-xl font-semibold uppercase text-[var(--neon-primary)] neon-text-subtle">
            Onion console
          </h1>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase text-[var(--text-faint)]">
              Admin secret
            </span>
            <Input
              type="password"
              value={secret}
              spellCheck={false}
              autoComplete="off"
              placeholder="••••••••"
              onChange={(e) => setSecret(e.target.value)}
              className="border-[var(--border-strong)] bg-[var(--bg)] font-mono text-[var(--text)]"
            />
          </label>

          <PixelButton
            type="button"
            variant="outline"
            onClick={loadReport}
            disabled={busy !== null || !secret}
          >
            {busy === "report" ? "Loading…" : "Load books & reconcile"}
          </PixelButton>

          {report && (
            <div className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-4">
              <div className={cell}>
                <span className="text-[var(--text-muted)]">Player tickets</span>
                <span className="text-[var(--text)]">{report.liability}</span>
              </div>
              <div className={cell}>
                <span className="text-[var(--text-muted)]">Prize pool (90%)</span>
                <span className="text-[var(--neon-yellow)]">{report.prizePool}</span>
              </div>
              <div className={cell}>
                <span className="text-[var(--text-muted)]">Dev cut (10%)</span>
                <span className="text-[var(--text)]">{report.devRemaining}</span>
              </div>
              <div className={cell}>
                <span className="text-[var(--text-muted)]">In-flight</span>
                <span className="text-[var(--text)]">{report.inFlight}</span>
              </div>
              <div className={`${cell} border-t border-[var(--border-subtle)] pt-2`}>
                <span className="text-[var(--text-muted)]">Books / escrow</span>
                <span className="text-[var(--text)]">
                  {report.books} / {report.escrow}
                </span>
              </div>
              <div
                className="pixel-badge retro mt-1 self-start text-[8px] uppercase"
                style={{
                  color: report.ok ? "var(--neon-primary)" : "var(--neon-red)",
                  borderColor: report.ok ? "var(--neon-primary)" : "var(--neon-red)",
                }}
              >
                {report.ok ? "Balanced — drift 0" : `DRIFT ${report.drift}`}
              </div>
            </div>
          )}
        </div>
      </PixelPanel>

      <PixelPanel tone="text-[var(--neon-yellow)]" className="bg-[var(--bg-deep)]">
        <div className="flex flex-col gap-4 p-7">
          <h2 className="arcade-title text-lg font-semibold uppercase text-[var(--neon-yellow)]">
            Pay / withdraw
          </h2>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase text-[var(--text-faint)]">
              Recipient username
            </span>
            <Input
              value={recipient}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              placeholder="spicychef"
              onChange={(e) => setRecipient(e.target.value)}
              className="border-[var(--border-strong)] bg-[var(--bg)] font-mono text-[var(--text)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase text-[var(--text-faint)]">
              Amount{report ? ` (pool ${report.prizePool} · dev ${report.devRemaining})` : ""}
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={amount}
              placeholder="100"
              onChange={(e) => setAmount(e.target.value)}
              className="border-[var(--border-strong)] bg-[var(--bg)] font-mono text-[var(--text)]"
            />
          </label>

          <div className="flex gap-2">
            <PixelButton
              type="button"
              variant="solid"
              onClick={() => send("/api/onions/payout", "payout")}
              disabled={busy !== null}
              style={{ ["--pixel-edge"]: "var(--neon-yellow)" } as React.CSSProperties}
            >
              {busy === "payout" ? "Paying…" : "Pay prize"}
            </PixelButton>
            <PixelButton
              type="button"
              variant="outline"
              onClick={() => send("/api/onions/dev-withdraw", "dev")}
              disabled={busy !== null}
            >
              {busy === "dev" ? "Pulling…" : "Withdraw dev cut"}
            </PixelButton>
          </div>

          {error && (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words border border-[var(--neon-red)] bg-[var(--bg)] p-3 font-mono text-xs text-[var(--neon-red)]">
              {error}
            </pre>
          )}
          {result && (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words border border-[var(--border-strong)] bg-[var(--bg)] p-3 font-mono text-xs text-[var(--text)]">
              {result}
            </pre>
          )}
        </div>
      </PixelPanel>
    </main>
  );
}
