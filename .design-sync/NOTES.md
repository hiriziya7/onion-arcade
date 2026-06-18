# design-sync notes — Arcade Design System

Synced to claude.ai/design project `82487446-1297-4a6e-982b-d62f0fdf4b4b` ("Arcade Design System").
It is a **new** project created in the shared HARSH account; Harsh's existing "Praxa Design System" and
"Design System" projects were left untouched. Always re-sync to THIS projectId.

## This repo is a Next.js APP, not a published component library
- No `dist/`, no shipped `.d.ts`, no Storybook → the converter runs in **synth-entry mode**.
- Must pass `--entry ./.design-sync/ds-entry.mjs` (a hand-written barrel re-exporting the 8 UI files).
  Without `--entry`, PKG_DIR defaults to `node_modules/arcade` (doesn't exist) and the build dies with
  ENOENT on `node_modules/arcade/package.json`.
- `srcDir: components/ui` scopes discovery to the UI primitives. The app/economy components (PrizePool,
  CashOut, TopUp, GameShell, OnionIdGate, ShaderBackground…) and their native deps (`better-sqlite3`,
  `three`) are intentionally OUT of scope — do not widen `srcDir` or the barrel to include them.

## API contracts are hand-written (`cfg.dtsPropsFor`)
- Synth mode can't resolve the `@base-ui/react` + cva generic props, so auto-extracted props collapse to
  `{ [key: string]: unknown }`. The real `<Name>Props` come from `cfg.dtsPropsFor` for all 8 components.
- Re-sync risk: these drift if a component's props change upstream — re-check against source on changes.

## Styling = Tailwind v4 compiled to a static stylesheet
- `cfg.buildCmd` compiles `.design-sync/ds-tailwind.css` → `.design-sync/compiled.css` (= `cfg.cssEntry`).
  RUN IT before the converter (the converter does not run buildCmd itself).
- `ds-tailwind.css` imports the app's real `app/globals.css` + `.design-sync/ds-fonts.css`, scopes `@source`
  to `components/ui/**` + `previews/**`, and **safelists the DS vocabulary** via `@source inline(...)`.
  The safelist is REQUIRED: claude.ai/design ships only the static stylesheet (no Tailwind runtime), so any
  class the design agent reaches for must be force-emitted even when no synced component uses it.
- Re-sync risk: the safelist is hand-maintained. If conventions.md documents a new class, add it to the
  safelist too. `buildCmd` uses `npx @tailwindcss/cli@4` (network fetch) — pin/vendor if building offline.

## Fonts are remote ([FONT_REMOTE], expected — not a defect)
- Geist / Geist Mono / Orbitron load via a Google Fonts `@import` in `ds-fonts.css`, which also defines
  `--font-sans` / `--font-geist-mono` / `--font-display` (next/font sets these at runtime in the app;
  the standalone bundle can't).

## Previews must establish the dark surface
- The palette is neon-on-near-black but the render harness page is white. Every preview wraps content in a
  `dark` + `background: var(--bg)` Surface.
- Overlays (Dialog, Sheet): `cfg.overrides` → `cardMode: single` + viewport; authored with
  `defaultOpen modal={false}`, and each injects `<style>html,body{background:var(--bg)}</style>` so the
  portaled backdrop reads over near-black instead of the white harness body.

## Known render warns (triaged, non-blocking)
- `[RENDER_THIN]` on **Dialog** and **Sheet**: the open overlay sits on a tall dark card with intentional
  empty space, so the content-height heuristic flags it. Visually verified correct — expected, not new.

## Possible polish (not done)
- Groups are `general` (6) and `8bit` (2), derived from the src path. Nicer grouping (Primitives/Overlays/
  Surfaces/8bit) would need `docsMap` category stubs, which sacrifice the synthesized prompt.md — skipped.
- `tokens/` ships empty (tokens are inlined in compiled.css). Fine, but there are no token-reference cards.
