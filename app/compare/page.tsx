import type { Metadata } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/app/BrandLogo";
import { COMPETITORS, PRICES_CHECKED, ZOOPTRACK } from "@/lib/compare-data";
import styles from "./compare.module.css";

export const metadata: Metadata = {
  title: "Zooptrack vs other ad spy tools — honest comparison for Indian D2C",
  description:
    "How Zooptrack compares with Meta Ad Library, Foreplay, AdSpy, BigSpy, PowerAdSpy and Minea for Indian D2C brands: price, coverage and what each is best at.",
  alternates: { canonical: "/compare" },
};

export default function CompareIndexPage() {
  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <BrandLogo />
        <Link className={styles.barCta} href="/login?next=%2Fadspy">
          Try AdSpy free
        </Link>
      </header>
      <div className={styles.wrap}>
        <span className={styles.kicker}>Compare</span>
        <h1 className={styles.h1}>
          Picking an ad spy tool? <em>Here&apos;s the honest version.</em>
        </h1>
        <p className={styles.lede}>
          Every tool below is good at something. Zooptrack is built for one job: helping Indian D2C brands see what competitors run on
          Facebook and Instagram, and decide what to test next — priced in rupees.
        </p>

        <h2 className={styles.h2}>Zooptrack vs…</h2>
        <div className={styles.grid}>
          {COMPETITORS.map((c) => (
            <Link key={c.slug} href={`/compare/${c.slug}`} className={styles.card}>
              <strong>{c.name}</strong>
              <span>{c.bestFor}</span>
              <span>{c.price}</span>
              <em>See comparison →</em>
            </Link>
          ))}
        </div>

        <h2 className={styles.h2}>What you get with Zooptrack</h2>
        <section className={`${styles.box} ${styles.boxUs}`}>
          <ul>
            {ZOOPTRACK.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <p className={styles.note}>
          Competitor prices are their public starting prices as of {PRICES_CHECKED} and may change — check their websites for current
          plans. All product names belong to their owners.
        </p>
      </div>
    </main>
  );
}
