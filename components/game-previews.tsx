"use client";

/**
 * Quiet, minimal animated marks shown inside the dashboard cards. One calm
 * element per game — just enough to hint at the feel. Keyframes live in
 * globals.css. Rendered pixel-art: sharp edges, blocky fills, no blur.
 */

function PreviewFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="scanlines relative flex h-full min-h-[180px] w-full items-center justify-center overflow-hidden rounded-none bg-[var(--bg-deep)] p-8">
      {children}
    </div>
  );
}

export function SevenPreview() {
  return (
    <PreviewFrame>
      <span
        aria-hidden="true"
        className="pixelated gpu-motion retro neon-text-subtle text-5xl leading-none text-[var(--text-muted)] transition-[color] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[var(--neon-primary)]"
        style={{ animation: "seven-bob 3.6s steps(4, end) infinite" }}
      >
        7
      </span>
    </PreviewFrame>
  );
}

export function OnionChopPreview() {
  return (
    <PreviewFrame>
      <div className="relative flex h-5 w-44 items-center border-y-[3px] border-[var(--surface-elevated)] bg-[var(--bg-deep)]">
        {/* Center target band — lights up green (the PERFECT zone) on hover */}
        <span
          aria-hidden="true"
          className="pixelated absolute left-1/2 h-full w-2 -translate-x-1/2 bg-[var(--surface-elevated)] transition-[background-color] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:bg-[var(--neon-primary)]"
        />
        {/* Sweeping knife marker — smooth, continuous horizontal sweep */}
        <span
          aria-hidden="true"
          className="pixelated gpu-motion absolute left-1/2 h-7 w-1.5 bg-[var(--text-muted)] transition-[background-color] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:bg-[var(--neon-yellow)]"
          style={{ animation: "chop-sweep 1.4s ease-in-out infinite alternate" }}
        />
      </div>
    </PreviewFrame>
  );
}

export function LightsOutPreview() {
  return (
    <PreviewFrame>
      <div className="flex items-center gap-4 border-y-[3px] border-[var(--surface-elevated)] bg-[var(--bg-deep)] px-4 py-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={
              "pixelated gpu-motion h-4 w-4 rounded-none bg-[var(--surface-elevated)] transition-[background-color,box-shadow] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] " +
              (i % 2 === 0
                ? "group-hover:bg-[var(--neon-red)] group-hover:shadow-[0_0_8px_var(--neon-red)]"
                : "group-hover:bg-[var(--text-muted)]")
            }
            style={{ transitionDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
    </PreviewFrame>
  );
}
