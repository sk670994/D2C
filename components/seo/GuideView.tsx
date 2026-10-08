import Link from "next/link";

import { JsonLd } from "@/components/seo/JsonLd";
import { GUIDES } from "@/lib/seo/guides-content";
import { INDUSTRIES } from "@/lib/seo/industries";
import { getBrandStats, getLongestRunning } from "@/lib/seo/market";
import { breadcrumbSchema, faqSchema, ORG_ID, SITE_URL } from "@/lib/seo/schema";
import type { SeoEntry } from "@/lib/seo/site";

import { LongAds } from "./MarketBits";
import { Crumbs, Faqs, FooterCta, RelatedLinks, Shell, updatedLabel } from "./SeoChrome";
import t from "./Themes.module.css";

/** A guide set as a field manual: contents on the left, a long serif read on the right. */
export async function GuideView({ entry }: { entry: SeoEntry }) {
  const guide = GUIDES[entry.slug];
  if (!guide) return null;
  const path = `/guides/${entry.slug}`;
  // Real examples beat described ones: the longest-running live ads right now.
  const sample = await getBrandStats(INDUSTRIES.flatMap((i) => i.brands.slice(0, 1)));
  const examples = await getLongestRunning(sample, 6);

  return (
    <Shell theme="guide" path={path}>
      <JsonLd
        graph={[
          { "@type": "Article", headline: entry.h1, description: entry.description, url: `${SITE_URL}${path}`, inLanguage: "en-IN", author: { "@id": ORG_ID }, publisher: { "@id": ORG_ID }, timeRequired: `PT${guide.minutes}M` },
          breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }, { name: entry.h1, path }]),
          faqSchema(entry.faqs),
        ]}
      />
      <Crumbs items={[{ name: "Home", href: "/" }, { name: "Guides", href: "/guides" }, { name: entry.h1 }]} />

      <div className={t.manual}>
        <nav className={t.toc} aria-label="Contents">
          <span className={t.label}>Contents</span>
          <ol>
            {guide.sections.map((s) => (
              <li key={s.id}><a href={`#${s.id}`}>{s.h2}</a></li>
            ))}
            {examples.length ? <li><a href="#examples">Real examples</a></li> : null}
          </ol>
          <span className={t.label}>See it with live data</span>
          <p><Link href="/brand">Brand ad pages</Link></p>
          <p><Link href="/industries">Industry dashboards</Link></p>
        </nav>

        <article className={t.manualBody}>
          <h1>{entry.h1}</h1>
          <p className={t.byline}>A {guide.minutes}-minute read for {entry.audience.toLowerCase()}. Updated {updatedLabel()}.</p>
          <div className={t.short}>
            <h2>The short version</h2>
            <ul>{guide.tldr.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          {guide.sections.map((s) => (
            <section key={s.id} id={s.id}>
              <h2>{s.h2}</h2>
              {s.paras.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
              {s.list ? (s.ordered ? <ol className={t.steps}>{s.list.map((li) => <li key={li}>{li}</li>)}</ol> : <ul>{s.list.map((li) => <li key={li}>{li}</li>)}</ul>) : null}
            </section>
          ))}
          <p className={t.caveat}>{entry.caveat}</p>
        </article>
      </div>

      {examples.length ? (
        <section id="examples" className={`${t.wrap} ${t.section}`}>
          <h2 className={t.h2}>Real examples: Indian D2C ads running longest today</h2>
          <p className={t.sub}>Pulled live from the brands Zooptrack tracks. Each has stayed live for months, the strongest public sign that an ad works. Open one to see that brand&apos;s full library.</p>
          <LongAds ads={examples} />
        </section>
      ) : null}

      <Faqs faqs={entry.faqs} />
      <RelatedLinks hrefs={guide.next} title="Read next" />
      <FooterCta title="Skip the manual work." copy="Zooptrack collects your rivals' ads every night, keeps the history and tells you what changed." />
    </Shell>
  );
}
