import type { Metadata } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/app/BrandLogo";
import { brandSlug } from "@/lib/ad-intelligence/brand-slug";
import seed from "@/scripts/adspy-seed-brands.json";
import styles from "./brand.module.css";

export const metadata: Metadata = {
  title: "Indian D2C brand ads on Facebook & Instagram",
  description:
    "Browse the Meta ads of India's leading D2C brands — beauty, wellness, fashion, food and more. See hooks, offers, languages and weekly launches.",
  alternates: { canonical: "/brand" },
};

export default function BrandIndexPage() {
  const brands = [...(seed as { brands: string[] }).brands].sort((a, b) => a.localeCompare(b));
  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <BrandLogo />
        <Link className={styles.barCta} href="/login?next=%2Fadspy">
          Try AdSpy free
        </Link>
      </header>
      <div className={styles.wrap}>
        <section className={styles.hero}>
          <span className={styles.kicker}>Competitor ad library</span>
          <h1 className={styles.h1}>Ads of India&apos;s top D2C brands</h1>
          <p className={styles.lede}>
            Pick a brand to see the Facebook and Instagram ads it runs, the languages it uses and how often it launches new
            creatives. Updated every night from Meta Ad Library.
          </p>
        </section>
        <h2 className={styles.h2}>{brands.length} brands</h2>
        <ul className={styles.list}>
          {brands.map((b) => (
            <li key={b}>
              <Link href={`/brand/${brandSlug(b)}`}>{b}</Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
