import Link from "next/link";

import { JsonLd } from "@/components/seo/JsonLd";
import { findIndustry, INDUSTRIES } from "@/lib/seo/industries";
import { fmt, getBrandStats, getLongestRunning, totals } from "@/lib/seo/market";
import { breadcrumbSchema, faqSchema, SITE_URL } from "@/lib/seo/schema";
import type { SeoEntry } from "@/lib/seo/site";

import { Crumbs, Faqs, FooterCta, RelatedLinks, SeoTopbar, updatedLabel } from "./SeoChrome";
import { Bars, BrandTable, LongAds } from "./MarketBits";
import styles from "./SeoPage.module.css";
import m from "./Market.module.css";

/** An industry page: live dashboard of every tracked brand in the category. */
export async function IndustryView({ entry }: { entry: SeoEntry }) {
  const industry = findIndustry(entry.slug);
  if (!industry) return null;
  const path = `/industries/${industry.slug}`;
  const stats = await getBrandStats(industry.brands);
  const t = totals(stats);
  const longest = await getLongestRunning(stats.slice(0, 12), 6);
  const leader = stats[0];
  const busiest = [...stats].sort((a, b) => b.launched30d - a.launched30d)[0];

  // Data-driven answers: unique to this category and true on the day it renders.
  const faqs = [
    ...(leader
      ? [{ q: `Which ${industry.noun} run the most Meta ads in India?`, a: `Right now ${leader.name} has the most active ads (${fmt(leader.active)})${stats[1] ? `, followed by ${stats[1].name} (${fmt(stats[1].active)})` : ""}${stats[2] ? ` and ${stats[2].name} (${fmt(stats[2].active)})` : ""}.` }]
      : []),
    ...(t.total
      ? [{ q: `Do ${industry.noun} use more video or image ads?`, a: `Across the ${t.brands} brands we track, ${t.videoShare}% of ads are video, ${t.imageShare}% are images and ${t.carouselShare}% are carousels.` }]
      : []),
    ...entry.faqs,
  ];

  const others = INDUSTRIES.filter((i) => i.slug !== industry.slug);

  return (
    <main className={styles.page}>
      <JsonLd
        graph={[
          { "@type": "WebPage", url: `${SITE_URL}${path}`, name: entry.title, description: entry.description, inLanguage: "en-IN", dateModified: new Date().toISOString() },
          breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Industries", path: "/industries" }, { name: industry.name, path }]),
          faqSchema(faqs),
        ]}
      />
      <SeoTopbar path={path} />
      <Crumbs items={[{ name: "Home", href: "/" }, { name: "Industries", href: "/industries" }, { name: industry.name }]} />

      <section className={m.dashHead}>
        <div>
          <span className={styles.eyebrow}>D2C INDUSTRY · LIVE META AD DATA</span>
          <h1>{entry.h1}</h1>
          <p>{industry.intro}</p>
        </div>
        <span className={m.updated}>Updated {updatedLabel()} · {t.brands} brands tracked</span>
      </section>

      <section className={m.kpis} aria-label="Category totals">
        <div className={m.kpi}><span>Active ads now</span><strong>{fmt(t.active)}</strong><small>across {t.brands} brands</small></div>
        <div className={m.kpi}><span>New in 30 days</span><strong>{fmt(t.launched30d)}</strong><small>ads launched</small></div>
        <div className={m.kpi}><span>Video share</span><strong>{t.videoShare}%</strong><small>of collected ads</small></div>
        <div className={m.kpi}><span>Top language</span><strong>{t.languages[0]?.label ?? "–"}</strong><small>{t.languages[0] ? `${t.languages[0].share}% of ads` : "refreshing"}</small></div>
      </section>

      <section className={m.twoCol}>
        <div className={m.panel}>
          <span className={styles.eyebrow}>WHO IS PUSHING HARDEST</span>
          <h2>{industry.name} brands ranked by active ads</h2>
          {stats.length ? <BrandTable stats={stats} /> : <p className={m.empty}>Numbers are refreshing. Check back shortly.</p>}
          {busiest && busiest.launched30d ? (
            <p style={{ marginTop: 14 }}>
              Most new ads in the last 30 days: <Link href={`/brand/${busiest.slug}`}>{busiest.name}</Link> with {fmt(busiest.launched30d)} launches.
            </p>
          ) : null}
        </div>
        <div className={m.stack}>
          <div className={m.panel}>
            <span className={styles.eyebrow}>FORMAT MIX</span>
            <h2>How they advertise</h2>
            <Bars rows={[{ label: "Video", value: t.videoShare }, { label: "Image", value: t.imageShare }, { label: "Carousel", value: t.carouselShare }]} />
          </div>
          {t.languages.length ? (
            <div className={m.panel}>
              <span className={styles.eyebrow}>LANGUAGES</span>
              <h2>Who they talk to</h2>
              <Bars rows={t.languages.map((l) => ({ label: l.label, value: l.share }))} />
            </div>
          ) : null}
        </div>
      </section>

      <section className={m.ads}>
        <div className={m.panel}>
          <span className={styles.eyebrow}>LIKELY WINNERS</span>
          <h2>The {industry.name.toLowerCase()} ads running longest right now</h2>
          <p>Brands switch off losing ads within days, so ads that stay live for months are usually working. These are still running today.</p>
          <LongAds ads={longest} />
        </div>
      </section>

      <section className={m.twoCol}>
        <div className={m.panel}>
          <span className={styles.eyebrow}>WHAT TO WATCH</span>
          <h2>Three things to track in {industry.name.toLowerCase()}</h2>
          <div className={m.watch}>
            {industry.watch.map((w) => (
              <div key={w.title}>
                <strong>{w.title}</strong>
                <p>{w.body}</p>
              </div>
            ))}
          </div>
        </div>
        <div className={m.panel}>
          <span className={styles.eyebrow}>OTHER CATEGORIES</span>
          <h2>Compare with</h2>
          <div className={m.chips}>
            {others.map((o) => (
              <Link key={o.slug} href={`/industries/${o.slug}`}>{o.name}</Link>
            ))}
          </div>
        </div>
      </section>

      <div className={m.wrap}>
        <div className={styles.callout}><strong>Evidence boundary</strong><p>{entry.caveat}</p></div>
      </div>

      <Faqs faqs={faqs} />
      <RelatedLinks hrefs={["/research/india-d2c-advertising-report-2026", "/research/d2c-ad-creative-trends-2026", "/guides/how-to-analyze-competitor-ads", "/guides/how-to-find-winning-ad-creatives"]} />
      <FooterCta title={`Watch your ${industry.name.toLowerCase()} rivals every day.`} copy="Add the brands you compete with and get a daily or weekly report of what changed: new launches, offer changes and the ads they keep paying for." />
    </main>
  );
}
