import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./AdSpyForD2C.module.css";

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

export function AdSpyForD2C({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.console}>
        <div className={styles.consoleBar}><span>ADSPY / D2C</span><span>SEARCH / FILTER / SAVE</span></div>
        <div className={styles.search}><span>⌕</span><strong>Find competitor ads</strong><i>beauty / skincare / India</i></div>
        <div className={styles.filters}>{["INDIA","ACTIVE","VIDEO","OFFER","UGC"].map(x=><span key={x}>{x} ×</span>)}</div>
        <div className={styles.cards}>{["NOVA SKIN","FORME","KIN THEORY","BARE LAB"].map((x,i)=><article key={x}><div className={styles.thumb}>{["01","02","03","04"][i]}</div><div><small>{x}</small><h2>{entry.focus[i%entry.focus.length]}</h2><p>Public creative observation</p></div></article>)}</div>
      </section>
      <section className={styles.copy}><span>DISCOVERY LOGIC</span><h1>Search is only the beginning.</h1><p>{entry.intro}</p></section>
      <section className={styles.cols}>{entry.focus.map((x,i)=><div key={x}><b>0{i+1}</b><h2>{x}</h2><p>Filter the research universe before making comparisons.</p></div>)}</section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}