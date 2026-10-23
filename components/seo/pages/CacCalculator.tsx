import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import { SeoCalculator } from "@/components/seo/SeoCalculator";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./CacCalculator.module.css";

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

export function CacCalculator({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.invoice}><div className={styles.invoiceTop}><span>23 / ACQUISITION LEDGER</span><span>CALCULATION / 03</span></div><h1>What did each new customer <em>cost?</em></h1><div className={styles.ledger}><div><span>ACQUISITION SPEND</span><strong>₹ 1,00,000</strong></div><div><span>NEW CUSTOMERS</span><strong>400</strong></div><div><span>BLENDED CAC</span><strong>₹ 250</strong></div></div></section>
      <section className={styles.calc}>{entry.calculator ? <SeoCalculator type={entry.calculator} /> : null}</section>
      <section className={styles.footerText}><span>CONTEXT</span><h2>A blended number can hide very different channels and cohorts.</h2><p>{entry.caveat}</p></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}