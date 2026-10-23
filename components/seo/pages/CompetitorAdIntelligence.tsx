import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./CompetitorAdIntelligence.module.css";

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

export function CompetitorAdIntelligence({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.hero}><div className={styles.kicker}><span>COMPETITOR AD INTELLIGENCE</span><span>01 / 05</span></div><div className={styles.heroGrid}><div><h1>See what<br/>competitors<br/><em>keep putting</em><br/>into market.</h1><p>{entry.intro}</p><div className={styles.actions}><Link href="/brand">Browse brands ↗</Link><Link href="/login?next=%2Fadspy">Open AdSpy</Link></div></div><div className={styles.monitor}><div className={styles.monitorHead}><span>MARKET SIGNAL</span><span>LIVE RESEARCH VIEW</span></div><div className={styles.bigNumbers}><div><b>24</b><span>BRANDS</span></div><div><b>186</b><span>CREATIVES</span></div><div><b>17</b><span>CHANGES</span></div></div><div className={styles.bars}>{[34,48,31,61,54,72,46,83,69,91,77,96].map((h,i)=><i key={i} style={{height:`${h}%`}} />)}</div></div></div></section>
      <section className={styles.thesis}><span>01</span><h2>Intelligence is not more screenshots.</h2><p>It is a structured memory of what changed, what stayed, and which observations deserve a closer look.</p></section>
      <section className={styles.signal}><div><span>SIGNAL STACK</span><h2>Three things to inspect first.</h2></div><div>{entry.focus.map((x,i)=><article key={x}><b>0{i+1}</b><h3>{x}</h3><p>Tag visible evidence consistently across advertisers and dates.</p></article>)}</div></section>
      <section className={styles.board}><span>OBSERVATION BOARD</span><h2>Compare the visible moves.</h2><div className={styles.boardGrid}>{["NOVA SKIN","FORME","KIN THEORY","BARE LAB"].map((x,i)=><article key={x}><small>{x}</small><strong>{entry.focus[i%entry.focus.length]}</strong><span>{["UGC","FOUNDER","CAROUSEL","STATIC"][i]}</span><em>{["REPEATED","NEW","PERSISTENT","CHANGED"][i]}</em></article>)}</div></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}