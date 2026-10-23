import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import { SeoCalculator } from "@/components/seo/SeoCalculator";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./ContributionMargin.module.css";

function Header({ label }: { label: string }) {
  return (
    <header className={base.header}>
      <Link href="/" aria-label="Zooptrack home" className={base.logo}>
        <ZooptrackLogo height={30} tone="blue" priority />
      </Link>
      <nav aria-label="SEO navigation">
        <span>{label}</span>
        <Link href="/brand">Brands</Link>
        <Link href="/guides">Guides</Link>
        <Link href="/tools">Tools</Link>
        <Link href="/login">Try Zooptrack</Link>
      </nav>
    </header>
  );
}

function FAQ({ entry }: { entry: SeoEntry }) {
  return (
    <section className={base.faq}>
      <div className={base.faqTitle}><span>FAQ</span><h2>Questions worth answering.</h2></div>
      <div className={base.faqList}>
        {entry.faqs.map((faq) => (
          <details key={faq.q}>
            <summary>{faq.q}<b>+</b></summary>
            <p>{faq.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className={base.footer}>
      <div><span>ZOOPTRACK</span><h2>Research the market. Remember what changed.</h2></div>
      <Link href="/login">Open Zooptrack →</Link>
    </footer>
  );
}

export function ContributionMargin({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.waterfall}><span>24 / CONTRIBUTION WATERFALL</span><h1>See what is <i>left.</i></h1><p>{entry.intro}</p><div className={styles.flow}><div className={styles.revenue}><b>REVENUE</b><strong>₹100</strong></div><div className={styles.flowArrow}>−</div><div className={styles.cost}><b>VARIABLE COSTS</b><strong>₹60</strong></div><div className={styles.flowArrow}>=</div><div className={styles.margin}><b>CONTRIBUTION</b><strong>₹40</strong></div></div></section>
      <section className={styles.calc}>{entry.calculator ? <SeoCalculator type={entry.calculator} /> : null}</section>
      <section className={styles.definition}><span>DEFINITION</span><h2>Your margin only works when the cost definition stays consistent.</h2><p>{entry.caveat}</p></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}