import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./D2CAdIntelligence.module.css";

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

export function D2CAdIntelligence({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.sky}>
        <div className={styles.skyHead}><span>04 / SIGNAL RADAR</span><span>PUBLIC OBSERVATIONS</span></div>
        <h1>Find the signal <em>inside the noise.</em></h1>
        <p>{entry.intro}</p>
        <div className={styles.radar}>
          <div className={`${styles.ring} ${styles.r1}`}></div><div className={`${styles.ring} ${styles.r2}`}></div><div className={`${styles.ring} ${styles.r3}`}></div>
          {entry.focus.map((x,i)=><b key={x} className={`${styles.node} ${styles["n"+i]}`}>{x}</b>)}
        </div>
      </section>
      <section className={styles.stats}>
        <div><strong>24</strong><span>ADVERTISERS</span></div><div><strong>186</strong><span>VISIBLE CREATIVES</span></div><div><strong>17</strong><span>OBSERVED CHANGES</span></div><div><strong>03</strong><span>RESEARCH LAYERS</span></div>
      </section>
      <section className={styles.grid}><div><span>SIGNAL STACK</span><h2>Classify before interpreting.</h2></div><div className={styles.stack}>{entry.focus.map((x,i)=><article key={x}><b>0{i+1}</b><h3>{x}</h3><p>Tag the visible evidence consistently so comparisons stay comparable.</p></article>)}</div></section>
      <section className={styles.dark}><span>BOUNDARY</span><h2>Intelligence needs a line around what you do not know.</h2><p>{entry.caveat}</p></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}