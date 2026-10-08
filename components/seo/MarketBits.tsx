import Link from "next/link";

import { fmt, type BrandStat, type LongAd } from "@/lib/seo/market";

import m from "./Market.module.css";

/** Small building blocks shared by industry and research pages. */
export function Bars({ rows }: { rows: Array<{ label: string; value: number }> }) {
  return (
    <div className={m.bars}>
      {rows.map((r) => (
        <div className={m.bar} key={r.label}>
          <span>{r.label}</span>
          <i aria-hidden="true">
            <b style={{ width: `${Math.max(2, Math.min(100, r.value))}%` }} />
          </i>
          <em>{r.value}%</em>
        </div>
      ))}
    </div>
  );
}

export function BrandTable({ stats, limit }: { stats: BrandStat[]; limit?: number }) {
  const rows = limit ? stats.slice(0, limit) : stats;
  return (
    <div className={m.tableScroll}>
      <table className={m.table}>
        <thead>
          <tr>
            <th>Brand</th>
            <th className={m.num}>Active ads</th>
            <th className={m.num}>Total collected</th>
            <th className={m.num}>New (30 days)</th>
            <th className={m.num}>Video</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.pageId}>
              <td>
                <Link href={`/brand/${s.slug}`}>{s.name}</Link>
              </td>
              <td className={m.num}>{fmt(s.active)}</td>
              <td className={m.num}>{fmt(s.total)}</td>
              <td className={m.num}>{fmt(s.launched30d)}</td>
              <td className={m.num}>{s.total ? Math.round((s.video / Math.max(1, s.video + s.image + s.carousel)) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LongAds({ ads }: { ads: LongAd[] }) {
  if (!ads.length) return <p className={m.empty}>Ad previews are being refreshed. Open a brand page to see its ads.</p>;
  return (
    <div className={m.adGrid}>
      {ads.map((ad) => (
        <Link key={ad.id} className={m.ad} href={`/brand/${ad.advertiserSlug}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ad.media} alt={`${ad.advertiser} ${ad.format} ad running ${ad.days} days`} loading="lazy" />
          <div>
            <strong>{ad.advertiser}</strong>
            <span>
              Live {fmt(ad.days)} days · {ad.format}
            </span>
            {ad.text ? <p>{ad.text}</p> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
