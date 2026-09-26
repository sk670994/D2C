import Link from "next/link";
import type { CSSProperties } from "react";

import type { EvidenceAd, Move } from "@/lib/today/insights";

export function safeImage(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://www.zooptrack.co.in");
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function formatInt(value: number): string {
  return new Intl.NumberFormat("en-IN").format(Math.round(value));
}

/** One ad as evidence: the real thumbnail when stored, else the hook on a tone. */
export function EvidenceTile({ ad, index, brand, pageId }: { ad: EvidenceAd; index: number; brand: string; pageId: string }) {
  const image = safeImage(ad.thumbnailUrl);
  const style: CSSProperties | undefined = image ? { backgroundImage: `url("${image.replace(/"/g, "%22")}")` } : undefined;
  const href = `/adspy?q=${encodeURIComponent(brand)}&pid=${encodeURIComponent(pageId)}`;
  return (
    <Link href={href} className={`zd-tile tone-${(index % 4) + 1}`} style={style} aria-label={`${ad.format} ad by ${brand}: ${ad.hook ?? "no copy captured"}`}>
      <span className="zd-tile-meta">
        {ad.format} · {ad.active ? `${ad.days}d live` : `ran ${ad.days}d`}
      </span>
      <span className="zd-tile-hook">{ad.hook ?? "No copy captured"}</span>
    </Link>
  );
}

export function MovePill({ kind, label }: { kind: Move["kind"]; label: string }) {
  return <span className={`zd-pill zd-pill-${kind}`}>{label}</span>;
}

export function Initial({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span className={`zd-avatar${large ? " zd-avatar-lg" : ""}`} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
