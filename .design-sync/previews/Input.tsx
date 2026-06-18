import { Input } from "arcade";

function Surface({ children }) {
  return (
    <div
      className="dark"
      style={{
        background: "var(--bg)",
        color: "var(--text)",
        padding: "2rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        minHeight: "100%",
        maxWidth: 340,
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

export function States() {
  return (
    <Surface>
      <Input placeholder="Choose your arcade tag…" />
      <Input defaultValue="ORC_DEV_99" />
      <Input type="number" placeholder="Bet amount (🧅)" />
      <Input placeholder="Locked" disabled />
    </Surface>
  );
}
