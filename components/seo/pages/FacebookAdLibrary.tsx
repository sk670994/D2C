import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./FacebookAdLibrary.module.css";

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

export function FacebookAdLibrary({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.feed}>
        <div className={styles.feedRail}><span>08</span><span>FACEBOOK</span><span>AD LIBRARY</span></div>
        <div className={styles.feedMain}>
          <h1>Read the <em>feed.</em></h1><p>{entry.intro}</p>
          {["HOOK","OFFER","PROOF","CTA"].map((label,i)=><article key={label}><div className={styles.feedImage}><span>{label}</span><strong>{entry.focus[i%entry.focus.length]}</strong></div><div className={styles.feedCopy}><small>OBSERVATION {String(i+1).padStart(2,"0")}</small><h2>What is this ad asking the viewer to notice?</h2><p>Record the visible proposition, format and context before forming a hypothesis.</p></div></article>)}
        </div>
      </section>
      <section className={styles.footerNote}><span>USE IT AS EVIDENCE</span><h2>{entry.caveat}</h2></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}