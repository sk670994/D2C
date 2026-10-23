import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoJsonLd } from "@/components/seo/SeoPage";
import type { SeoEntry } from "@/lib/seo/site";
import base from "./ArtSeoBase.module.css";
import styles from "./CompetitorAdResearch.module.css";

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

export function CompetitorAdResearch({ entry }: { entry: SeoEntry }) {
  return (
    <main className={styles.page}>
      <SeoJsonLd entry={entry} />
      <Header label={entry.eyebrow} />

      <section className={styles.intro}><div className={styles.meta}><span>02 / COMPETITOR AD RESEARCH</span><span>ANALYST WORKSPACE</span></div><h1>Research the<br/>evidence.<br/><em>Not the assumption.</em></h1><div className={styles.introBottom}><p>{entry.intro}</p><div className={styles.question}><span>START WITH A QUESTION</span><strong>Which competitor messages are repeating across the market?</strong></div></div></section>
      <section className={styles.workspace}><aside><div className={styles.sideHead}><span>SOURCES</span><b>04</b></div>{["META AD LIBRARY","INSTAGRAM","BRAND SITE","CREATIVE ARCHIVE"].map((x,i)=><div className={styles.source} key={x}><small>0{i+1}</small><strong>{x}</strong><i>→</i></div>)}<p>Public advertising evidence should remain tied to its source and observation date.</p></aside><div className={styles.canvas}><div className={styles.canvasHead}><span>RESEARCH CANVAS</span><span>QUESTION / 01</span></div><div className={styles.questionCenter}><span>WORKING QUESTION</span><h2>What is changing?</h2><p>Compare visible creative, messaging, offer and format before interpreting why they changed.</p></div><div className={styles.cards}>{["HOOK","OFFER","FORMAT","CONTEXT"].map((x,i)=><article key={x}><small>{String.fromCharCode(65+i)}. {x}</small><strong>{["What gets attention first?","What is being presented?","How is it delivered?","When was it observed?"][i]}</strong><p>{entry.focus[i%entry.focus.length]}</p></article>)}</div></div></section>
      <section className={styles.log}><div><span>EVIDENCE LOG</span><p>Same fields. Same discipline. Every observation.</p></div><div className={styles.table}>{["03 SEP","11 SEP","18 SEP","27 SEP"].map((d,i)=><div key={d}><b>{d}</b><strong>{["NOVA SKIN","FORME","KIN THEORY","BARE LAB"][i]}</strong><span>{["New problem-led opening","Bundle becomes primary offer","Same proposition moves to carousel","New visual treatment"][i]}</span><em>{["HOOK","OFFER","FORMAT","CREATIVE"][i]}</em></div>)}</div></section>
      <section className={styles.notebook}><div><span>FIELD NOTE / 01</span><span>PRIVATE INTERPRETATION</span></div><div className={styles.noteGrid}>{[["OBSERVED","Three advertisers are repeating similar propositions."],["INTERPRETED","The proposition may be receiving sustained attention."],["NEXT QUESTION","What would happen if the underlying angle were tested?"]].map(([x,y])=><article key={x}><small>{x}</small><h2>{y}</h2><p>Keep this layer distinct from private performance data.</p></article>)}</div></section>
      <section className={styles.boundary}><span>EVIDENCE BOUNDARY</span><h2>Public ads give you the visible layer.</h2><p>{entry.caveat}</p></section>

      <FAQ entry={entry} />
      <Footer />
    </main>
  );
}