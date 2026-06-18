/* design-sync bundle entry — re-exports the arcade UI primitives so the
   converter bundles them into window.ArcadeDS. There is no published dist; this
   barrel is the synthetic entry (kept here, not in the app). esbuild follows
   these into the real .tsx sources, resolving @/ via tsconfig.json. */
export * from "../components/ui/button.tsx";
export * from "../components/ui/card.tsx";
export * from "../components/ui/dialog.tsx";
export * from "../components/ui/input.tsx";
export * from "../components/ui/sheet.tsx";
export * from "../components/ui/spotlight-card.tsx";
export * from "../components/ui/8bit/pixel-button.tsx";
export * from "../components/ui/8bit/pixel-panel.tsx";
