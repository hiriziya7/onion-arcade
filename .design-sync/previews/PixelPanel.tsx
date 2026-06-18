import { PixelPanel } from "arcade";

function Surface({ children }) {
  return (
    <div
      className="dark"
      style={{
        background: "var(--bg)",
        color: "var(--text)",
        padding: "2.5rem",
        display: "flex",
        flexWrap: "wrap",
        gap: "2rem",
        alignItems: "flex-start",
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

const cap = {
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

export function Default() {
  return (
    <Surface>
      <PixelPanel className="retro" contentClassName="p-4" style={{ width: 220 }}>
        <div style={cap}>Score</div>
        <div style={{ fontSize: 24, color: "var(--text)" }}>12,480</div>
      </PixelPanel>
    </Surface>
  );
}

export function Tinted() {
  return (
    <Surface>
      <PixelPanel
        tone="text-[var(--neon-primary)]"
        className="retro"
        contentClassName="p-4"
        style={{ width: 220 }}
      >
        <div style={cap}>Prize pool</div>
        <div style={{ fontSize: 24, color: "var(--neon-primary)" }}>320 🧅</div>
      </PixelPanel>
      <PixelPanel
        tone="text-[var(--neon-accent)]"
        dashed
        className="retro"
        contentClassName="p-4"
        style={{ width: 220 }}
      >
        <div style={cap}>Next payout</div>
        <div style={{ fontSize: 24, color: "var(--neon-accent)" }}>04:12</div>
      </PixelPanel>
    </Surface>
  );
}
