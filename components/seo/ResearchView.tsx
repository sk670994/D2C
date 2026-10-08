import Link from "next/link";

import { JsonLd } from "@/components/seo/JsonLd";
import { INDUSTRIES, type Industry } from "@/lib/seo/industries";
import { fmt, getBrandStats, getLongestRunning, share, totals, type BrandStat, type MarketTotals } from "@/lib/seo/market";
import { breadcrumbSchema, faqSchema, ORG_ID, SITE_URL } from "@/lib/seo/schema";
import type { SeoEntry } from "@/lib/seo/site";

import { Crumbs, Faqs, FooterCta, RelatedLinks, SeoTopbar, updatedLabel } from "./SeoChrome";
import { BrandTable, LongAds } from "./MarketBits";
import styles from "./SeoPage.module.css";
import m from "./Market.module.css";

type CategoryRow = { industry: Industry; stats: BrandStat[]; t: MarketTotals; hindi: number };

async function loadMarket() {
  const all = await getBrandStats(INDUSTRIES.flatMap((i) => i.brands));
  const byQuery = new Map(all.map((s) => [s.query, s]));
  const categories: CategoryRow[] = INDUSTRIES.map((industry) => {
    const stats = industry.brands.map((b) => byQuery.get(b)).filter((s): s is BrandStat => Boolean(s));
    const t = totals(stats);
    const langTotal = stats.reduce((n, s) => n + s.languages.reduce((a, l) => a + l.count, 0), 0);
    const hindiCount = stats.reduce((n, s) => n + (s.languages.find((l) => /hindi/i.test(l.label))?.count ?? 0), 0);
    return { industry, stats, t, hindi: share(hindiCount, langTotal) };
  }).filter((c) => c.stats.length);
  return { all, overall: totals(all), categories };
}

const pickMax = <T,>(rows: T[], f: (r: T) => number) => rows.reduce<T | null>((best, r) => (best == null || f(r) > f(best) ? r : best), null);
const pickMin = <T,>(rows: T[], f: (r: T) => number) => rows.reduce<T | null>((best, r) => (best == null || f(r) < f(best) ? r : best), null);

function Method({ brands }: { brands: number }) {
  return (
    <div className={m.method}>
      <strong>Methodology</strong>
      Zooptrack collects every public ad from {brands} Indian D2C brands in Meta&apos;s Ad Library (country: India) every night, across {INDUSTRIES.length} categories. Counts include active and stopped ads we have collected; &quot;active&quot; means live on the day this page was built; &quot;new in 30 days&quot; counts ads first seen in the last 30 days. Format comes from Meta&apos;s ad data; language is detected from ad text. Meta does not publish spend, reach or results for commercial ads in India, so nothing here estimates spend. Updated daily; last update {updatedLabel()}.
    </div>
  );
}

