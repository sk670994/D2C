"use client";

import type { GlobalAdRecord } from "@/lib/ad-intelligence/global/types";
import styles from "./AdSpyPremium.module.css";

function formatDate(value?: string | null): string { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

export function AdCreativeCard({ ad, onOpen }: { ad: GlobalAdRecord; onOpen: (ad: GlobalAdRecord) => void }) {
  const media = ad.videoUrl || ad.imageUrl || ad.thumbnailUrl;
  const running = ad.runningDays ? `${ad.runningDays}d` : "—";
  const marketCount = ad.markets?.length ?? 0;
  const languageCount = ad.languages?.length ?? 0;
  const copy = (ad.primaryText || ad.description || "").trim();

  return (
    <article className={styles.card}>
      <button type="button" className={styles.mediaButton} onClick={() => onOpen(ad)} aria-label={`Open ${ad.headline || ad.advertiserName} details`}>
        <div className={styles.mediaFrame}>
          {media ? <img src={media} alt={ad.headline || ad.advertiserName} loading="lazy" /> : <div className={styles.mediaFallback}>No creative preview</div>}
          <div className={styles.mediaBadges}><span className={ad.isActive ? styles.badgeActive : styles.badgeMuted}>{ad.isActive ? "ACTIVE" : "INACTIVE"}</span><span className={styles.badge}>{(ad.creativeType ?? "unknown").toUpperCase()}</span></div>
          {ad.videoUrl ? <span className={styles.videoMark}>▶</span> : null}
        </div>
      </button>

      <div className={styles.cardBody}>
        <div className={styles.advertiserLine}><span>{ad.advertiserName}</span>{ad.partnershipType && ad.partnershipType !== "direct" ? <span className={styles.creatorBadge}>{ad.partnershipType.replace("_", " ")}</span> : null}</div>
        <h3 className={styles.cardTitle}>{ad.headline || ad.productName || "Untitled creative"}</h3>
        <p className={styles.cardCopy}>{copy || "No primary copy captured from the source."}</p>

        <div className={styles.metaGrid}>
          <div><span>RUNNING</span><strong>{running}</strong></div>
          <div><span>FIRST SEEN</span><strong>{formatDate(ad.firstSeen)}</strong></div>
          <div><span>CTA</span><strong>{ad.callToAction || "—"}</strong></div>
          <div><span>OFFER</span><strong>{ad.offer || "—"}</strong></div>
        </div>

        <div className={styles.chipRow}>
          <span className={styles.chip}>{ad.publisherPlatforms?.length ? ad.publisherPlatforms.slice(0, 2).join(" · ") : "Meta"}</span>
          <span className={styles.chip}>{marketCount ? `${marketCount} market${marketCount === 1 ? "" : "s"}` : "Market data unavailable"}</span>
          <span className={styles.chip}>{languageCount ? `${languageCount} language${languageCount === 1 ? "" : "s"}` : "Language pending"}</span>
        </div>

        <div className={styles.cardActions}><button type="button" className={styles.secondaryButton} onClick={() => onOpen(ad)}>View details</button>{ad.landingPage ? <a className={styles.primaryLink} href={ad.landingPage} target="_blank" rel="noreferrer">Landing page</a> : null}{ad.sourceUrl ? <a className={styles.textLink} href={ad.sourceUrl} target="_blank" rel="noreferrer">Ad Library</a> : null}</div>
      </div>
    </article>
  );
}
