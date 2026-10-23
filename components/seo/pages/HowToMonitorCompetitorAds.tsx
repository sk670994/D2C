import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./HowToMonitorCompetitorAds.module.css";

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

export function HowToMonitorCompetitorAds({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.timelineHero}><span>14 / MONITORING TIMELINE</span><h1>Watch the market <i>change.</i></h1><p>{entry.intro}</p></section>
      <section className={styles.monitor}><div className={styles.monitorHead}><span>CHANGE LOG</span><span>30 DAY WINDOW</span></div>{["03 SEP","07 SEP","14 SEP","21 SEP","27 SEP"].map((d,i)=><article key={d}><time>{d}</time><div className={styles.dot}></div><div><b>{["NEW CREATIVE","OFFER CHANGE","NEW FORMAT","PERSISTENCE","RESEARCH QUESTION"][i]}</b><h2>{entry.focus[i%entry.focus.length]}</h2><p>Record the visible change and what it might require you to investigate next.</p></div></article>)}</section>
      <section className={styles.cadence}><span>CADENCE</span><h2>Monitor what can actually change a decision.</h2><p>{entry.caveat}</p></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}