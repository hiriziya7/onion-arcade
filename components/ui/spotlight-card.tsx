"use client";

import React, { useCallback, useRef, ReactNode } from "react";

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: "blue" | "purple" | "green" | "red" | "orange";
  size?: "sm" | "md" | "lg";
  width?: string | number;
  height?: string | number;
  customSize?: boolean; // When true, ignores size prop and uses width/height or className
}

// Per-color hue. Saturation/lightness are fixed so the neon edge reads the same
// hue all the way around a card's perimeter (no per-corner color drift).
const glowColorMap = {
  blue: 220,
  purple: 280,
  green: 140,
  red: 0,
  orange: 30,
};

const sizeMap = {
  sm: "w-48 h-64",
  md: "w-64 h-80",
  lg: "w-80 h-96",
};

// The cursor spotlight lives in an absolutely-positioned overlay clipped to
// the card's rounded box. It is a radial highlight that follows --spot-x/y
// within THIS card and is gated by --active, so at rest the card shows only
// the even box-shadow border and nothing else. Static, so it lives at module
// scope rather than being rebuilt on every render.
const spotlightStyles = `
  [data-glow] > [data-glow-spot] {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    opacity: var(--active, 0);
    transition: opacity 240ms cubic-bezier(0.22, 1, 0.36, 1);
    background: radial-gradient(
      220px 220px at var(--spot-x, 50%) var(--spot-y, 50%),
      hsl(var(--hue) var(--sat) calc(var(--light) + 6%) / 0.16),
      transparent 70%
    );
  }
`;

const GlowCard: React.FC<GlowCardProps> = ({
  children,
  className = "",
  glowColor = "blue",
  size = "md",
  width,
  height,
  customSize = false,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  // Card-relative spotlight: the position is computed from THIS card's own box,
  // so every card has an independent, non-shared light source. No document-level
  // listener, no viewport-fixed background.
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--spot-x", `${x.toFixed(2)}%`);
      el.style.setProperty("--spot-y", `${y.toFixed(2)}%`);
      el.style.setProperty("--active", "1");
    },
    []
  );

  // On leave, return to a clean even rest state: spotlight recentres and dims.
  const handlePointerLeave = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--spot-x", "50%");
    el.style.setProperty("--spot-y", "50%");
    el.style.setProperty("--active", "0");
  }, []);

  const hue = glowColorMap[glowColor];

  const getSizeClasses = () => {
    if (customSize) {
      return ""; // Let className or inline styles handle sizing
    }
    return sizeMap[size];
  };

  const getInlineStyles = (): React.CSSProperties &
    Record<string, string | number> => {
    const baseStyles: React.CSSProperties & Record<string, string | number> = {
      "--hue": hue,
      "--sat": "90%",
      "--light": "68%",
      "--radius": "16px",
      // Spotlight rest position is the card center.
      "--spot-x": "50%",
      "--spot-y": "50%",
      "--active": "0",
      // Neon edge color, reused for the border ring and the bloom.
      "--edge": "hsl(var(--hue) var(--sat) var(--light))",
      position: "relative",
      borderRadius: "var(--radius)",
      backgroundColor: "var(--backdrop, hsl(0 0% 60% / 0.06))",
      /* The neon border is a 1px ring drawn with box-shadow, NOT a masked
         gradient. box-shadow traces the full rounded rectangle perfectly
         evenly, so the color is uniform along every edge and corner — there is
         no gradient stop to pool at the corners. A second, larger and softer
         outer shadow provides a subtle ambient bloom that lifts on hover. */
      boxShadow: `
        inset 0 0 0 1px hsl(var(--hue) var(--sat) var(--light) / calc(0.5 + var(--active) * 0.35)),
        0 0 calc(8px + var(--active) * 10px) hsl(var(--hue) var(--sat) var(--light) / calc(0.14 + var(--active) * 0.22))
      `,
      transition:
        "box-shadow 240ms cubic-bezier(0.22,1,0.36,1), transform 240ms cubic-bezier(0.22,1,0.36,1)",
      touchAction: "none",
    };

    if (width !== undefined) {
      baseStyles.width = typeof width === "number" ? `${width}px` : width;
    }
    if (height !== undefined) {
      baseStyles.height = typeof height === "number" ? `${height}px` : height;
    }

    return baseStyles;
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: spotlightStyles }} />
      <div
        ref={cardRef}
        data-glow
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={getInlineStyles()}
        className={`
          ${getSizeClasses()}
          ${!customSize ? "aspect-[3/4]" : ""}
          rounded-2xl
          relative
          grid
          grid-rows-[1fr_auto]
          p-4
          gap-4
          backdrop-blur-[5px]
          ${className}
        `}
      >
        <div data-glow-spot aria-hidden="true" />
        {children}
      </div>
    </>
  );
};

export { GlowCard };
