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
 *
 * Optional `dashed` switches the frame to the OrcDev dashed pixel rule for a
 * lighter, draft-y panel — purely visual, the notched geometry is unchanged.
 */
function PixelPanel({
  className,
  contentClassName,
  children,
  tone,
  dashed = false,
  ...props
}: React.ComponentProps<"div"> & {
  /** Border color utility, e.g. "text-[var(--neon-primary)]". */
  tone?: string;
  /** Use a dashed pixel frame instead of the solid one. */
  dashed?: boolean;
  /**
   * Extra classes on the INNER content wrapper. The panel's flex/sizing classes
   * (`className`) land on the outer element, so when a panel is used as a flex /
   * full-bleed container (e.g. the game cabinet) the inner wrapper must be told
   * to fill — pass e.g. "flex flex-1" so children can stretch instead of
   * collapsing to content width.
   */
  contentClassName?: string;
}) {
  return (
    <div
      data-slot="pixel-panel"
      className={cn(
        "relative rounded-none border-y-[6px] border-current bg-[var(--surface)]",
        dashed && "border-dashed",
        tone ?? "text-[var(--border-strong)]",
        className
      )}
      {...props}
    >
      <div className={cn("relative z-10 text-[var(--text)]", contentClassName)}>
        {children}
      </div>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 z-0 -mx-1.5 border-x-[6px] border-inherit",
          dashed && "border-dashed"
        )}
      />
    </div>
  );
}

export { PixelPanel };
