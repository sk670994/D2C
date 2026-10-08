import Link from "next/link";
import type { CSSProperties } from "react";

import { JsonLd } from "@/components/seo/JsonLd";
import { fmt, getSeasonData } from "@/lib/seo/market";
import { breadcrumbSchema, faqSchema, ORG_ID, SITE_URL } from "@/lib/seo/schema";
import { SEASONS, type Season } from "@/lib/seo/seasons";

import { Bars, LongAds } from "./MarketBits";
import { Crumbs, Faqs, FooterCta, RelatedLinks, Shell, updatedLabel } from "./SeoChrome";
import t from "./Themes.module.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A season page: the year as a calendar of ads, in the season's own colour. */
export async function SeasonView({ season }: { season: Season }) {
  const path = `/seasons/${season.slug}`;
  const data = await getSeasonData(season.keywords);
  const max = Math.max(1, ...data.weeks.map((w) => w.n));
  const peak = data.weeks.reduce<{ weekStart: string; n: number } | null>((b, w) => (!b || w.n > b.n ? w : b), null);
  const leader = data.brands[0];
  const thin = data.matched < 20;
  const peakLabel = peak && peak.n ? new Date(peak.weekStart).toLocaleDateString("en-IN", { day: "numeric", month: "long" }) : null;

  const faqs = [
    ...(leader ? [{ q: `Which brand runs the most ${season.short} ads?`, a: `In the last year ${leader.name} ran the most ${season.short} ads we collected (${fmt(leader.count)})${data.brands[1] ? `, followed by ${data.brands[1].name} (${fmt(data.brands[1].count)})` : ""}.` }] : []),
    ...(peakLabel ? [{ q: `When do ${season.short} ads peak?`, a: `In our data the busiest week of the last year started on ${peakLabel}, with ${fmt(peak!.n)} new ${season.short} ads.` }] : []),
    ...season.faqs,
  ];

  return (
    <Shell theme="industry" path={path} style={{ "--cat": season.hue } as CSSProperties}>
      {thin ? <meta name="robots" content="noindex,follow" /> : null}
      <JsonLd
        graph={[
          { "@type": "Article", headline: `${season.name} ads in India`, url: `${SITE_URL}${path}`, inLanguage: "en-IN", dateModified: new Date().toISOString(), author: { "@id": ORG_ID }, publisher: { "@id": ORG_ID } },
          breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Seasons", path: "/seasons" }, { name: season.name, path }]),
          faqSchema(faqs),
        ]}
      />
      <Crumbs items={[{ name: "Home", href: "/" }, { name: "Seasons", href: "/seasons" }, { name: season.name }]} />

      <section className={t.seasonHero}>
        <h1>{season.name} ads in India</h1>
        <p className={t.lede}>{season.intro}</p>
        {data.matched ? (
          <p className={t.sentence}>
            In the last 12 months we collected <b>{fmt(data.matched)}</b> {season.short} ads from <b>{fmt(data.brandCount)}</b> brands. <b>{fmt(data.active)}</b> are still live today
            {peakLabel ? <>, and the busiest week started on <b>{peakLabel}</b></> : null}.
          </p>
        ) : (
          <p className={t.sentence}>We are still collecting {season.short} ads for this year. Check back soon.</p>
        )}
        <p className={t.note} style={{ marginTop: 10 }}>Season: {season.when}. Updated {updatedLabel()}.</p>
      </section>

      {data.weeks.length ? (
        <section className={`${t.wrap} ${t.section}`}>
          <h2 className={t.h2}>The {season.short} ad calendar</h2>
          <p className={t.sub}>New {season.short} ads per week over the last 12 months. The tallest bars are when the market is loudest.</p>
          <div className={t.calendar} role="img" aria-label={`New ${season.short} ads per week for the last 52 weeks`}>
            {data.weeks.map((w) => {
              const d = new Date(w.weekStart);
              const firstOfMonth = d.getUTCDate() <= 7;
              return (
                <span key={w.weekStart} title={`Week of ${w.weekStart}: ${w.n} new ads`} className={w === peak && w.n ? t.calPeak : undefined}>
                  <b style={{ height: `${w.n ? Math.max(4, (w.n / max) * 100) : 0}%` }} />
                  {firstOfMonth ? <i>{MONTHS[d.getUTCMonth()]}</i> : null}
                </span>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className={`${t.wrap} ${t.section}`}>
        <h2 className={t.h2}>{season.name} ads still running</h2>
        <p className={t.sub}>The longest-running live {season.short} ads, one per brand. Ads that survive this long are usually working.</p>
        <LongAds ads={data.ads} eager />
      </section>

      {data.brands.length ? (
        <section className={`${t.wrap} ${t.section} ${t.duo}`}>
          <div className={t.race}>
            <h2>Brands with the most {season.short} ads</h2>
            {data.brands.slice(0, 10).map((b) => (
              <Link key={b.name} href={`/brand/${b.slug}`} className={t.raceRow}>
                <span className={t.raceName}>{b.name}</span>
                <span className={t.raceTrack} aria-hidden="true"><span className={t.raceFill} style={{ width: `${Math.max(2, (b.count / Math.max(1, data.brands[0].count)) * 100)}%` }} /></span>
                <span className={t.raceVal}>{fmt(b.count)}</span>
              </Link>
            ))}
            <p className={t.raceNote}>Ads in the last 12 months that mention {season.short}.</p>
          </div>
          <div>
            <h2 className={t.h2}>What they offer</h2>
            <p className={t.sub}>Share of {season.short} ads whose text mentions each kind of offer. {data.videoShare}% of them are video.</p>
            <Bars rows={data.offers.map((o) => ({ label: o.label, value: o.share }))} />
          </div>
        </section>
      ) : null}

      <section className={`${t.wrap} ${t.section}`}>
        <h2 className={t.h2}>What to watch this {season.short === "Diwali" || season.short === "Dussehra" ? "festival" : "season"}</h2>
        <dl className={t.watch}>
          {season.watch.map((w) => (
            <div key={w.title}><dt>{w.title}</dt><dd>{w.body}</dd></div>
          ))}
        </dl>
      </section>

      <section className={`${t.wrap} ${t.section}`}>
        <h2 className={t.h2}>Other seasons</h2>
        <ul className={t.catLinks}>
          {SEASONS.filter((s) => s.slug !== season.slug).map((s) => (
            <li key={s.slug}><Link href={`/seasons/${s.slug}`}><i style={{ "--dot": s.hue } as CSSProperties} />{s.name}</Link></li>
          ))}
        </ul>
        <p className={t.note} style={{ marginTop: 24 }}>
          How we count: an ad counts as a {season.short} ad when its text mentions {season.keywords.slice(0, 4).join(", ")} or a related word, in English or Hindi. Counts come from Meta ads Zooptrack has collected in India in the last 12 months. Meta does not publish spend, so we never estimate it.
        </p>
      </section>

      <Faqs faqs={faqs} />
      <RelatedLinks hrefs={["/research/india-d2c-advertising-report-2026", "/research/d2c-ad-creative-trends-2026", "/industries", "/guides/how-to-monitor-competitor-ads"]} />
      <FooterCta title={`Know what your rivals plan for ${season.short}.`} copy="Zooptrack alerts you the day a rival launches season ads or changes an offer, and sends a daily or weekly report of what changed." />
    </Shell>
  );
}
