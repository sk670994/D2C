import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./D2CCompetitorAnalysis.module.css";

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

export function D2CCompetitorAnalysis({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.mast}>
        <span>03 / COMPETITIVE FIELD</span>
        <h1>See the market as a <i>board.</i></h1>
        <p>{entry.intro}</p>
      </section>
      <section className={styles.boardWrap}>
        <div className={styles.axis}>
          <b>MESSAGE</b><b>OFFER</b><b>CREATIVE</b><b>PROOF</b>
        </div>
        <div className={styles.board}>
          {["NOVA SKIN","FORME","KIN THEORY","BARE LAB"].map((brand, i)=>(
            <article key={brand}>
              <small>BRAND 0{i+1}</small><h2>{brand}</h2>
              <span>{entry.focus[i % entry.focus.length]}</span>
              <strong>{["Routine","Bundle","Proof","Drop"][i]}</strong>
              <em>{["UGC","FOUNDER","CAROUSEL","STATIC"][i]}</em>
              <p>Observed advertising signal; private business metrics remain unknown.</p>
            </article>
          ))}
        </div>
      </section>
      <section className={styles.move}>
        <div><span>MARKET MOVE</span><h2>What is repeating across the field?</h2></div>
        <div className={styles.moveList}>{entry.focus.map((x,i)=><div key={x}><b>0{i+1}</b><strong>{x}</strong><span>compare across advertisers and dates</span></div>)}</div>
      </section>
      <section className={styles.note}><span>DECISION NOTE</span><h2>Observation first. Hypothesis second.</h2><p>{entry.caveat}</p></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}