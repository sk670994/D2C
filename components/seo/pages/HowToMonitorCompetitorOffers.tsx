import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./HowToMonitorCompetitorOffers.module.css";

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

export function HowToMonitorCompetitorOffers({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.offerHero}><span>20 / OFFER WATCH</span><h1>Watch what <i>moves.</i></h1><p>{entry.intro}</p></section>
      <section className={styles.offerBoard}><div className={styles.boardHeader}><b>MECHANIC</b><b>VISIBLE EXAMPLE</b><b>QUESTION</b></div>{["Discount","Bundle","Gift","Guarantee","Urgency"].map((x,i)=><div className={styles.boardRow} key={x}><strong>{x}</strong><span>{["20% off","2 for 1","Free sample","30-day guarantee","Ends tonight"][i]}</span><p>What changed, and does it warrant a response?</p></div>)}</section>
      <section className={styles.economics}><span>ECONOMIC GUARDRAIL</span><h2>Observe the offer. Check your numbers separately.</h2><p>{entry.caveat}</p></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}