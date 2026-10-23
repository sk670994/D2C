import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./D2COfferTrends.module.css";

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

export function D2COfferTrends({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.ticker}><div className={styles.tickerTop}><span>32 / OFFER TRENDS</span><span>OBSERVATION TICKER</span></div><h1>Watch offers <i>move.</i></h1><p>{entry.intro}</p><div className={styles.tickerRows}>{["DISCOUNT","BUNDLE","GIFT","GUARANTEE","URGENCY","SUBSCRIPTION"].map((x,i)=><div key={x}><b>0{i+1}</b><strong>{x}</strong><span>{["20%","2 ×","FREE","30 DAYS","TODAY","MONTHLY"][i]}</span><em>{["↑","→","↑","→","↑","→"][i]}</em></div>)}</div></section>
      <section className={styles.tickerNote}><span>READING THE SIGNAL</span><h2>Offer visibility is not margin visibility.</h2><p>{entry.caveat}</p></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}