import Link from "next/link";

import { JsonLd } from "@/components/seo/JsonLd";
import { GUIDES } from "@/lib/seo/guides-content";
import { INDUSTRIES } from "@/lib/seo/industries";
import { getBrandStats, getLongestRunning } from "@/lib/seo/market";
import { breadcrumbSchema, faqSchema, ORG_ID, SITE_URL } from "@/lib/seo/schema";
import type { SeoEntry } from "@/lib/seo/site";

import { Crumbs, Faqs, FooterCta, RelatedLinks, SeoTopbar } from "./SeoChrome";
import { LongAds } from "./MarketBits";
import styles from "./SeoPage.module.css";
import m from "./Market.module.css";

/** A guide: a real article with a table of contents, not a template card. */
export async function GuideView({ entry }: { entry: SeoEntry }) {
  const guide = GUIDES[entry.slug];
  if (!guide) return null;
  // Real examples beat described ones: the longest-running live ads right now.
  const sample = await getBrandStats(INDUSTRIES.flatMap((i) => i.brands.slice(0, 1)));
  const examples = await getLongestRunning(sample, 6);
  const path = `/guides/${entry.slug}`;

  return (
    <main className={`${styles.page} zt-scope`}>
      <JsonLd
        graph={[
          { "@type": "Article", headline: entry.h1, description: entry.description, url: `${SITE_URL}${path}`, inLanguage: "en-IN", author: { "@id": ORG_ID }, publisher: { "@id": ORG_ID }, timeRequired: `PT${guide.minutes}M` },
          breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }, { name: entry.h1, path }]),
          faqSchema(entry.faqs),
        ]}
      />
      <SeoTopbar path={path} />
      <Crumbs items={[{ name: "Home", href: "/" }, { name: "Guides", href: "/guides" }, { name: entry.h1 }]} />

      <div className={m.guide}>
        <nav className={m.toc} aria-label="On this page">
          <span>On this page</span>
          {guide.sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>{s.h2}</a>
          ))}
          <span style={{ marginTop: 14 }}>See it with real data</span>
          <Link href="/brand">Brand ad pages</Link>
          <Link href="/industries">Industry dashboards</Link>
        </nav>

        <article className={m.guideBody}>
          <span className={styles.eyebrow}>D2C RESEARCH GUIDE</span>
          <h1>{entry.h1}</h1>
          <p className={m.meta}>{guide.minutes} min read · For {entry.audience.toLowerCase()}</p>
          <div className={m.tldr}>
            <strong>In short</strong>
            <ul>{guide.tldr.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
          {guide.sections.map((s) => (
            <section key={s.id} id={s.id}>
              <h2>{s.h2}</h2>
              {s.paras.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
              {s.list ? (s.ordered ? <ol>{s.list.map((li) => <li key={li}>{li}</li>)}</ol> : <ul>{s.list.map((li) => <li key={li}>{li}</li>)}</ul>) : null}
            </section>
          ))}
          {examples.length ? (
            <section id="examples">
              <h2>Real examples: Indian D2C ads running longest today</h2>
              <p>Pulled live from the brands Zooptrack tracks. Each has stayed live for months, which is the strongest public sign that an ad works. Click one to see that brand&apos;s full ad library.</p>
              <LongAds ads={examples} />
            </section>
          ) : null}
          <div className={styles.callout}><strong>Keep in mind</strong><p>{entry.caveat}</p></div>
        </article>
      </div>

      <Faqs faqs={entry.faqs} />
      <RelatedLinks hrefs={guide.next} title="Read next." />
      <FooterCta title="Skip the manual work." copy="Zooptrack collects your rivals' ads every night, keeps the history and tells you what changed." />
    </main>
  );
}
