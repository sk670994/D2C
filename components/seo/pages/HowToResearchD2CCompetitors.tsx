import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./HowToResearchD2CCompetitors.module.css";

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

export function HowToResearchD2CCompetitors({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.mapHero}><span>15 / COMPETITOR MAP</span><h1>Map the <em>arena.</em></h1><p>{entry.intro}</p><div className={styles.mapBoard}>{["PRICE","POSITIONING","OFFER","CREATIVE","CHANNEL","PROOF"].map((x,i)=><div key={x} className={styles.mapNode} style={{top:`${12+(i*13)%72}%`,left:`${10+(i*17)%78}%`}}>{x}</div>)}</div></section>
      <section className={styles.researchLanes}>{entry.focus.map((x,i)=><div key={x}><span>LANE 0{i+1}</span><h2>{x}</h2><p>Use one comparable dimension to keep the competitor map meaningful.</p></div>)}</section>
      <section className={styles.nudge}><strong>METHOD NOTE</strong><p>{entry.caveat}</p></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}