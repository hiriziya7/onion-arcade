import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * PixelPanel — the 8-bit frame used for every card / panel in the arcade.
 *
 * Built the authentic 8bitcn way: top+bottom thick (6px) borders on the
 * element, plus an overlaid left+right border pushed out 6px (`-mx-1.5`).
 * Because the two pairs never meet, the corners read as notched squares — the
 * signature pixel frame. Corners are always sharp (`rounded-none`).
 *
 * Border color is `currentColor`, so a parent can tint the whole frame neon by
 * passing `tone="text-[var(--neon-…)]"`; the content keeps its own text color.
 */
function PixelPanel({
  className,
  children,
  tone,
  ...props
}: React.ComponentProps<"div"> & {
  /** Border color utility, e.g. "text-[var(--neon-primary)]". */
  tone?: string;
}) {
  return (
    <div
      data-slot="pixel-panel"
      className={cn(
        "relative rounded-none border-y-[6px] border-current bg-[var(--surface)]",
        tone ?? "text-[var(--border-strong)]",
        className
      )}
      {...props}
    >
      <div className="relative z-10 text-[var(--text)]">{children}</div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 -mx-1.5 border-x-[6px] border-inherit"
      />
    </div>
  );
}

export { PixelPanel };
