import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./InstagramAdResearch.module.css";

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

export function InstagramAdResearch({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.studio}><div className={styles.studioTop}><span>18 / CREATIVE STUDIO</span><span>INSTAGRAM</span></div><h1>Study the <i>visual language.</i></h1><div className={styles.polaroids}>{["HOOK","PRODUCT","CREATOR","OFFER","PROOF"].map((x,i)=><article key={x} style={{transform:`rotate(${i%2?2:-2}deg)`}}><div className={styles.photo}><b>{String(i+1).padStart(2,"0")}</b></div><strong>{x}</strong><p>{entry.focus[i%entry.focus.length]}</p></article>)}</div></section>
      <section className={styles.palette}><span>CREATIVE NOTES</span><h2>Capture structure before style.</h2><div>{["Composition","Type","Product focus","Human presence","CTA"].map((x,i)=><p key={x}><b>{i+1}</b>{x}</p>)}</div></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}