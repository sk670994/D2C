import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import { SeoCalculator } from "@/components/seo/SeoCalculator";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./RoasCalculator.module.css";

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

export function RoasCalculator({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.cockpit}><div className={styles.cockpitTop}><span>21 / UNIT ECONOMICS</span><span>INSTRUMENT 01</span></div><h1>ROAS without the <em>mystery.</em></h1><p>{entry.intro}</p><div className={styles.instrument}><div><span>INPUT → OUTPUT</span><h2>Ad spend × revenue.</h2><p>Use the calculator below with inputs from the same period and definition.</p></div><div className={styles.screen}><div>REVENUE</div><strong>₹ 1,00,000</strong><hr/><div>AD SPEND</div><strong>₹ 25,000</strong><hr/><b>ROAS 4.00×</b></div></div></section>
      <section className={styles.calc}>{entry.calculator ? <SeoCalculator type={entry.calculator} /> : null}</section>
      <section className={styles.definition}><span>INTERPRETATION</span><h2>Arithmetic is the start. Economics are the context.</h2><p>{entry.caveat}</p></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}