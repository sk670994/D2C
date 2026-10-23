import Link from "next/link";
import { Fragment } from "react";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./MetaAdLibraryCompetitorResearch.module.css";

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

export function MetaAdLibraryCompetitorResearch({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.archive}>
        <div className={styles.archiveTop}><span>06 / PUBLIC ARCHIVE</span><span>SEARCH INDEX</span></div>
        <div className={styles.query}>competitor / India / active ads <b>SEARCH</b></div>
        <div className={styles.results}>
          {["Advertiser","Creative","Format","Observed"].map((h)=><span key={h}>{h}</span>)}
          {["NOVA SKIN","FORME","KIN THEORY","BARE LAB","MINT THEORY","ORIGIN LAB"].map((x,i)=><Fragment key={x}><strong>{x}</strong><span>{entry.focus[i%entry.focus.length]}</span><span>{["VIDEO","CAROUSEL","STATIC"][i%3]}</span><em>{`${3+i} DAYS`}</em></Fragment>)}
        </div>
      </section>
      <section className={styles.definition}><span>ARCHIVE METHOD</span><h1>Make public advertising searchable in your own head.</h1><p>{entry.intro}</p></section>
      <section className={styles.method}><div><b>01</b><h2>Identify</h2><p>Confirm the advertiser before comparison.</p></div><div><b>02</b><h2>Capture</h2><p>Record visible creative and the observation date.</p></div><div><b>03</b><h2>Compare</h2><p>Keep the same fields across advertisers.</p></div></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}