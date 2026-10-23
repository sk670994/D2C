import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./MetaAdLibraryForD2C.module.css";

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

export function MetaAdLibraryForD2C({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.toolkit}><div className={styles.toolHead}><span>16 / D2C TOOLKIT</span><h1>Turn the library into a <i>weekly ritual.</i></h1><p>{entry.intro}</p></div><div className={styles.toolGrid}>{["MONDAY","WEDNESDAY","FRIDAY"].map((x,i)=><article key={x}><b>{x}</b><strong>{["Discovery","Comparison","Decision"][i]}</strong><p>{["Find new advertiser activity.","Compare new and persistent creative.","Write what should be tested or watched."][i]}</p></article>)}</div></section>
      <section className={styles.protocol}><span>RESEARCH PROTOCOL</span>{entry.focus.map((x,i)=><div key={x}><b>0{i+1}</b><strong>{x}</strong><span>VISIBLE SIGNAL</span></div>)}</section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}