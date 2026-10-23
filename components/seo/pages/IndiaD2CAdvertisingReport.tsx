import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./IndiaD2CAdvertisingReport.module.css";

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

export function IndiaD2CAdvertisingReport({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.report}><div className={styles.cover}><span>30 / RESEARCH PUBLICATION</span><small>2026 EDITION</small><h1>India D2C<br/><i>Advertising</i><br/>Report</h1><p>{entry.intro}</p></div><aside><b>CONTENTS</b>{["Scope","Sample","Method","Observations","Limits"].map((x,i)=><span key={x}>0{i+1} / {x}</span>)}</aside></section>
      <section className={styles.reportBody}><div className={styles.metric}><span>SCOPE</span><strong>PUBLIC AD EVIDENCE</strong></div><div className={styles.chapters}>{["Define the sample before the claim.","Publish the collection window.","Separate observation from interpretation.","Make limitations visible."].map((x,i)=><article key={x}><small>CHAPTER 0{i+1}</small><h2>{x}</h2><p>Research becomes more credible when the reader can see how the finding was produced.</p></article>)}</div></section>
      <section className={styles.disclaimer}>{entry.caveat}</section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}