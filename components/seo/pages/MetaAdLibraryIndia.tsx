import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./MetaAdLibraryIndia.module.css";

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

export function MetaAdLibraryIndia({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.india}><div className={styles.location}><span>10 / INDIA</span><strong>IN</strong></div><div className={styles.copy}><span>META AD LIBRARY / INDIA</span><h1>One market. Many <i>languages.</i></h1><p>{entry.intro}</p></div><div className={styles.map}><span className={`${styles.pin} ${styles.p1}`}>NORTH</span><span className={`${styles.pin} ${styles.p2}`}>WEST</span><span className={`${styles.pin} ${styles.p3}`}>SOUTH</span><span className={`${styles.pin} ${styles.p4}`}>EAST</span><div className={styles.country}>INDIA</div></div></section>
      <section className={styles.localeGrid}>{["ENGLISH","HINDI","HINGLISH","REGIONAL","OFFER","FORMAT"].map((x,i)=><div key={x}><small>0{i+1}</small><h2>{x}</h2><p>Compare the visible signal inside its market and language context.</p></div>)}</section>
      <section className={styles.note}><span>LOCAL CONTEXT</span><h2>Localization is an observation, not an assumption.</h2><p>{entry.caveat}</p></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}