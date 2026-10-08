import Link from "next/link";

import { INDUSTRIES } from "@/lib/seo/industries";
import { fmt, getBrandStats, getLongestRunning, totals } from "@/lib/seo/market";
import type { SeoEntry } from "@/lib/seo/site";

import { AdMarquee, BrandTable } from "./MarketBits";
import { Faqs, FooterCta, RelatedLinks, Shell } from "./SeoChrome";
import t from "./Themes.module.css";

/** What Zooptrack does, in concrete terms. */
const FEATURES: Array<{ name: string; body: string }> = [
  { name: "Today", body: "Every morning, a ranked list of what your rivals changed since yesterday: new launches, new offers, price changes and bursts of new ads, each with the ads as proof." },
  { name: "Discover ads", body: "Search any Indian brand's Facebook and Instagram ads. Filter by format, language and live status, and sort by longest-running to find the ads that work." },
  { name: "Ad finder", body: "Search across brands by what an ad does: every Hindi testimonial video, every bundle offer, every problem-first hook." },
  { name: "Rival report", body: "An email daily or weekly at a time you pick, plus an alert the same day a rival makes a big move. Or send it now, before a meeting." },
  { name: "ZWIRK", body: "An assistant that answers from your rivals' ads: compare two brands, get three counter-offers, or a brief for your next ad." },
  { name: "Brand Vault", body: "A file on each rival that keeps itself current: what they keep running, which offers, formats and languages they bet on." },
];

/** Product page: a dark control room with real ads moving through it. */
export async function ProductView({ entry }: { entry: SeoEntry }) {
  const path = `/${entry.slug}`;
  const stats = await getBrandStats(INDUSTRIES.flatMap((i) => i.brands.slice(0, 2)));
  const total = totals(stats);
  const longest = await getLongestRunning(stats.slice(0, 24), 14);

  return (
    <Shell theme="product" path={path} dark>
      <section className={t.productHero}>
        <div>
          <h1>{entry.h1}</h1>
          <p className={t.lede}>{entry.intro}</p>
          <div className={t.btns}>
            <Link className={t.btn} href="/login?next=%2Fadspy">Start the 7-day free trial</Link>
            <Link className={`${t.btn} ${t.btnGhost}`} href="/brand">See real brand pages</Link>
          </div>
        </div>
        {total.brands ? (
          <div className={t.liveCount}>
            <strong>{fmt(total.active)}</strong>
            <span>ads live today across {total.brands} of the brands we track, {fmt(total.launched30d)} of them launched in the last 30 days.</span>
          </div>
        ) : null}
      </section>

      <AdMarquee ads={longest} />
      <div className={t.wrap}><p className={t.note}>Every ad above is still running today. The number is how many days it has been live: brands switch off losing ads within days, so these are the likely winners.</p></div>

      <section className={`${t.wrap} ${t.section}`}>
        <h2 className={t.h2}>What you get</h2>
        <p className={t.sub}>Six parts of one job: knowing what your rivals changed, and what to do about it.</p>
        <dl className={t.features}>
          {FEATURES.map((f) => (
            <div key={f.name}>
              <dt>{f.name}</dt>
              <dd>{f.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      {stats.length ? (
        <section className={`${t.wrap} ${t.section}`}>
          <h2 className={t.h2}>Brands you can research right now</h2>
          <p className={t.sub}>Live counts for a sample of the {INDUSTRIES.reduce((n, i) => n + i.brands.length, 0)} brands collected every night.</p>
          <BrandTable stats={stats} limit={10} />
        </section>
      ) : null}

      <section className={`${t.wrap} ${t.section}`}>
        <p className={t.note}>{entry.caveat}</p>
      </section>

      <Faqs faqs={entry.faqs} />
      <RelatedLinks hrefs={entry.related} />
      <FooterCta title="Stop screenshotting the Ad Library." copy="Add the brands you compete with. Zooptrack collects their ads every night and tells you what changed." />
    </Shell>
  );
}