export async function ResearchView({ entry }: { entry: SeoEntry }) {
  const path = `/research/${entry.slug}`;
  const { all, overall, categories } = await loadMarket();
  const isCreative = entry.slug === "d2c-ad-creative-trends-2026";

  const topCat = pickMax(categories, (c) => c.t.active);
  const fastCat = pickMax(categories, (c) => c.t.launched30d);
  const videoCat = pickMax(categories, (c) => c.t.videoShare);
  const imageCat = pickMin(categories, (c) => c.t.videoShare);
  const hindiCat = pickMax(categories, (c) => c.hindi);
  const leader = all[0];
  const longest = isCreative ? await getLongestRunning(all.slice(0, 40), 9) : [];

  const findings = isCreative
    ? [
        `${overall.videoShare}% of the ads collected from Indian D2C brands are video, ${overall.imageShare}% are images and ${overall.carouselShare}% are carousels.`,
        videoCat ? `${videoCat.industry.name} is the most video-heavy category (${videoCat.t.videoShare}% video).` : null,
        imageCat && imageCat !== videoCat ? `${imageCat.industry.name} leans most on static creative (only ${imageCat.t.videoShare}% video).` : null,
        overall.languages[0] ? `${overall.languages[0].label} is the most common ad language (${overall.languages[0].share}% of ads)${overall.languages[1] ? `, followed by ${overall.languages[1].label} (${overall.languages[1].share}%)` : ""}.` : null,
        hindiCat && hindiCat.hindi ? `${hindiCat.industry.name} uses Hindi the most: ${hindiCat.hindi}% of its ads.` : null,
      ]
    : [
        `The ${fmt(overall.brands)} Indian D2C brands we track have ${fmt(overall.active)} ads live on Facebook and Instagram right now, out of ${fmt(overall.total)} collected.`,
        `They launched ${fmt(overall.launched30d)} new ads in the last 30 days.`,
        topCat ? `${topCat.industry.name} has the most active ads of any category (${fmt(topCat.t.active)}).` : null,
        fastCat && fastCat !== topCat ? `${fastCat.industry.name} launched the most new ads in the last 30 days (${fmt(fastCat.t.launched30d)}).` : null,
        leader ? `${leader.name} is the most active single advertiser, with ${fmt(leader.active)} live ads.` : null,
        `${overall.videoShare}% of ads are video${overall.languages[0] ? ` and ${overall.languages[0].label} is the top language (${overall.languages[0].share}%)` : ""}.`,
      ];
  const facts = findings.filter((f): f is string => Boolean(f));

  const faqs = [
    ...(leader ? [{ q: "Which Indian D2C brand runs the most Meta ads?", a: `Among the brands we track, ${leader.name} has the most live ads right now (${fmt(leader.active)}).` }] : []),
    ...(isCreative && videoCat ? [{ q: "Which D2C category uses the most video ads?", a: `${videoCat.industry.name}, where ${videoCat.t.videoShare}% of collected ads are video.` }] : []),
    ...entry.faqs,
  ];

  return (
    <main className={`${styles.page} zt-scope`}>
      <JsonLd
        graph={[
          { "@type": "Article", headline: entry.h1, description: entry.description, url: `${SITE_URL}${path}`, inLanguage: "en-IN", dateModified: new Date().toISOString(), author: { "@id": ORG_ID }, publisher: { "@id": ORG_ID } },
          { "@type": "Dataset", name: entry.title, description: entry.description, url: `${SITE_URL}${path}`, creator: { "@id": ORG_ID }, spatialCoverage: "India", isAccessibleForFree: true, measurementTechnique: "Daily collection of public ads from Meta's Ad Library (India)", dateModified: new Date().toISOString() },
          breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Research", path: "/research" }, { name: entry.h1, path }]),
          faqSchema(faqs),
        ]}
      />
      <SeoTopbar path={path} />
      <Crumbs items={[{ name: "Home", href: "/" }, { name: "Research", href: "/research" }, { name: entry.h1 }]} />

      <article className={m.report}>
        <span className={styles.eyebrow}>ZOOPTRACK RESEARCH · UPDATED {updatedLabel().toUpperCase()}</span>
        <h1>{entry.h1}</h1>
        <p>{entry.intro}</p>

        <span className={styles.eyebrow}>KEY FINDINGS</span>
        <ol className={m.findings}>{facts.map((f) => <li key={f}>{f}</li>)}</ol>

        {isCreative ? (
          <>
            <section className={m.reportSection}>
              <span className={styles.eyebrow}>FORMAT MIX BY CATEGORY</span>
              <h2>Video, image or carousel?</h2>
              <div className={m.panel}>
                <div className={m.tableScroll}>
                  <table className={m.table}>
                    <thead><tr><th>Category</th><th className={m.num}>Video</th><th className={m.num}>Image</th><th className={m.num}>Carousel</th><th>Top language</th></tr></thead>
                    <tbody>
                      {[...categories].sort((a, b) => b.t.videoShare - a.t.videoShare).map((c) => (
                        <tr key={c.industry.slug}>
                          <td><Link href={`/industries/${c.industry.slug}`}>{c.industry.name}</Link></td>
                          <td className={m.num}>{c.t.videoShare}%</td>
                          <td className={m.num}>{c.t.imageShare}%</td>
                          <td className={m.num}>{c.t.carouselShare}%</td>
                          <td>{c.t.languages[0] ? `${c.t.languages[0].label} (${c.t.languages[0].share}%)` : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
            <section className={m.reportSection}>
              <span className={styles.eyebrow}>LIKELY WINNERS</span>
              <h2>The longest-running D2C ads still live</h2>
              <p>Brands switch off losing ads quickly. These ads have stayed live the longest across every category we track, which makes them the best public evidence of what works.</p>
              <LongAds ads={longest} />
            </section>
          </>
        ) : (
          <>
            <section className={m.reportSection}>
              <span className={styles.eyebrow}>BY CATEGORY</span>
              <h2>Ad activity across {categories.length} D2C categories</h2>
              <div className={m.panel}>
                <div className={m.tableScroll}>
                  <table className={m.table}>
                    <thead><tr><th>Category</th><th className={m.num}>Brands</th><th className={m.num}>Active ads</th><th className={m.num}>New (30 days)</th><th className={m.num}>Video</th></tr></thead>
                    <tbody>
                      {[...categories].sort((a, b) => b.t.active - a.t.active).map((c) => (
                        <tr key={c.industry.slug}>
                          <td><Link href={`/industries/${c.industry.slug}`}>{c.industry.name}</Link></td>
                          <td className={m.num}>{c.t.brands}</td>
                          <td className={m.num}>{fmt(c.t.active)}</td>
                          <td className={m.num}>{fmt(c.t.launched30d)}</td>
                          <td className={m.num}>{c.t.videoShare}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
            <section className={m.reportSection}>
              <span className={styles.eyebrow}>MOST ACTIVE ADVERTISERS</span>
              <h2>The 15 D2C brands with the most live ads</h2>
              <div className={m.panel}>
                <BrandTable stats={all} limit={15} />
              </div>
            </section>
          </>
        )}

        <section className={m.reportSection}>
          <Method brands={overall.brands} />
        </section>
      </article>

      <Faqs faqs={faqs} />
      <RelatedLinks hrefs={entry.related} />
      <FooterCta title="Get this for your own competitors." copy="Zooptrack tracks the brands you choose every day and tells you what changed, with the ads as evidence." />
    </main>
  );
}
