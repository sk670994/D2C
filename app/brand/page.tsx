import type { Metadata } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/app/BrandLogo";
import { brandSlug } from "@/lib/ad-intelligence/brand-slug";
import { INDUSTRIES } from "@/lib/seo/industries";
import seed from "@/scripts/adspy-seed-brands.json";
import styles from "./brand.module.css";

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
    <main className={`${styles.page} zt-scope`}>
      <header className={styles.bar}>
        <BrandLogo />
        <nav className={styles.barNav} aria-label="Research">
          <Link href="/industries">Industries</Link>
          <Link href="/research">Research</Link>
          <Link className={styles.barCta} href="/login?next=%2Fadspy">Track a brand free</Link>
        </nav>
      </header>
      <div className={styles.wrap}>
        <section className={styles.hero}>
          <span className={styles.kicker}>Competitor ad library · India</span>
          <h1 className={styles.h1}>The Meta ads of {all.length} Indian D2C brands</h1>
          <p className={styles.lede}>
            Pick a brand to see its longest-running Facebook and Instagram ads, what its creative is betting on and how often it launches. Collected every night from Meta&apos;s public Ad Library.
          </p>
        </section>
        <div className={styles.groups}>
          {INDUSTRIES.map((i) => (
            <div key={i.slug} className={styles.group}>
              <h2><Link href={`/industries/${i.slug}`}>{i.name}</Link></h2>
              <p>{i.brands.length} brands · <Link href={`/industries/${i.slug}`}>category dashboard</Link></p>
              <ul className={styles.list}>
                {i.brands.map((b) => (
                  <li key={b}><Link href={`/brand/${brandSlug(b)}`}>{b}</Link></li>
                ))}
              </ul>
            </div>
          ))}
          {other.length > 0 && (
            <div className={styles.group}>
              <h2>More brands</h2>
              <ul className={styles.list}>
                {other.map((b) => (
                  <li key={b}><Link href={`/brand/${brandSlug(b)}`}>{b}</Link></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
