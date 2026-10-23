import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./HowToFindCompetitorAds.module.css";

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

export function HowToFindCompetitorAds({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.casefile}><div className={styles.caseTop}><span>12 / CASE FILE</span><b>STATUS: OPEN</b></div><h1>Find the right advertiser <em>before the ad.</em></h1><div className={styles.dossier}><div><span>CLUE 01</span><strong>Brand identity</strong><p>Match the public advertiser to the business you mean to research.</p></div><div><span>CLUE 02</span><strong>Creative context</strong><p>Check the visible message, format and product.</p></div><div><span>CLUE 03</span><strong>Time</strong><p>Capture when you observed it for later comparison.</p></div></div></section>
      <section className={styles.checklist}><h2>Investigation checklist</h2>{["Business name","Advertiser identity","Creative match","Offer","Observed date"].map((x,i)=><div key={x}><b>{i+1}</b><span>{x}</span><i>□</i></div>)}</section>
      <section className={styles.warning}><span>DON'T OVERREAD THE CLUE</span><h2>{entry.caveat}</h2></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}