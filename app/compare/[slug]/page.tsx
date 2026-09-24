import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandLogo } from "@/components/app/BrandLogo";
import { COMPETITORS, PRICES_CHECKED, ZOOPTRACK, getCompetitor } from "@/lib/compare-data";
import styles from "../compare.module.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) return {};
  const title = `Zooptrack vs ${c.name} — which ad spy tool fits Indian D2C?`;
  const description = `Zooptrack vs ${c.name}: price (${c.price} vs free / ₹999), platforms, strengths and when to pick each. An honest comparison for Indian D2C brands.`;
  return {
    title,
    description,
    alternates: { canonical: `/compare/${c.slug}` },
    openGraph: { type: "article", siteName: "Zooptrack", locale: "en_IN", url: `/compare/${c.slug}`, title, description, images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
  };
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) notFound();

  const rows: Array<[string, string, string]> = [
    ["Price", ZOOPTRACK.price, c.price],
    ["Platforms", ZOOPTRACK.platforms, c.platforms],
    ["Best for", ZOOPTRACK.bestFor, c.bestFor],
  ];
  const others = COMPETITORS.filter((o) => o.slug !== c.slug);

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <BrandLogo />
        <Link className={styles.barCta} href="/login?next=%2Fadspy">
          Try AdSpy free
        </Link>
      </header>
      <div className={styles.wrap}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/compare">Compare</Link> / Zooptrack vs {c.name}
        </nav>
        <span className={styles.kicker}>Honest comparison</span>
        <h1 className={styles.h1}>
          Zooptrack vs {c.name}: <em>which one fits an Indian D2C brand?</em>
        </h1>
        <p className={styles.lede}>
          {c.name} is a solid tool for {c.bestFor.toLowerCase()}. Zooptrack is built for Indian D2C teams who want to see what competitors
          run on Facebook and Instagram — and what to do about it.
        </p>

        <h2 className={styles.h2}>At a glance</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col" className={styles.us}>Zooptrack</th>
              <th scope="col">{c.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, us, them]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className={styles.us}>{us}</td>
                <td>{them}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className={styles.h2}>What each does well</h2>
        <div className={styles.cols}>
          <section className={`${styles.box} ${styles.boxUs}`}>
            <h3>Where Zooptrack is different</h3>
            <ul>
              {c.differences.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </section>
          <section className={styles.box}>
            <h3>Where {c.name} is strong</h3>
            <ul>
              {c.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        </div>

        <h2 className={styles.h2}>What Zooptrack doesn&apos;t do (yet)</h2>
        <section className={styles.box}>
          <ul>
            {ZOOPTRACK.limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>

        <div className={styles.verdict}>
          <strong>Our take:</strong> pick {c.name} if {c.pickThemIf} Pick Zooptrack if you&apos;re an Indian D2C brand or agency that wants
          to track competitors on Meta, spot their new tests and long-running winners, and pay in rupees.
          <br />
          <Link className={styles.cta} href="/login?next=%2Fadspy">
            Search a competitor free
          </Link>
        </div>

        <h2 className={styles.h2}>Other comparisons</h2>
        <ul className={styles.links}>
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/compare/${o.slug}`}>Zooptrack vs {o.name}</Link>
            </li>
          ))}
          <li>
            <Link href="/brand">Browse Indian D2C brand ads</Link>
          </li>
        </ul>

        <p className={styles.note}>
          {c.name} prices and features are taken from public sources as of {PRICES_CHECKED} and may have changed — please check their
          website. {c.name} is a trademark of its owner; Zooptrack is not affiliated with it.
        </p>
      </div>
    </main>
  );
}
