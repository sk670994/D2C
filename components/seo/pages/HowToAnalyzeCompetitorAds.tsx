import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./HowToAnalyzeCompetitorAds.module.css";

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

export function HowToAnalyzeCompetitorAds({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.blueprint}><span>13 / CREATIVE TEARDOWN</span><h1>Take the ad apart.</h1><div className={styles.adFrame}><div className={styles.adVisual}><small>CREATIVE</small><strong>THE FIRST 3 SECONDS.</strong></div><div className={styles.annotations}>{["Hook","Promise","Proof","Offer","CTA"].map((x,i)=><div key={x}><b>{i+1}</b><span>{x}</span><p>{entry.focus[i%entry.focus.length]}</p></div>)}</div></div></section>
      <section className={styles.teardown}><div><span>TEARDOWN ORDER</span><h2>Read top to bottom.</h2></div><ol>{["Hook","Problem or desire","Product proof","Offer","Action"].map((x,i)=><li key={x}><b>0{i+1}</b><strong>{x}</strong></li>)}</ol></section>
      <section className={styles.boundary}><span>EVIDENCE BOUNDARY</span><p>{entry.caveat}</p></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}