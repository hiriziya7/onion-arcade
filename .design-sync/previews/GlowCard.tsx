import { GlowCard } from "arcade";

function Surface({ children }) {
  return (
    <div
      className="dark"
      style={{
        background: "var(--bg)",
        color: "var(--text)",
        padding: "2rem",
        display: "flex",
        flexWrap: "wrap",
        gap: "1.5rem",
        alignItems: "flex-start",
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

const label = {
  alignSelf: "start",
  fontSize: 12,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

export function Cards() {
  return (
    <Surface>
      <GlowCard glowColor="green" size="sm">
        <div style={label}>Neon Drop</div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)" }}>12,480</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>your best</div>
        </div>
      </GlowCard>
      <GlowCard glowColor="purple" size="sm">
        <div style={label}>Light Cycle</div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)" }}>#3</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>global rank</div>
        </div>
      </GlowCard>
    </Surface>
  );
}
