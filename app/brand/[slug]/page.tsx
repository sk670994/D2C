/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/app/BrandLogo";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { getSearchFacets, type FacetResult } from "@/lib/ad-intelligence/global/facets";
import { brandSlug } from "@/lib/ad-intelligence/brand-slug";
import seed from "@/scripts/adspy-seed-brands.json";
import styles from "../brand.module.css";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, faqSchema, SITE_URL } from "@/lib/seo/schema";
import { isStoredMediaUrl } from "@/lib/ad-intelligence/global/media-store";
import { industryOfBrand } from "@/lib/seo/industries";
import { getCreativeMix, getLongestRunning, type LongAd, type MixRow } from "@/lib/seo/market";

// Public, cached teaser page (SEO). Refreshed every 6 hours.
export const revalidate = 21600;

type Advertiser = { pageId: string; name: string };
type SampleAd = {
  id: string;
  headline: string | null;
  primary_text: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  creative_type: string | null;
  is_currently_active: boolean | null;
  first_seen_at: string | null;
};

const COUNTRY = "IN";

function nameFromSlug(slug: string): string {
  return decodeURIComponent(slug).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function findAdvertiser(name: string): Promise<Advertiser | null> {
  if (name.length < 2) return null;
  const { data } = await createGlobalServiceClient().rpc("adspy_autocomplete_advertisers", {
    p_query: name,
    p_platform: "meta",
    p_country: COUNTRY,
    p_limit: 8,
  });
  const rows = ((data ?? []) as Array<{ page_id?: string | number | null; label?: string | null }>)
    .filter((r) => r.page_id && r.label)
    .map((r) => ({ pageId: String(r.page_id), name: String(r.label) }));
  const want = norm(name);
  return rows.find((r) => norm(r.name) === want) ?? rows.find((r) => norm(r.name).startsWith(want)) ?? null;
}

async function load(slug: string) {
  const advertiser = await findAdvertiser(nameFromSlug(slug)).catch(() => null);
  if (!advertiser) return { advertiser: null, facets: null, ads: [] as SampleAd[] };

  const [facets, adsResult] = await Promise.all([
    getSearchFacets({ query: advertiser.name, country: COUNTRY, platform: "meta", mode: "advertiser", pageId: advertiser.pageId }).catch(
      () => null as FacetResult | null,
    ),
    createGlobalServiceClient()
      .from("ad_intelligence_creatives")
      .select("id,headline,primary_text,thumbnail_url,image_url,creative_type,is_currently_active,first_seen_at")
      .eq("platform", "meta")
      .eq("advertiser_id", advertiser.pageId)
      .order("first_seen_at", { ascending: false, nullsFirst: false })
      .limit(24),
  ]);

  const ads = ((adsResult.data ?? []) as SampleAd[])
    .filter((a) => a.thumbnail_url || a.image_url)
    // Stored copies (Supabase or R2) never expire, so prefer them on a cached public page.
    .sort((a, b) => Number(isStoredMediaUrl(b.thumbnail_url ?? b.image_url)) - Number(isStoredMediaUrl(a.thumbnail_url ?? a.image_url)))
    .slice(0, 6);

  return { advertiser, facets, ads };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { advertiser, facets } = await load(slug);
  const name = advertiser?.name ?? nameFromSlug(slug);
  const count = facets?.total ? `${facets.total.toLocaleString("en-IN")} ` : "";
  const title = `${name} Facebook & Instagram ads (${count ? `${count}ads` : "ad library"})`;
  const description = `See ${count}${name} ads running on Meta in India: hooks, offers, languages and new launches per week. Free competitor ad research for D2C brands.`;
  const url = `/brand/${brandSlug(name)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "Zooptrack", locale: "en_IN", url, title: `${title} | Zooptrack`, description, images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: `${title} | Zooptrack`, description },
  };
}

function hook(ad: SampleAd): string {
  const raw = (ad.primary_text || ad.headline || "").replace(/\s+/g, " ").trim();
  const text = /^started running on\b/i.test(raw) ? "" : raw;
  return text.length > 150 ? `${text.slice(0, 147)}…` : text || "No ad copy captured";
}

function pct(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–";
}

function Mix({ title, rows }: { title: string; rows: MixRow[] }) {
  if (!rows.length) return null;
  return (
    <div className={styles.mix}>
      <h3>{title}</h3>
      {rows.map((r) => (
        <div className={styles.mixRow} key={r.label}>
          <span>{r.label}</span>
          <i aria-hidden="true"><b style={{ width: `${Math.max(3, r.share)}%` }} /></i>
          <em>{r.share}%</em>
        </div>
      ))}
    </div>
  );
}

/** Weekly launches as a small bar chart (last 12 weeks). */
function Launches({ weeks }: { weeks: Array<{ weekStart: string; launched: number }> }) {
  const max = Math.max(1, ...weeks.map((w) => w.launched));
  return (
    <div className={styles.launches} role="img" aria-label={`New ads per week: ${weeks.map((w) => w.launched).join(", ")}`}>
      {weeks.map((w) => (
        <div key={w.weekStart} title={`Week of ${w.weekStart}: ${w.launched} new ads`}>
          <b style={{ height: `${Math.max(4, (w.launched / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

export default async function BrandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { advertiser, facets, ads } = await load(slug);
  const name = advertiser?.name ?? nameFromSlug(slug);
  const path = `/brand/${brandSlug(name)}`;
  const next = advertiser ? `/adspy?q=${encodeURIComponent(advertiser.name)}&pid=${advertiser.pageId}` : `/adspy?q=${encodeURIComponent(name)}`;
  const signup = `/login?next=${encodeURIComponent(next)}`;
  const total = facets?.total ?? 0;
  const active = facets?.status.find((b) => b.value === "active")?.count ?? 0;
  const video = facets?.format.find((b) => b.value === "video")?.count ?? 0;
  const languages = (facets?.language ?? []).slice(0, 3).map((l) => l.label).join(", ") || "–";
  const weeks = facets?.momentum.weeks ?? [];
  const launched30d = facets?.momentum.launched30d ?? 0;
  const industry = industryOfBrand(name) ?? industryOfBrand(nameFromSlug(slug));
  const peers = (industry?.brands ?? (seed as { brands: string[] }).brands).filter((b) => norm(b) !== norm(name)).slice(0, 24);
  const [longest, mix] = advertiser
    ? await Promise.all([getLongestRunning([{ pageId: advertiser.pageId, name: advertiser.name }], 6), getCreativeMix(advertiser.pageId)])
    : [[] as LongAd[], null];
  const updated = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const busiest = weeks.reduce<{ weekStart: string; launched: number } | null>((b, w) => (!b || w.launched > b.launched ? w : b), null);

  // Plain-English read of the numbers: unique per brand and true on the day it renders.
  const takeaways = [
    longest[0] ? `Its longest-running live ad has been running for ${longest[0].days.toLocaleString("en-IN")} days. Brands switch off losing ads quickly, so this one is very likely working.` : "",
    mix?.hooks[0] ? `${mix.hooks[0].share}% of its recent ads open with a ${mix.hooks[0].label.toLowerCase()} hook${mix.hooks[1] ? `; ${mix.hooks[1].label.toLowerCase()} comes next (${mix.hooks[1].share}%)` : ""}.` : "",
    mix ? (mix.offerShare >= 50 ? `${mix.offerShare}% of its ads carry an offer: it leans on promotions.` : `Only ${mix.offerShare}% of its ads carry an offer: it sells on product, not discounts.`) : "",
    total ? `${pct(video, total)} of its ads are video${languages !== "–" ? `, mostly in ${languages}` : ""}.` : "",
    launched30d ? `It launched ${launched30d.toLocaleString("en-IN")} new ads in the last 30 days${busiest && busiest.launched ? `, with a peak of ${busiest.launched} in the week of ${new Date(busiest.weekStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}.` : total ? "It has not launched new ads in the last 30 days." : "",
  ].filter(Boolean);

  const facts = total
    ? [
        { q: `How many ads is ${name} running on Facebook and Instagram?`, a: `${name} has ${active.toLocaleString("en-IN")} ads live in India right now, out of ${total.toLocaleString("en-IN")} we have collected from Meta's public Ad Library. ${pct(video, total)} are video.` },
        ...(longest[0] ? [{ q: `What is ${name}'s longest-running ad?`, a: `A ${longest[0].format} ad that has been live for ${longest[0].days.toLocaleString("en-IN")} days${longest[0].text ? `: "${longest[0].text.slice(0, 90)}${longest[0].text.length > 90 ? "…" : ""}"` : ""}.` }] : []),
        { q: `Can I see ${name}'s ad spend?`, a: "No. Meta does not publish spend or results for commercial ads in India. Zooptrack shows what is public: every ad, how long it has run, its offer, hook, format and language." },
      ]
    : [];

  return (
    <main className={`${styles.page} zt-scope`}>
      <JsonLd
        graph={[
          { "@type": "WebPage", url: `${SITE_URL}${path}`, name: `${name} Facebook & Instagram ads`, inLanguage: "en-IN", dateModified: new Date().toISOString(), about: { "@type": "Brand", name } },
          breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Brand ads", path: "/brand" }, ...(industry ? [{ name: industry.name, path: `/industries/${industry.slug}` }] : []), { name, path }]),
          ...(facts.length ? [faqSchema(facts)] : []),
        ]}
      />
      <header className={styles.bar}>
        <BrandLogo />
        <nav className={styles.barNav} aria-label="Research">
          <Link href="/brand">Brands</Link>
          <Link href="/industries">Industries</Link>
          <Link href="/research">Research</Link>
          <Link className={styles.barCta} href={signup}>Track {name} free</Link>
        </nav>
      </header>

      <div className={styles.wrap}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/brand">Brands</Link>
          {industry ? <> / <Link href={`/industries/${industry.slug}`}>{industry.name}</Link></> : null} / {name}
        </nav>

        <section className={styles.head}>
          <div>
            <span className={styles.kicker}>Meta Ad Library · India · updated {updated}</span>
            <h1 className={styles.h1}>{name} ads on Facebook &amp; Instagram</h1>
            <p className={styles.lede}>
              {total
                ? `Every public ${name} ad we have collected, which ones have run longest, and what its creative is betting on.`
                : `We have not collected ${name}'s ads yet. Sign up and search ${name}: Zooptrack collects its public ads from Meta's Ad Library in about a minute.`}
            </p>
          </div>
          {total > 0 && (
            <dl className={styles.kpis}>
              <div><dt>Live now</dt><dd>{active.toLocaleString("en-IN")}</dd></div>
              <div><dt>Collected</dt><dd>{total.toLocaleString("en-IN")}</dd></div>
              <div><dt>New · 30 days</dt><dd>{launched30d.toLocaleString("en-IN")}</dd></div>
              <div><dt>Video</dt><dd>{pct(video, total)}</dd></div>
            </dl>
          )}
        </section>

        {longest.length > 0 && (
          <section aria-labelledby="winners">
            <div className={styles.sectionHead}>
              <h2 id="winners" className={styles.h2}>Running longest: {name}&apos;s likely winners</h2>
              <p>Still live today, sorted by how long they have run.</p>
            </div>
            <div className={styles.wall}>
              {longest.map((ad) => (
                <article key={ad.id} className={styles.tile}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ad.media} alt={`${name} ${ad.format} ad, live ${ad.days} days`} loading="lazy" />
                  <span className={styles.days}>Live {ad.days.toLocaleString("en-IN")} days</span>
                  {ad.text ? <p>{ad.text}</p> : null}
                </article>
              ))}
            </div>
          </section>
        )}

        {(takeaways.length > 0 || weeks.length > 0) && (
          <section className={styles.split}>
            {takeaways.length > 0 && (
              <div className={styles.panel}>
                <h2 className={styles.h2}>What the data says</h2>
                <ul className={styles.takeaways}>{takeaways.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}
            {weeks.length > 0 && (
              <div className={styles.panel}>
                <h2 className={styles.h2}>New ads per week</h2>
                <Launches weeks={weeks} />
                <p className={styles.caption}>Last {weeks.length} weeks. Spikes usually mean a launch or a sale.</p>
              </div>
            )}
          </section>
        )}

        {mix && (
          <section aria-labelledby="betting">
            <div className={styles.sectionHead}>
              <h2 id="betting" className={styles.h2}>What {name} is betting on</h2>
              <p>From AI labels on its {mix.decoded} most recent ads.</p>
            </div>
            <div className={styles.mixGrid}>
              <Mix title="Hook" rows={mix.hooks} />
              <Mix title="Angle" rows={mix.angles} />
              <Mix title="Visual style" rows={mix.visuals} />
              <Mix title="Language" rows={mix.languages} />
            </div>
          </section>
        )}

        {ads.length > 0 && (
          <section aria-labelledby="recent">
            <div className={styles.sectionHead}>
              <h2 id="recent" className={styles.h2}>Latest {name} ads</h2>
            </div>
            <div className={styles.grid}>
              {ads.map((ad, i) => (
                <article key={ad.id} className={`${styles.card} ${i >= 3 ? styles.locked : ""}`} aria-hidden={i >= 3}>
                  <div className={styles.media} style={{ backgroundImage: `url("${(ad.thumbnail_url ?? ad.image_url ?? "").replace(/"/g, "%22")}")` }}>
                    {ad.is_currently_active && <span className={styles.badge}>● Active</span>}
                  </div>
                  <div className={styles.body}>
                    <p className={styles.hook}>{hook(ad)}</p>
                    <span className={styles.meta}>
                      {ad.creative_type && ad.creative_type !== "unknown" ? ad.creative_type : "ad"}
                      {ad.first_seen_at ? ` · since ${new Date(ad.first_seen_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                    </span>
                  </div>
                </article>
              ))}
              {ads.length > 3 && (
                <div className={styles.gate}>
                  <strong>See all {total.toLocaleString("en-IN")} {name} ads</strong>
                  <p>Filter by language, region and format, get a daily or weekly report of what changed, and ask ZWIRK for counter-ad ideas.</p>
                  <Link className={styles.gateCta} href={signup}>Track {name} free</Link>
                </div>
              )}
            </div>
          </section>
        )}

        {!ads.length && (
          <p style={{ marginTop: 24 }}>
            <Link className={styles.gateCta} href={signup}>Search {name} in Zooptrack</Link>
          </p>
        )}

        {facts.length > 0 && (
          <section aria-labelledby="faq" className={styles.faq}>
            <h2 id="faq" className={styles.h2}>Questions about {name}&apos;s ads</h2>
            {facts.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </section>
        )}

        <section aria-labelledby="peers">
          <div className={styles.sectionHead}>
            <h2 id="peers" className={styles.h2}>{industry ? `Compare with other ${industry.noun}` : "Other D2C brands"}</h2>
            {industry ? <p><Link href={`/industries/${industry.slug}`}>See the live {industry.name.toLowerCase()} dashboard →</Link></p> : null}
          </div>
          <ul className={styles.list}>
            {peers.map((b) => (
              <li key={b}><Link href={`/brand/${brandSlug(b)}`}>{b}</Link></li>
            ))}
          </ul>
        </section>

        <p className={styles.note}>
          Method: Zooptrack collects every public ad this brand runs in India from Meta&apos;s Ad Library each night. &quot;Live&quot; means still running today; days are counted from when the ad started. Meta does not publish spend or results for these ads, so we never estimate them. <Link href="/research/india-d2c-advertising-report-2026">Full methodology</Link>
        </p>
      </div>
    </main>
  );
}
