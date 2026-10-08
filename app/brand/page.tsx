import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { Shell } from "@/components/seo/SeoChrome";
import t from "@/components/seo/Themes.module.css";
import { brandSlug } from "@/lib/ad-intelligence/brand-slug";
import { INDUSTRIES } from "@/lib/seo/industries";
import seed from "@/scripts/adspy-seed-brands.json";

export const metadata: Metadata = {
  title: "Indian D2C brand ads on Facebook & Instagram",
  description:
    "Browse the Meta ads of 145 Indian D2C brands across 15 categories: their longest-running ads, hooks, offers, languages and weekly launches. Updated every night.",
  alternates: { canonical: "/brand" },
};

export default function BrandIndexPage() {
  const all = (seed as { brands: string[] }).brands;
  const grouped = new Set(INDUSTRIES.flatMap((i) => i.brands));
  const other = all.filter((b) => !grouped.has(b));
  return (
    <Shell theme="hub" path="/brand">
      <header className={t.hubHead}>
        <h1>The ads of {all.length} Indian D2C brands</h1>
        <p className={t.lede}>
          Pick a brand to see its longest-running Facebook and Instagram ads, what its creative is betting on and how often it launches. Collected every night from Meta&apos;s public Ad Library.
        </p>
      </header>
      <div className={t.wrap}>
        {INDUSTRIES.map((i) => (
          <section key={i.slug} className={t.section} style={{ marginTop: 44 }}>
            <h2 className={t.h2}>
              <Link href={`/industries/${i.slug}`} style={{ textDecoration: "none" }}>
                <i style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: i.hue, marginRight: 12, verticalAlign: 3 }} />
                {i.name}
              </Link>
            </h2>
            <ul className={t.chips} style={{ "--cat": i.hue } as CSSProperties}>
              {i.brands.map((b) => <li key={b}><Link href={`/brand/${brandSlug(b)}`}>{b}</Link></li>)}
            </ul>
          </section>
        ))}
        {other.length > 0 && (
          <section className={t.section} style={{ marginTop: 44 }}>
            <h2 className={t.h2}>More brands</h2>
            <ul className={t.chips}>
              {other.map((b) => <li key={b}><Link href={`/brand/${brandSlug(b)}`}>{b}</Link></li>)}
            </ul>
          </section>
        )}
      </div>
    </Shell>
  );
}
