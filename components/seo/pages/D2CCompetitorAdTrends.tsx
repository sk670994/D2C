import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./D2CCompetitorAdTrends.module.css";

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

export function D2CCompetitorAdTrends({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.calendar}><div className={styles.calendarHead}><span>34 / COMPETITOR TRENDS</span><span>CALENDAR VIEW</span></div><h1>Remember what <em>changed.</em></h1><p>{entry.intro}</p><div className={styles.month}><div className={styles.monthTitle}>SEPTEMBER 2026</div><div className={styles.week}>{["MON","TUE","WED","THU","FRI","SAT","SUN"].map(x=><b key={x}>{x}</b>)}</div><div className={styles.days}>{Array.from({length:30},(_,i)=><div key={i} className={i%7===2||i%7===5?styles.active:""}><span>{i+1}</span>{i%7===2?<strong>NEW</strong>:null}{i%7===5?<strong>OFFER</strong>:null}</div>)}</div></div></section>
      <section className={styles.trendRead}><div><span>CHANGE LOGIC</span><h2>Trend means a pattern across time.</h2></div><p>{entry.caveat}</p></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}