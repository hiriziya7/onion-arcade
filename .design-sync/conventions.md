## Arcade design system — how to build with it

A **dark, neon, 8-bit arcade** UI: a near-black canvas, a few neon accents, and sharp (zero-radius) pixel frames. The components are real shadcn-style React built on `@base-ui/react`, styled with **Tailwind v4 utilities + CSS custom-property tokens**. There is **no theme provider** — every token is a global `:root` variable shipped in `styles.css`, so just render the components.

### Setup / wrapping
- The palette is **neon-on-near-black and is the default** (there is no light theme). Put page/app roots on the dark canvas: `dark` class on a top wrapper plus `bg-background` (= `var(--bg)`, near-black) and light `text-foreground`. The real app uses `<html class="dark">` with `body` `bg-background text-foreground`.
- Corners are **sharp everywhere** — `--radius` is `0`. Don't add rounded corners; the pixel frame is the identity. The two 8-bit pieces draw their own chunky frames.
- Fonts: body copy is `font-sans` (Geist). Short "retro" text — titles, labels, nav, buttons, stats — uses the **`retro`** utility (Orbitron pixel display face). Long paragraphs stay `font-sans`.

### Styling idiom — Tailwind utilities + tokens (never invent colors)
- Semantic color utilities: `bg-primary` (mint-green accent) / `text-primary-foreground`, `bg-card` / `text-card-foreground`, `bg-popover`, `bg-secondary`, `bg-muted` / `text-muted-foreground`, `bg-background` / `text-foreground`, `border-border`, `ring-ring`, `text-destructive`.
- Raw neon vars for a specific hue: `var(--neon-primary)` (green), `var(--neon-accent)` (magenta), `var(--neon-cyan)`, `var(--neon-magenta)`, `var(--neon-yellow)`, `var(--neon-red)`. Surfaces: `var(--bg)`, `var(--bg-deep)`, `var(--surface)`, `var(--surface-elevated)`. Text: `var(--text)`, `var(--text-muted)`, `var(--text-faint)`. Borders: `var(--border-subtle)`, `var(--border-strong)`. Currency accent: `var(--onion)`.
- Arcade utility classes (neon is an accent — use the smallest that reads): `retro`, `arcade-title`, `neon-text` / `neon-text-subtle` / `neon-text-xs` (text glow), `pixel-shadow` (hard 8-bit drop shadow), `scanlines` (CRT overlay), `glass` (translucent blur), `pixel-badge`, `pixel-divider`, `pixelated`, `animate-fade-in` / `animate-rise-in` / `animate-scale-in`, `cursor-blink`.

### Where the truth lives
Read `styles.css` (it `@import`s the compiled tokens + utilities) before styling, and each component's `<Name>.d.ts` + `<Name>.prompt.md` for its API. The 8-bit pieces are tinted by setting `--pixel-edge` (PixelButton) or the `tone` prop (PixelPanel) to a neon var. Overlays (`Dialog`, `Sheet`) compose as `Root → Trigger → Content` with their `*Header/*Title/*Footer` parts.

### Idiomatic example
```tsx
<div className="dark min-h-screen bg-background text-foreground p-6">
  <Card className="w-80">
    <CardHeader>
      <CardTitle>Neon Drop</CardTitle>
      <CardDescription>Top score takes the pot.</CardDescription>
    </CardHeader>
    <CardContent className="text-muted-foreground">Best 12,480</CardContent>
    <CardFooter><Button>Play · 5 🧅</Button></CardFooter>
  </Card>
  <PixelButton variant="solid" style={{ "--pixel-edge": "var(--neon-primary)" }}>
    INSERT COIN
  </PixelButton>
</div>
```
