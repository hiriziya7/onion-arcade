import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
} from "arcade";

const rows = [
  ["1", "ORC_DEV_99", "18,920"],
  ["2", "pixelqueen", "16,400"],
  ["3", "you", "12,480"],
  ["4", "nightowl", "9,210"],
];

// Overlay component: rendered open inside a single full-card so the side panel is
// captured. modal={false} avoids scroll-locking the harness.
export function Leaderboard() {
  return (
    <div
      className="dark"
      style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100%", position: "relative" }}
    >
      <style>{`html,body{background:var(--bg);margin:0}`}</style>
      <Sheet defaultOpen modal={false}>
        <SheetContent side="right" showCloseButton>
          <SheetHeader>
            <SheetTitle>Leaderboard</SheetTitle>
            <SheetDescription>Top players this round.</SheetDescription>
          </SheetHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 1rem" }}>
            {rows.map(([rank, name, score]) => (
              <div
                key={rank}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid var(--border-subtle)",
                  color: name === "you" ? "var(--neon-primary)" : "var(--text)",
                  fontSize: 14,
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>{rank}</span>
                <span style={{ flex: 1, marginLeft: 12 }}>{name}</span>
                <span>{score}</span>
              </div>
            ))}
          </div>
          <SheetFooter>
            <Button variant="outline">Close</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
