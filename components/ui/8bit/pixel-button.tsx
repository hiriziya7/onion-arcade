import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * PixelButton — chunky OrcDev 8-bit button: flat fill, a HARD offset pixel
 * shadow (no blur), sharp corners, and a tactile press that drops the control
 * down/right onto its shadow (`active:translate` + shadow collapse).
 *
 * The accent is driven by `--pixel-edge` (defaults to the foreground text), so
 * a parent can tint a button neon by setting that variable, e.g.
 * `style={{ "--pixel-edge": "var(--neon-primary)" }}`.
 *
 * Variants (API preserved):
 *   solid   — filled neon face, dark text, full pixel frame + drop shadow
 *   outline — transparent face, neon pixel frame + drop shadow
 *   ghost   — no frame/shadow, just retro text (tertiary / inline)
 */
function PixelButton({
  className,
  children,
  variant = "solid",
  ...props
}: React.ComponentProps<"button"> & {
  variant?: "solid" | "outline" | "ghost";
}) {
  const framed = variant !== "ghost";
  return (
    <button
      data-slot="pixel-button"
      className={cn(
        "retro relative inline-flex select-none items-center justify-center gap-2 rounded-none px-4 py-2 text-xs uppercase",
        "transition-[transform,box-shadow,background-color,color] duration-[120ms] ease-[var(--ease)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pixel-edge,var(--text))] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-deep)]",
        "disabled:pointer-events-none disabled:opacity-40",
        // Framed variants share the chunky border + hard drop shadow + press.
        framed && [
          "border-[3px] border-[var(--pixel-edge,var(--text))]",
          "shadow-[4px_4px_0_0_#000] hover:shadow-[6px_6px_0_0_#000]",
          "active:translate-x-[4px] active:translate-y-[4px] active:shadow-[0px_0px_0_0_#000]",
          "disabled:shadow-[4px_4px_0_0_#000] disabled:active:translate-x-0 disabled:active:translate-y-0",
        ],
        variant === "solid" &&
          "bg-[var(--pixel-edge,var(--text))] text-[var(--bg)]",
        variant === "outline" &&
          "bg-transparent text-[var(--pixel-edge,var(--text))] hover:bg-[var(--surface)]",
        variant === "ghost" &&
          "bg-transparent text-[var(--text)] hover:text-[var(--neon-primary)]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export { PixelButton };
