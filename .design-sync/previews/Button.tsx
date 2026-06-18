import { Button } from "arcade";

// Dark arcade surface — the palette is neon-on-near-black, so every preview must
// establish the dark context (mirrors the app's <html class="dark"> + --bg page).
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
        gap: "0.75rem",
        alignItems: "center",
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

export function Variants() {
  return (
    <Surface>
      <Button variant="default">Play</Button>
      <Button variant="secondary">Leaderboard</Button>
      <Button variant="outline">Settings</Button>
      <Button variant="ghost">Skip</Button>
      <Button variant="destructive">Forfeit</Button>
      <Button variant="link">View rules</Button>
    </Surface>
  );
}

export function Sizes() {
  return (
    <Surface>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button disabled>Disabled</Button>
    </Surface>
  );
}
