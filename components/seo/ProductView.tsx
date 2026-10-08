import Link from "next/link";

import { INDUSTRIES } from "@/lib/seo/industries";
import { fmt, getBrandStats, getLongestRunning, totals } from "@/lib/seo/market";
import type { SeoEntry } from "@/lib/seo/site";

import { BrandTable, LongAds } from "./MarketBits";
import { Faqs, FooterCta, RelatedLinks, SeoTopbar } from "./SeoChrome";
import styles from "./SeoPage.module.css";
import m from "./Market.module.css";

/** What Zooptrack actually does, in concrete terms (same facts on every product page). */
const FEATURES: Array<{ name: string; body: string }> = [
  { name: "Today", body: "Every morning, a ranked list of what your rivals changed since yesterday: new launches, new offers, price changes and bursts of new ads, each with the ads as proof." },
  { name: "Discover ads", body: "Search any Indian brand's Facebook and Instagram ads. Filter by format, language and live status, and sort by longest-running to find the ads that work." },
  { name: "Ad finder", body: "Search across brands by what an ad does: every Hindi testimonial video, every bundle offer, every problem-first hook. Labels are added by AI to every ad." },
  { name: "Rival report", body: "An email report daily or weekly at a time you pick, plus an instant alert when a rival makes a big move. Send it now with one click before a meeting." },
  { name: "ZWIRK", body: "An AI assistant that answers from your rivals' ads: compare two brands, suggest three counter-offers, or write a creative brief for your next ad." },
  { name: "Brand Vault", body: "A file on each rival that keeps itself up to date: what they keep running, which offers they use, which formats and languages they bet on." },
];

/** A product page: live proof first, concrete features second, no filler. */
export async function ProductView({ entry }: { entry: SeoEntry }) {
  const path = `/${entry.slug}`;
  const stats = await getBrandStats(INDUSTRIES.flatMap((i) => i.brands.slice(0, 2)));
  const t = totals(stats);
  const longest = await getLongestRunning(stats.slice(0, 18), 6);

  return (
    <main className={`${styles.page} zt-scope`}>
      <SeoTopbar path={path} />
      <section className={m.dashHead}>
        <div>
          <span className={styles.eyebrow}>{entry.eyebrow}</span>
          <h1>{entry.h1}</h1>
          <p>{entry.intro}</p>
          <p style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className={styles.primary} href={`/login?next=${encodeURIComponent("/adspy")}`}>Start the 7-day free trial</Link>
            <Link className={styles.secondary} href="/brand">Browse brand ad pages</Link>
          </p>
        </div>
        {t.brands ? (
          <div className={m.kpis} style={{ gridTemplateColumns: "repeat(2, 1fr)", margin: 0 }}>
            <div className={m.kpi}><span>Live ads in this sample</span><strong>{fmt(t.active)}</strong><small>{t.brands} brands, today</small></div>
            <div className={m.kpi}><span>New in 30 days</span><strong>{fmt(t.launched30d)}</strong><small>ads launched</small></div>
          </div>
        ) : null}
      </section>

      <section className={m.ads}>
        <div className={m.panel}>
          <span className={styles.eyebrow}>WHAT YOU SEE IN ZOOPTRACK</span>
          <h2>Real ads Indian D2C brands have kept running longest</h2>
          <p>Brands switch off losing ads within days. These are still live today, so they are the best public evidence of what works.</p>
          <LongAds ads={longest} />
        </div>
      </section>

      <section className={m.ads}>
        <div className={m.panel}>
          <span className={styles.eyebrow}>HOW IT WORKS</span>
          <h2>Six tools, one job: know what your rivals changed</h2>
          <div className={m.watch} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", display: "grid", gap: 18 }}>
            {FEATURES.map((f) => (
              <div key={f.name}>
                <strong>{f.name}</strong>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {stats.length ? (
        <section className={m.ads}>
          <div className={m.panel}>
            <span className={styles.eyebrow}>LIVE TODAY</span>
            <h2>Brands you can research right now</h2>
            <BrandTable stats={stats} limit={12} />
            <div className={m.chips} style={{ marginTop: 16 }}>
              {INDUSTRIES.map((i) => <Link key={i.slug} href={`/industries/${i.slug}`}>{i.name}</Link>)}
            </div>
          </div>
        </section>
      ) : null}

      <div className={m.wrap}>
        <div className={styles.callout}><strong>What we never show</strong><p>{entry.caveat}</p></div>
      </div>

      <Faqs faqs={entry.faqs} />
      <RelatedLinks hrefs={entry.related} />
      <FooterCta title="Watch your rivals without the screenshots." copy="Add the brands you compete with. Zooptrack collects their ads every night and tells you what changed." />
    </main>
  );
}
