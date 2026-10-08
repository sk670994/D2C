import Link from "next/link";

import { fmt, type BrandStat, type LongAd } from "@/lib/seo/market";

import t from "./Themes.module.css";

/** Horizontal share bars (values are percentages). */
export function Bars({ rows }: { rows: Array<{ label: string; value: number }> }) {
  return (
    <div className={t.bars}>
      {rows.map((r) => (
        <div className={t.barRow} key={r.label}>
          <span>{r.label}</span>
          <span className={t.barTrack} aria-hidden="true">
            <span className={t.barFill} style={{ width: `${Math.max(2, Math.min(100, r.value))}%` }} />
          </span>
          <span className={t.barVal}>{r.value}%</span>
        </div>
      ))}
    </div>
  );
}

const videoShare = (s: BrandStat) => Math.round((s.video / Math.max(1, s.video + s.image + s.carousel)) * 100);

export function BrandTable({ stats, limit }: { stats: BrandStat[]; limit?: number }) {
  const rows = limit ? stats.slice(0, limit) : stats;
  return (
    <div className={t.scroll}>
      <table className={t.table}>
        <thead>
          <tr>
            <th>Brand</th>
            <th className={t.num}>Live now</th>
            <th className={t.num}>Collected</th>
            <th className={t.num}>New in 30 days</th>
            <th className={t.num}>Video</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.pageId}>
              <td><Link href={`/brand/${s.slug}`}>{s.name}</Link></td>
              <td className={t.num}>{fmt(s.active)}</td>
              <td className={t.num}>{fmt(s.total)}</td>
              <td className={t.num}>{fmt(s.launched30d)}</td>
              <td className={t.num}>{videoShare(s)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One real ad: the creative, how long it has run, who runs it. */
export function AdTile({ ad, eager, showBrand = true }: { ad: LongAd; eager?: boolean; showBrand?: boolean }) {
  return (
    <Link className={t.tile} href={`/brand/${ad.advertiserSlug}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ad.media} alt={`${ad.advertiser} ${ad.format} ad, live for ${ad.days} days`} width={320} height={400} loading={eager ? "eager" : "lazy"} decoding="async" />
      <span className={t.stamp}>{fmt(ad.days)} days live</span>
      {showBrand ? <span className={t.tileBrand}>{ad.advertiser}</span> : null}
      {ad.text ? <span className={t.tileText}>{ad.text}</span> : null}
    </Link>
  );
}

export function LongAds({ ads, eager }: { ads: LongAd[]; eager?: boolean }) {
  if (!ads.length) return <p className={t.note}>Ad previews are refreshing. Open any brand page to see its ads.</p>;
  return (
    <div className={t.tiles}>
      {ads.map((ad) => <AdTile key={ad.id} ad={ad} eager={eager} />)}
    </div>
  );
}

/** A slow, endless strip of real ads (stops for reduced-motion users). */
export function AdMarquee({ ads }: { ads: LongAd[] }) {
  if (ads.length < 4) return <LongAds ads={ads} eager />;
  const loop = [...ads, ...ads];
  return (
    <div className={t.marquee} aria-label="Long-running ads from Indian D2C brands">
      <div className={t.marqueeTrack}>
        {loop.map((ad, i) => (
          <span key={`${ad.id}-${i}`} aria-hidden={i >= ads.length} style={{ display: "contents" }}>
            <AdTile ad={ad} eager={i < 8} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Ranking chart: brands by live ads, in the category colour. */
export function Race({ stats, limit = 10, title }: { stats: BrandStat[]; limit?: number; title: string }) {
  const rows = stats.slice(0, limit);
  const max = Math.max(1, ...rows.map((r) => r.active));
  return (
    <div className={t.race}>
      <h2>{title}</h2>
      {rows.map((s) => (
        <Link key={s.pageId} href={`/brand/${s.slug}`} className={t.raceRow}>
          <span className={t.raceName}>{s.name}</span>
          <span className={t.raceTrack} aria-hidden="true">
            <span className={t.raceFill} style={{ width: `${Math.max(2, (s.active / max) * 100)}%` }} />
          </span>
          <span className={t.raceVal}>{fmt(s.active)}</span>
        </Link>
      ))}
      <p className={t.raceNote}>Ads live on Facebook and Instagram today. Tap a brand to see its ads.</p>
    </div>
  );
}
