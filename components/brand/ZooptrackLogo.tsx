/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

/**
 * The official Zooptrack wordmark (blue #0255B1, magnifier "o").
 * One component for every page so size, colour and spacing never drift.
 *   tone "auto"  - blue, white in dark mode (default)
 *   tone "blue"  - always blue (light-only pages, emails on white)
 *   tone "white" - always white (dark panels)
 * Source files: public/brand/zooptrack-logo.png, zooptrack-logo-white.png (629x179).
 */
export const LOGO_RATIO = 629 / 179;
export const BRAND_BLUE = "#0255B1";

type Tone = "auto" | "blue" | "white";

export function ZooptrackLogo({
  height = 28,
  tone = "auto",
  href,
  className,
  priority = false,
}: {
  height?: number;
  tone?: Tone;
  href?: string;
  className?: string;
  priority?: boolean;
}) {
  const width = Math.round(height * LOGO_RATIO);
  const common = { width, height, alt: "Zooptrack", decoding: "async" as const, fetchPriority: priority ? ("high" as const) : undefined, style: { height, width: "auto", display: "block" } };
  const mark = (
    <span className={`zt-logo zt-logo-${tone}${className ? ` ${className}` : ""}`} style={{ height }}>
      {tone !== "white" ? <img src="/brand/zooptrack-logo.png" className="zt-logo-blue" {...common} /> : null}
      {tone !== "blue" ? <img src="/brand/zooptrack-logo-white.png" className="zt-logo-white" {...common} alt={tone === "white" ? "Zooptrack" : ""} aria-hidden={tone === "auto" ? true : undefined} /> : null}
    </span>
  );
  return href ? (
    <Link href={href} className="zt-logo-link" aria-label="Zooptrack home">
      {mark}
    </Link>
  ) : (
    mark
  );
}
