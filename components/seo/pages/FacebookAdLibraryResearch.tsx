import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./FacebookAdLibraryResearch.module.css";

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

export function FacebookAdLibraryResearch({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.archivePage}><div className={styles.archiveMast}><span>17 / FACEBOOK ARCHIVE</span><h1>Research the <em>record.</em></h1><p>{entry.intro}</p></div><div className={styles.folders}>{["CREATIVE","COPY","OFFER","FORMAT"].map((x,i)=><div key={x}><b>FOLDER 0{i+1}</b><h2>{x}</h2><span>12 observations</span></div>)}</div></section>
      <section className={styles.index}><span>INDEX CARD</span><div className={styles.card}><h2>NOVA SKIN / 03 SEP</h2><p><b>OBSERVED:</b> {entry.focus[0]}</p><p><b>FORMAT:</b> Video</p><p><b>OFFER:</b> 20% off</p><hr/><p><b>NOTE:</b> Keep observable evidence separate from inferred performance.</p></div></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}