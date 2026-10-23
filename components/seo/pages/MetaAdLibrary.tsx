import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./MetaAdLibrary.module.css";

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

export function MetaAdLibrary({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.library}>
        <div className={styles.title}><span>07 / META AD LIBRARY</span><h1>A library is useful when you know <i>what to look for.</i></h1><p>{entry.intro}</p></div>
        <div className={styles.facets}>
          <span>ADVERTISER</span><b>Beauty / D2C</b><span>DATE RANGE</span><b>30 DAYS</b><span>FORMAT</span><b>ALL</b><span>REGION</span><b>INDIA</b>
        </div>
        <div className={styles.evidenceWall}>
          {[1,2,3,4,5,6].map((n)=><article key={n}><div className={styles.poster}><small>PUBLIC AD / {String(n).padStart(2,"0")}</small><strong>{entry.focus[(n-1)%entry.focus.length]}</strong></div><p>Creative evidence · observed date required</p></article>)}
        </div>
      </section>
      <section className={styles.lesson}><div><span>RESEARCH RULE</span><h2>Search first. Interpret later.</h2></div><ol>{entry.focus.map((x,i)=><li key={x}><b>{i+1}</b><span>{x}</span></li>)}</ol></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}