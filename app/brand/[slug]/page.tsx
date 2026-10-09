/* eslint-disable @next/next/no-img-element */
import { fitTitle } from "@/lib/seo/site";
import type { Metadata } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/app/BrandLogo";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { getSearchFacets, type FacetResult } from "@/lib/ad-intelligence/global/facets";
import { brandSlug } from "@/lib/ad-intelligence/brand-slug";
import seed from "@/scripts/adspy-seed-brands.json";
import t from "@/components/seo/Themes.module.css";
import { AdTile } from "@/components/seo/MarketBits";
import { Faqs, FooterCta, Shell } from "@/components/seo/SeoChrome";
import type { CSSProperties } from "react";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, faqSchema, SITE_URL } from "@/lib/seo/schema";
import { fastMediaUrl, isStoredMediaUrl } from "@/lib/ad-intelligence/global/media-store";
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
    // Only stored copies (Supabase or R2): Meta's own image links expire, which would leave blank tiles on a cached page.
    .filter((a) => isStoredMediaUrl(a.thumbnail_url ?? a.image_url))
    .slice(0, 8);

  return { advertiser, facets, ads };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { advertiser, facets } = await load(slug);
  const name = advertiser?.name ?? nameFromSlug(slug);
  const count = facets?.total ? `${facets.total.toLocaleString("en-IN")} ` : "";
  const title = `${name} Ads on Facebook & Instagram`;
  const description = `See ${count}${name} ads running on Meta in India: hooks, offers, languages and new launches per week. Free competitor ad research for D2C brands.`;
  const url = `/brand/${brandSlug(name)}`;
  return {
    title: fitTitle(title),
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
    <div>
      <h3>{title}</h3>
      <div className={t.bars}>
        {rows.map((r) => (
          <div className={t.barRow} key={r.label}>
            <span>{r.label}</span>
            <span className={t.barTrack} aria-hidden="true"><span className={t.barFill} style={{ width: `${Math.max(3, r.share)}%` }} /></span>
            <span className={t.barVal}>{r.share}%</span>
          </div>
        ))}
      </div>
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

  const maxWeek = Math.max(1, ...weeks.map((w) => w.launched));

  return (
    <Shell theme="brand" path={path} dark>
      <JsonLd
        graph={[
          { "@type": "WebPage", url: `${SITE_URL}${path}`, name: `${name} Facebook & Instagram ads`, inLanguage: "en-IN", dateModified: new Date().toISOString(), about: { "@type": "Brand", name } },
          breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Brand ads", path: "/brand" }, ...(industry ? [{ name: industry.name, path: `/industries/${industry.slug}` }] : []), { name, path }]),
          ...(facts.length ? [faqSchema(facts)] : []),
        ]}
      />
      <div className={t.brandBand}>
        <nav className={t.crumbs} aria-label="Breadcrumb">
          <Link href="/brand">Brands</Link>
          {industry ? <> / <Link href={`/industries/${industry.slug}`}>{industry.name}</Link></> : null} / {name}
        </nav>
        <section className={t.brandHead}>
          <div>
            <h1 className={t.brandName}>{name}</h1>
            <p className={t.brandSub}>
              {total
                ? `Facebook and Instagram ads in India, collected from Meta's Ad Library. Updated ${updated}.`
                : `We have not collected ${name}'s ads yet. Sign up and search ${name}: Zooptrack collects its public ads in about a minute.`}
            </p>
          </div>
          {total > 0 && (
            <dl className={t.figures}>
              <div><dt>Live now</dt><dd>{active.toLocaleString("en-IN")}</dd></div>
              <div><dt>Collected</dt><dd>{total.toLocaleString("en-IN")}</dd></div>
              <div><dt>New in 30 days</dt><dd>{launched30d.toLocaleString("en-IN")}</dd></div>
              <div><dt>Video</dt><dd>{pct(video, total)}</dd></div>
            </dl>
          )}
        </section>
        {longest.length > 0 && (
          <div className={t.sheet} aria-label={`${name}'s longest-running live ads`}>
            {longest.map((ad) => <AdTile key={ad.id} ad={ad} eager showBrand={false} />)}
          </div>
        )}
      </div>

      <div className={t.wrap}>
        {(takeaways.length > 0 || weeks.length > 0) && (
          <section className={`${t.section} ${t.reads}`}>
            {takeaways.length > 0 && (
              <div>
                <h2 className={t.h2}>What the data says</h2>
                <ul className={t.points}>{takeaways.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            )}
            {weeks.length > 0 && (
              <div>
                <h2 className={t.h2}>New ads per week</h2>
                <p className={t.sub}>Last {weeks.length} weeks; this week in marigold. Spikes usually mean a launch or a sale.</p>
                <div className={t.weeks} role="img" aria-label={`New ads per week: ${weeks.map((w) => w.launched).join(", ")}`}>
                  {weeks.map((w) => <span key={w.weekStart} title={`Week of ${w.weekStart}: ${w.launched}`} style={{ height: `${Math.max(2, (w.launched / maxWeek) * 100)}%` }} />)}
                </div>
              </div>
            )}
          </section>
        )}

        {mix && (
          <section className={t.section}>
            <h2 className={t.h2}>What {name} is betting on</h2>
            <p className={t.sub}>From AI labels on its {mix.decoded} most recent ads. {mix.offerShare}% of them carry an offer.</p>
            <div className={t.mixes}>
              <Mix title="Hook" rows={mix.hooks} />
              <Mix title="Angle" rows={mix.angles} />
              <Mix title="Visual style" rows={mix.visuals} />
              <Mix title="Language" rows={mix.languages} />
            </div>
          </section>
        )}

        {ads.length > 0 && (
          <section className={t.section}>
            <h2 className={t.h2}>Latest {name} ads</h2>
            <p className={t.sub}>Newest first.</p>
            <div className={t.gallery}>
              {ads.map((ad, i) => (
                <div key={ad.id} className={i >= 4 ? t.locked : undefined} aria-hidden={i >= 4}>
                  <span className={t.tile}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fastMediaUrl(ad.thumbnail_url ?? ad.image_url)} width={320} height={320} alt={`${name} ${ad.creative_type ?? ""} ad`} loading="lazy" decoding="async" />
                    {ad.is_currently_active ? <span className={t.stamp}>Live</span> : null}
                    <span className={t.tileText}>{hook(ad)}</span>
                  </span>
                </div>
              ))}
              {ads.length > 4 && (
                <div className={t.gate}>
                  <strong>See all {total.toLocaleString("en-IN")} {name} ads</strong>
                  <p>Filter by language, region and format, get a daily or weekly report of what changed, and ask ZWIRK for counter-ad ideas.</p>
                  <Link className={t.btn} href={signup}>Track {name} free</Link>
                </div>
              )}
            </div>
          </section>
        )}

        {!ads.length && (
          <p className={t.section}><Link className={t.btn} href={signup}>Search {name} in Zooptrack</Link></p>
        )}
      </div>

      <Faqs faqs={facts} title={`Questions about ${name}'s ads`} />

      <section className={`${t.wrap} ${t.section}`}>
        <h2 className={t.h2}>{industry ? `Compare with other ${industry.noun}` : "Other D2C brands"}</h2>
        {industry ? <p className={t.sub}><Link href={`/industries/${industry.slug}`} style={{ color: industry.hue, fontWeight: 700 }}>Open the live {industry.name.toLowerCase()} dashboard</Link></p> : null}
        <ul className={t.chips} style={industry ? ({ "--cat": industry.hue } as CSSProperties) : undefined}>
          {peers.map((b) => <li key={b}><Link href={`/brand/${brandSlug(b)}`}>{b}</Link></li>)}
        </ul>
        <p className={t.note} style={{ marginTop: 28 }}>
          How we measure: Zooptrack collects every public ad this brand runs in India from Meta&apos;s Ad Library each night. Live means still running today; days are counted from when the ad started. Meta does not publish spend or results for these ads, so we never estimate them. <Link href="/research/india-d2c-advertising-report-2026">Full methodology</Link>
        </p>
      </section>

      <FooterCta title={`Track ${name} and your other rivals.`} copy="Get a daily or weekly report of what they changed: new launches, offers and the ads they keep paying for." />
    </Shell>
  );
}
