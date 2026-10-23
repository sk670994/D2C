import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./HowToUseMetaAdLibrary.module.css";

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

export function HowToUseMetaAdLibrary({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.playbook}><div><span>11 / PLAYBOOK</span><h1>Use the library like a researcher.</h1><p>{entry.intro}</p></div><div className={styles.steps}>{["Frame the question","Search the advertiser","Capture the evidence","Write the next question"].map((x,i)=><article key={x}><b>0{i+1}</b><h2>{x}</h2><p>{["Define one thing you want to learn.","Confirm identity before comparing ads.","Keep source, date and visible properties together.","Turn the observation into a hypothesis or test."][i]}</p></article>)}</div></section>
      <section className={styles.rules}><span>FIELD RULES</span><h2>Four habits that prevent research drift.</h2><ul>{entry.focus.map(x=><li key={x}>{x}<b>→</b></li>)}</ul></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}