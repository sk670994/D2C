import Link from "next/link";
import type { CSSProperties } from "react";

import { JsonLd } from "@/components/seo/JsonLd";
import { findIndustry, INDUSTRIES } from "@/lib/seo/industries";
import { fmt, getBrandStats, getLongestRunning, totals } from "@/lib/seo/market";
import { breadcrumbSchema, faqSchema, SITE_URL } from "@/lib/seo/schema";
import type { SeoEntry } from "@/lib/seo/site";

import { Bars, BrandTable, LongAds, Race } from "./MarketBits";
import { Crumbs, Faqs, FooterCta, RelatedLinks, Shell, updatedLabel } from "./SeoChrome";
import t from "./Themes.module.css";

/** An industry page in the category's own colour; the ranking chart leads. */
export async function IndustryView({ entry }: { entry: SeoEntry }) {
  const industry = findIndustry(entry.slug);
  if (!industry) return null;
  const path = `/industries/${industry.slug}`;
  const stats = await getBrandStats(industry.brands);
  const sum = totals(stats);
  const longest = await getLongestRunning(stats.slice(0, 12), 6);
  const leader = stats[0];
  const busiest = [...stats].sort((a, b) => b.launched30d - a.launched30d)[0];

  const faqs = [
    ...(leader ? [{ q: `Which ${industry.noun} run the most Meta ads in India?`, a: `Right now ${leader.name} has the most live ads (${fmt(leader.active)})${stats[1] ? `, followed by ${stats[1].name} (${fmt(stats[1].active)})` : ""}${stats[2] ? ` and ${stats[2].name} (${fmt(stats[2].active)})` : ""}.` }] : []),
    ...(sum.total ? [{ q: `Do ${industry.noun} use more video or image ads?`, a: `Across the ${sum.brands} brands we track, ${sum.videoShare}% of ads are video, ${sum.imageShare}% are images and ${sum.carouselShare}% are carousels.` }] : []),
    ...entry.faqs,
  ];

  return (
    <Shell theme="industry" path={path} style={{ "--cat": industry.hue } as CSSProperties}>
      <JsonLd
        graph={[
          { "@type": "WebPage", url: `${SITE_URL}${path}`, name: entry.title, description: entry.description, inLanguage: "en-IN", dateModified: new Date().toISOString() },
          breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Industries", path: "/industries" }, { name: industry.name, path }]),
          faqSchema(faqs),
        ]}
      />
      <Crumbs items={[{ name: "Home", href: "/" }, { name: "Industries", href: "/industries" }, { name: industry.name }]} />

      <section className={t.catHero}>
        <div>
          <h1>{industry.name} ads in India</h1>
          <p className={t.lede}>{industry.intro}</p>
          {sum.brands ? (
            <p className={t.sentence}>
              Today the <b>{sum.brands}</b> {industry.noun} we track have <b>{fmt(sum.active)}</b> ads live, launched <b>{fmt(sum.launched30d)}</b> in the last 30 days, and <b>{sum.videoShare}%</b> of their ads are video
              {sum.languages[0] ? <>, mostly in <b>{sum.languages[0].label}</b></> : null}.
            </p>
          ) : (
            <p className={t.sentence}>Live numbers are refreshing. Check back shortly.</p>
          )}
          <p className={t.note} style={{ marginTop: 14 }}>Updated {updatedLabel()}</p>
        </div>
        {stats.length ? <Race stats={stats} title={`Who is advertising hardest in ${industry.name.toLowerCase()}`} /> : null}
      </section>

      <section className={`${t.wrap} ${t.section}`}>
        <h2 className={t.h2}>The {industry.name.toLowerCase()} ads running longest</h2>
        <p className={t.sub}>Still live today. Brands switch off losing ads within days, so these have almost certainly earned their place.</p>
        <LongAds ads={longest} eager />
      </section>

      <section className={`${t.wrap} ${t.section} ${t.duo}`}>
        <div>
          <h2 className={t.h2}>Formats</h2>
          <p className={t.sub}>Share of all collected ads in the category.</p>
          <Bars rows={[{ label: "Video", value: sum.videoShare }, { label: "Image", value: sum.imageShare }, { label: "Carousel", value: sum.carouselShare }]} />
        </div>
        {sum.languages.length ? (
          <div>
            <h2 className={t.h2}>Languages</h2>
            <p className={t.sub}>Detected from ad text.</p>
            <Bars rows={sum.languages.map((l) => ({ label: l.label, value: l.share }))} />
          </div>
        ) : null}
      </section>

      <section className={`${t.wrap} ${t.section}`}>
        <h2 className={t.h2}>What to watch in {industry.name.toLowerCase()}</h2>
        <dl className={t.watch}>
          {industry.watch.map((w) => (
            <div key={w.title}>
              <dt>{w.title}</dt>
              <dd>{w.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      {stats.length ? (
        <section className={`${t.wrap} ${t.section}`}>
          <h2 className={t.h2}>Every brand we track here</h2>
          <p className={t.sub}>
            {busiest && busiest.launched30d ? <>Most new ads in the last 30 days: <Link href={`/brand/${busiest.slug}`}>{busiest.name}</Link>, with {fmt(busiest.launched30d)}.</> : "Sorted by ads live today."}
          </p>
          <BrandTable stats={stats} />
        </section>
      ) : null}

      <section className={`${t.wrap} ${t.section}`}>
        <h2 className={t.h2}>Other categories</h2>
        <ul className={t.catLinks}>
          {INDUSTRIES.filter((i) => i.slug !== industry.slug).map((o) => (
            <li key={o.slug}>
              <Link href={`/industries/${o.slug}`}><i style={{ "--dot": o.hue } as CSSProperties} />{o.name}</Link>
            </li>
          ))}
        </ul>
        <p className={t.note} style={{ marginTop: 24 }}>{entry.caveat}</p>
      </section>

      <Faqs faqs={faqs} />
      <RelatedLinks hrefs={["/research/india-d2c-advertising-report-2026", "/research/d2c-ad-creative-trends-2026", "/guides/how-to-analyze-competitor-ads", "/guides/how-to-find-winning-ad-creatives"]} />
      <FooterCta title={`Watch your ${industry.name.toLowerCase()} rivals daily.`} copy="Pick the brands you compete with. Get a daily or weekly report of what changed: new launches, offer changes and the ads they keep paying for." />
    </Shell>
  );
}
