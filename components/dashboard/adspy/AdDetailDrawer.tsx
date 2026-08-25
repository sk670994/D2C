"use client";

import type { GlobalAdRecord } from "@/lib/ad-intelligence/global/types";
import styles from "./AdSpyPremium.module.css";

function formatDate(value?: string | null): string { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
function provenanceLabel(value: string | undefined): string { if (value === "provider") return "Source"; if (value === "heuristic") return "Heuristic"; if (value === "derived") return "Derived"; return "Unavailable"; }

export function AdDetailDrawer({ ad, onClose }: { ad: GlobalAdRecord | null; onClose: () => void }) {
  if (!ad) return null;
  const provenance = ad.dataProvenance ?? {};
  return (
    <div className={styles.drawerBackdrop} onMouseDown={onClose}>
      <aside className={styles.drawer} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.drawerHeader}><div><p className={styles.kicker}>CREATIVE DETAIL</p><h2>{ad.headline || ad.productName || "Untitled creative"}</h2><p>{ad.advertiserName}</p></div><button className={styles.closeButton} onClick={onClose} aria-label="Close">×</button></div>
        <div className={styles.drawerScroll}>
          <div className={styles.drawerMedia}>{ad.videoUrl || ad.imageUrl || ad.thumbnailUrl ? <img src={ad.videoUrl || ad.imageUrl || ad.thumbnailUrl || ""} alt={ad.headline || ad.advertiserName} /> : <div className={styles.mediaFallback}>No creative preview</div>}</div>
          <section className={styles.detailSection}><h3>Copy</h3><div className={styles.detailGrid}><div><span>Headline</span><strong>{ad.headline || "—"}</strong></div><div><span>CTA</span><strong>{ad.callToAction || "—"}</strong></div><div className={styles.detailWide}><span>Primary text</span><p>{ad.primaryText || "—"}</p></div><div className={styles.detailWide}><span>Description</span><p>{ad.description || "—"}</p></div></div></section>
          <section className={styles.detailSection}><h3>Timeline</h3><div className={styles.detailGrid}><div><span>First seen</span><strong>{formatDate(ad.firstSeen)}</strong></div><div><span>Last seen</span><strong>{formatDate(ad.lastSeen)}</strong></div><div><span>Running</span><strong>{ad.runningDays ? `${ad.runningDays} days` : "—"}</strong></div><div><span>Status</span><strong>{ad.isActive ? "Active" : "Inactive"}</strong></div></div></section>
          <section className={styles.detailSection}><h3>Commerce & delivery</h3><div className={styles.detailGrid}><div><span>Product</span><strong>{ad.productName || "—"}</strong></div><div><span>Offer</span><strong>{ad.offer || "—"}</strong></div><div><span>Price</span><strong>{ad.productPrice != null ? `${ad.currency ?? ""} ${ad.productPrice}`.trim() : "—"}</strong></div><div><span>Partnership</span><strong>{ad.partnershipType || "—"}</strong></div><div><span>Creator</span><strong>{ad.creatorName || "—"}</strong></div><div><span>Platforms</span><strong>{ad.publisherPlatforms?.join(", ") || "—"}</strong></div></div></section>
          <section className={styles.detailSection}><h3>Markets & languages</h3><div className={styles.detailChipWrap}>{(ad.markets ?? []).map((market, index) => <span key={`m-${index}`} className={styles.detailChip}>{[market.cityName, market.stateName, market.countryName || market.countryCode].filter(Boolean).join(", ")}</span>)}{(ad.languages ?? []).map((language, index) => <span key={`l-${index}`} className={styles.detailChip}>{language.name}</span>)}{!ad.markets?.length && !ad.languages?.length ? <span className={styles.emptySmall}>No source-observed market/language detail yet.</span> : null}</div></section>
          <section className={styles.detailSection}><h3>Data provenance</h3><div className={styles.detailGrid}>{["advertiser", "creative", "firstSeen", "lastSeen", "market", "language", "runningDays"].map((field) => <div key={field}><span>{field}</span><strong>{provenanceLabel(provenance[field])}</strong></div>)}</div><p className={styles.provenanceNote}>Zooptrack never represents an estimated or derived signal as platform performance data.</p></section>
          <section className={styles.detailSection}><h3>Source</h3><div className={styles.cardActions}>{ad.landingPage ? <a className={styles.primaryLink} href={ad.landingPage} target="_blank" rel="noreferrer">Open landing page</a> : null}{ad.sourceUrl ? <a className={styles.secondaryLink} href={ad.sourceUrl} target="_blank" rel="noreferrer">Open ad library</a> : null}</div></section>
        </div>
      </aside>
    </div>
  );
}
