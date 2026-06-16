import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * PixelButton — native button with the 8bitcn pixel border and press feel.
 *
 * The border is drawn from solid span bars (corner squares + offset edges)
 * plus a translucent inner shadow strip that gives the 3-D pressed look. On
 * press the whole control drops 4px (`active:translate-y-1`). Edge color is
 * driven by `--pixel-edge` (defaults to the foreground text), so a parent can
 * tint a button neon by setting that variable.
 *
 * Variants:
 *   solid   — filled face, full pixel frame + shadow (primary actions)
 *   outline — transparent face, pixel frame only (secondary actions)
 *   ghost   — no frame, just retro text (tertiary / inline)
 */
const EDGE = "bg-[var(--pixel-edge,var(--text))]";

function PixelBorder({ withShadow }: { withShadow: boolean }) {
  return (
    <span aria-hidden="true">
      {/* Edges — split into halves, offset 6px from each corner. */}
      <span className={cn("absolute -top-1.5 left-1.5 h-1.5 w-1/2", EDGE)} />
      <span className={cn("absolute -top-1.5 right-1.5 h-1.5 w-1/2", EDGE)} />
      <span className={cn("absolute -bottom-1.5 left-1.5 h-1.5 w-1/2", EDGE)} />
      <span className={cn("absolute -bottom-1.5 right-1.5 h-1.5 w-1/2", EDGE)} />
      {/* Corner squares. */}
      <span className={cn("absolute top-0 left-0 size-1.5", EDGE)} />
      <span className={cn("absolute top-0 right-0 size-1.5", EDGE)} />
      <span className={cn("absolute bottom-0 left-0 size-1.5", EDGE)} />
      <span className={cn("absolute bottom-0 right-0 size-1.5", EDGE)} />
      {/* Vertical sides, inset 6px top/bottom. */}
      <span className={cn("absolute top-1.5 -left-1.5 h-[calc(100%-12px)] w-1.5", EDGE)} />
      <span className={cn("absolute top-1.5 -right-1.5 h-[calc(100%-12px)] w-1.5", EDGE)} />
      {withShadow && (
        <>
          <span className="absolute top-0 left-0 h-1.5 w-full bg-[var(--text)]/20" />
          <span className="absolute top-1.5 left-0 h-1.5 w-3 bg-[var(--text)]/20" />
          <span className="absolute bottom-0 left-0 h-1.5 w-full bg-[var(--text)]/20" />
          <span className="absolute bottom-1.5 right-0 h-1.5 w-3 bg-[var(--text)]/20" />
        </>
      )}
    </span>
  );
}

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
        "transition-transform duration-[120ms] ease-[var(--ease)] active:translate-y-1",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pixel-edge,var(--text))] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-deep)]",
        "disabled:pointer-events-none disabled:opacity-40",
        variant === "solid" && "bg-[var(--text)] text-[var(--bg)]",
        variant === "outline" && "bg-transparent text-[var(--text)]",
        variant === "ghost" &&
          "bg-transparent text-[var(--text)] hover:text-[var(--neon-primary)]",
        className
      )}
      {...props}
    >
      {children}
      {framed && <PixelBorder withShadow={variant === "solid"} />}
    </button>
  );
}

export { PixelButton };
