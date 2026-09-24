/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/app/BrandLogo";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { getSearchFacets, type FacetResult } from "@/lib/ad-intelligence/global/facets";
import { brandSlug } from "@/lib/ad-intelligence/brand-slug";
import seed from "@/scripts/adspy-seed-brands.json";
import styles from "../brand.module.css";

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

  const storagePrefix = `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")}/storage/`;
  const ads = ((adsResult.data ?? []) as SampleAd[])
    .filter((a) => a.thumbnail_url || a.image_url)
    // Stored copies never expire, so prefer them on a cached public page.
    .sort((a, b) => Number((b.thumbnail_url ?? b.image_url ?? "").startsWith(storagePrefix)) - Number((a.thumbnail_url ?? a.image_url ?? "").startsWith(storagePrefix)))
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

export default async function BrandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { advertiser, facets, ads } = await load(slug);
  const name = advertiser?.name ?? nameFromSlug(slug);
  const next = advertiser ? `/adspy?q=${encodeURIComponent(advertiser.name)}&pid=${advertiser.pageId}` : `/adspy?q=${encodeURIComponent(name)}`;
  const signup = `/login?next=${encodeURIComponent(next)}`;
  const total = facets?.total ?? 0;
  const active = facets?.status.find((b) => b.value === "active")?.count ?? 0;
  const video = facets?.format.find((b) => b.value === "video")?.count ?? 0;
  const languages = (facets?.language ?? []).slice(0, 3).map((l) => l.label).join(", ") || "–";
  const others = (seed as { brands: string[] }).brands.filter((b) => norm(b) !== norm(name)).slice(0, 24);

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <BrandLogo />
        <Link className={styles.barCta} href={signup}>
          Try AdSpy free
        </Link>
      </header>
      <div className={styles.wrap}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/brand">Brands</Link> / {name}
        </nav>

        <section className={styles.hero}>
          <span className={styles.kicker}>Meta Ad Library · India</span>
          <h1 className={styles.h1}>{name} ads on Facebook &amp; Instagram</h1>
          <p className={styles.lede}>
            {total
              ? `We have indexed ${total.toLocaleString("en-IN")} public ads from ${name}. See what they are running now, which languages they use, and how often they launch new creatives.`
              : `We have not indexed ${name}'s ads yet. Sign up and search ${name} — AdSpy collects their public ads from Meta Ad Library in about a minute.`}
          </p>
          {total > 0 && (
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span>Ads indexed</span>
                <strong>{total.toLocaleString("en-IN")}</strong>
              </div>
              <div className={styles.stat}>
                <span>Live now</span>
                <strong>{pct(active, total)}</strong>
              </div>
              <div className={styles.stat}>
                <span>New in 30 days</span>
                <strong>{(facets?.momentum.launched30d ?? 0).toLocaleString("en-IN")}</strong>
              </div>
              <div className={styles.stat}>
                <span>Video share</span>
                <strong>{pct(video, total)}</strong>
              </div>
              <div className={styles.stat}>
                <span>Top languages</span>
                <strong title={languages}>{languages}</strong>
              </div>
            </div>
          )}
        </section>

        {ads.length > 0 && (
          <>
            <h2 className={styles.h2}>Recent {name} ads</h2>
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
                  <p>Filter by language, region and format, see weekly launches and long-running creatives, and get counter-ad ideas from ZWIRK.</p>
                  <Link className={styles.gateCta} href={signup}>
                    Unlock free
                  </Link>
                </div>
              )}
            </div>
          </>
        )}

        {!ads.length && (
          <p style={{ marginTop: 24 }}>
            <Link className={styles.gateCta} href={signup}>
              Search {name} in AdSpy
            </Link>
          </p>
        )}

        <h2 className={styles.h2}>Other D2C brands</h2>
        <ul className={styles.list}>
          {others.map((b) => (
            <li key={b}>
              <Link href={`/brand/${brandSlug(b)}`}>{b}</Link>
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          Data comes from Meta Ad Library, which is public. Meta does not publish spend or results for these ads, so Zooptrack does not estimate them.
        </p>
      </div>
    </main>
  );
}
