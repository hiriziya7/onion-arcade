import { PixelButton } from "arcade";

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
        gap: "1.25rem",
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
      <PixelButton variant="solid">START</PixelButton>
      <PixelButton variant="outline">OPTIONS</PixelButton>
      <PixelButton variant="ghost">EXIT</PixelButton>
    </Surface>
  );
}

export function NeonTint() {
  return (
    <Surface>
      <PixelButton variant="solid" style={{ "--pixel-edge": "var(--neon-primary)" }}>
        INSERT COIN
      </PixelButton>
      <PixelButton variant="outline" style={{ "--pixel-edge": "var(--neon-accent)" }}>
        HIGH SCORES
      </PixelButton>
      <PixelButton variant="outline" style={{ "--pixel-edge": "var(--neon-cyan)" }}>
        CONTINUE
      </PixelButton>
    </Surface>
  );
}
