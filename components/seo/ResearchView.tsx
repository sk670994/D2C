import Link from "next/link";
import type { CSSProperties } from "react";

import { JsonLd } from "@/components/seo/JsonLd";
import { INDUSTRIES, type Industry } from "@/lib/seo/industries";
import { fmt, getBrandStats, getLongestRunning, share, totals, type BrandStat, type MarketTotals } from "@/lib/seo/market";
import { breadcrumbSchema, faqSchema, ORG_ID, SITE_URL } from "@/lib/seo/schema";
import type { SeoEntry } from "@/lib/seo/site";

import { Crumbs, Faqs, FooterCta, RelatedLinks, Shell, updatedLabel } from "./SeoChrome";
import { BrandTable, LongAds } from "./MarketBits";
import t from "./Themes.module.css";

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
    <div className={t.method}>
      <strong>How we measure.</strong> Zooptrack collects every public ad from {brands} Indian D2C brands in Meta&apos;s Ad Library (India) every night, across {INDUSTRIES.length} categories. Counts include live and stopped ads we have collected. Live means running on the day this page was built; new in 30 days counts ads first seen in the last 30 days. Format comes from Meta&apos;s ad data; language is detected from ad text. Meta does not publish spend, reach or results for commercial ads in India, so nothing here estimates spend. Rebuilt daily; this version: {updatedLabel()}.
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

  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const sortedByActive = [...categories].sort((a, b) => b.t.active - a.t.active);
  const sortedByVideo = [...categories].sort((a, b) => b.t.videoShare - a.t.videoShare);

  return (
    <Shell theme="research" path={path}>
      <JsonLd
        graph={[
          { "@type": "Article", headline: entry.h1, description: entry.description, url: `${SITE_URL}${path}`, inLanguage: "en-IN", dateModified: new Date().toISOString(), author: { "@id": ORG_ID }, publisher: { "@id": ORG_ID } },
          { "@type": "Dataset", name: entry.title, description: entry.description, url: `${SITE_URL}${path}`, creator: { "@id": ORG_ID }, spatialCoverage: "India", isAccessibleForFree: true, measurementTechnique: "Daily collection of public ads from Meta's Ad Library (India)", dateModified: new Date().toISOString() },
          breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Research", path: "/research" }, { name: entry.h1, path }]),
          faqSchema(faqs),
        ]}
      />
      <Crumbs items={[{ name: "Home", href: "/" }, { name: "Research", href: "/research" }, { name: entry.h1 }]} />

      <header className={t.paperHead}>
        <h1>{entry.h1}</h1>
        <div className={t.dateline}>
          <strong>{today}</strong>
          Rebuilt every day from {fmt(overall.brands)} brands and {fmt(overall.total)} collected ads.
        </div>
      </header>

      <article className={t.wrap}>
        <p className={t.paperIntro}>{entry.intro}</p>

        <h2 className={t.h2} style={{ marginTop: 56 }}>Key findings</h2>
        <ol className={t.findings}>{facts.map((f) => <li key={f}>{f}</li>)}</ol>

        {isCreative ? (
          <>
            <section className={t.paperSection}>
              <h2 className={t.h2}>Video, image or carousel, by category</h2>
              <p className={t.sub}>Share of each category&apos;s collected ads, most video-heavy first.</p>
              <div className={t.scroll}>
                <table className={t.table}>
                  <thead><tr><th>Category</th><th className={t.num}>Video</th><th className={t.num}>Image</th><th className={t.num}>Carousel</th><th>Top language</th></tr></thead>
                  <tbody>
                    {sortedByVideo.map((c) => (
                      <tr key={c.industry.slug}>
                        <td><Link href={`/industries/${c.industry.slug}`}>{c.industry.name}</Link></td>
                        <td className={t.num}>{c.t.videoShare}%</td>
                        <td className={t.num}>{c.t.imageShare}%</td>
                        <td className={t.num}>{c.t.carouselShare}%</td>
                        <td>{c.t.languages[0] ? `${c.t.languages[0].label} (${c.t.languages[0].share}%)` : "Not enough text"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className={t.paperSection}>
              <h2 className={t.h2}>The longest-running D2C ads still live</h2>
              <p className={t.sub}>Brands switch off losing ads quickly. These have stayed live the longest across every category we track: the best public evidence of what works.</p>
              <LongAds ads={longest} eager />
            </section>
          </>
        ) : (
          <>
            <section className={t.paperSection}>
              <h2 className={t.h2}>Ad activity in {categories.length} D2C categories</h2>
              <p className={t.sub}>Sorted by ads live today.</p>
              <div className={t.catChart} role="list" aria-label="Live ads by category">
                {sortedByActive.map((c) => (
                  <Link role="listitem" key={c.industry.slug} href={`/industries/${c.industry.slug}`} style={{ "--dot": c.industry.hue } as CSSProperties}>
                    <span>{c.industry.name}</span>
                    <i style={{ width: `${Math.max(2, (c.t.active / Math.max(1, ...sortedByActive.map((c) => c.t.active))) * 100)}%` }} />
                    <b>{fmt(c.t.active)}</b>
                  </Link>
                ))}
              </div>
              <div className={t.scroll}>
                <table className={t.table}>
                  <thead><tr><th>Category</th><th className={t.num}>Brands</th><th className={t.num}>Live now</th><th className={t.num}>New in 30 days</th><th className={t.num}>Video</th></tr></thead>
                  <tbody>
                    {sortedByActive.map((c) => (
                      <tr key={c.industry.slug}>
                        <td><Link href={`/industries/${c.industry.slug}`}>{c.industry.name}</Link></td>
                        <td className={t.num}>{c.t.brands}</td>
                        <td className={t.num}>{fmt(c.t.active)}</td>
                        <td className={t.num}>{fmt(c.t.launched30d)}</td>
                        <td className={t.num}>{c.t.videoShare}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className={t.paperSection}>
              <h2 className={t.h2}>The 15 brands with the most live ads</h2>
              <p className={t.sub}>Across every category we track.</p>
              <BrandTable stats={all} limit={15} />
            </section>
          </>
        )}

        <Method brands={overall.brands} />
      </article>

      <Faqs faqs={faqs} />
      <RelatedLinks hrefs={entry.related} />
      <FooterCta title="Get this for your own competitors." copy="Zooptrack tracks the brands you choose every day and tells you what changed, with the ads as proof." />
    </Shell>
  );
}
