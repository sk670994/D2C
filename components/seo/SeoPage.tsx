import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoCalculator } from "./SeoCalculator";
import styles from "./SeoPage.module.css";
import { findSeoEntry, seoPath, type SeoEntry, type SeoSection } from "@/lib/seo/site";

export function seoMetadata(entry: SeoEntry): Metadata {
  const path = seoPath(entry);
  return { title: entry.title, description: entry.description, alternates: { canonical: path }, robots: { index: true, follow: true }, openGraph: { type: "website", siteName: "Zooptrack", locale: "en_IN", title: entry.title, description: entry.description, url: path }, twitter: { card: "summary_large_image", title: entry.title, description: entry.description } };
}

export function SeoJsonLd({ entry }: { entry: SeoEntry }) {
  const path = seoPath(entry);
  const groupLabel = entry.section === "commercial" ? "Zooptrack" : entry.section === "guide" ? "Guides" : entry.section === "tool" ? "Tools" : entry.section === "industry" ? "Industries" : "Research";
  const hub = entry.section === "commercial" ? "/" : `/${entry.section === "guide" ? "guides" : entry.section === "tool" ? "tools" : entry.section === "industry" ? "industries" : "research"}`;
  const graph: Record<string, unknown>[] = [
    { "@type": "WebPage", url: `https://www.zooptrack.co.in${path}`, name: entry.title, description: entry.description, inLanguage: "en-IN" },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: groupLabel, item: `https://www.zooptrack.co.in${hub}` }, { "@type": "ListItem", position: 2, name: entry.h1, item: `https://www.zooptrack.co.in${path}` }] },
  ];
  if (entry.calculator) graph.push({ "@type": "WebApplication", name: entry.h1, applicationCategory: "BusinessApplication", operatingSystem: "Web" });
  if (entry.faqs.length) graph.push({ "@type": "FAQPage", mainEntity: entry.faqs.map((faq) => ({ "@type": "Question", name: faq.q, acceptedAnswer: { "@type": "Answer", text: faq.a } })) });
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }) }} />;
}

function Related({ entry }: { entry: SeoEntry }) {
  return <section className={styles.related}><div><span className={styles.eyebrow}>KEEP RESEARCHING</span><h2>Go one layer deeper.</h2></div><div className={styles.relatedGrid}>{entry.related.map((href) => <Link key={href} href={href}><span>{href.replace(/^\//, "").replace(/-/g, " ").replace(/\//g, " · ")}</span><b>→</b></Link>)}</div></section>;
}

const steps: Record<SeoSection, string[]> = {
  commercial: ["Choose the exact competitors or public ad surface relevant to your question.", "Review the same evidence fields each time: advertiser, creative, copy, format and date.", "Compare new and persistent creative instead of treating one screenshot as a trend.", "Write the next decision and keep the evidence linked to it."],
  guide: ["Start with one concrete research question instead of browsing without a hypothesis.", "Collect comparable examples and keep the source and date visible.", "Separate what you observed from what you think it might mean.", "Turn the result into a testable brief, question or follow-up."],
  tool: ["Enter inputs from the same period and business definition.", "Check the arithmetic and the assumptions behind the inputs.", "Compare the result with your own target, guardrail or unit economics.", "Re-run the model whenever the underlying assumptions change."],
  industry: ["Define the category and the competitor set you actually care about.", "Tag the visible creative and offer dimensions consistently.", "Compare patterns across multiple advertisers or dates.", "Use findings as hypotheses alongside your own customer and campaign data."],
  research: ["Define the sample, collection window and fields before interpreting the data.", "Publish the methodology alongside any benchmark.", "Keep observed measurements separate from causal or performance claims.", "Update the research when the underlying dataset or scope changes."],
};

export function SeoPage({ section, slug }: { section: SeoSection; slug: string }) {
  const entry = findSeoEntry(section, slug);
  if (!entry) notFound();
  return <main className={styles.page}><SeoJsonLd entry={entry} />
    <header className={styles.topbar}><Link href="/" aria-label="Zooptrack home"><ZooptrackLogo height={30} tone="blue" priority /></Link><nav aria-label="SEO navigation"><Link href="/brand">Brands</Link><Link href="/guides">Guides</Link><Link href="/tools">Tools</Link><Link href="/industries">Industries</Link><Link href="/research">Research</Link><Link className={styles.cta} href={`/login?next=${encodeURIComponent(seoPath(entry))}`}>Try Zooptrack free</Link></nav></header>
    <section className={styles.hero}><div><span className={styles.eyebrow}>{entry.eyebrow}</span><h1>{entry.h1}</h1><p>{entry.intro}</p><div className={styles.heroMeta}><span>For {entry.audience}</span><Link href="/brand">Browse real brand ad pages →</Link></div></div><aside className={styles.signalCard}><span>RESEARCH LENS</span>{entry.focus.map((item, i) => <div key={item}><b>0{i + 1}</b><strong>{item}</strong></div>)}</aside></section>
    {entry.calculator ? <section className={styles.toolBlock}><SeoCalculator type={entry.calculator} /><p className={styles.toolNote}>Transparent arithmetic only. Keep your assumptions visible and compare the output with your own operating data.</p></section> : null}
    <section className={styles.contentGrid}><article className={styles.article}>
      <div className={styles.section}><span className={styles.eyebrow}>PRACTICAL WORKFLOW</span><h2>Use a defined process.</h2><ol>{steps[entry.section].map((step) => <li key={step}>{step}</li>)}</ol></div>
      <div className={styles.section}><span className={styles.eyebrow}>WHAT TO INSPECT</span><h2>Focus on the visible signal.</h2><ul>{entry.focus.map((item) => <li key={item}>{item}</li>)}</ul><p style={{marginTop:16}}>The useful question is not only “what is the ad?” but “what decision could change because of what I observed?”</p></div>
      <div className={styles.section}><span className={styles.eyebrow}>ZOOPTRACK FIT</span><h2>Build memory around the research.</h2><p>Zooptrack is designed for repeatable competitor-ad research around public advertising evidence. The value comes from consistent collection, searchable history and a clear bridge from observation to action.</p></div>
      <div className={styles.callout}><strong>Evidence boundary</strong><p>{entry.caveat}</p></div>
    </article><aside className={styles.side}><div className={styles.sideCard}><span className={styles.eyebrow}>START HERE</span><h2>Test one question.</h2><p>Begin with a small, clearly defined scope before expanding the research universe.</p><Link className={styles.primary} href="/brand">Browse brands</Link></div><div className={styles.sideCard}><span className={styles.eyebrow}>WANT HISTORY?</span><h2>Use AdSpy.</h2><p>Public pages explain the research surface. The authenticated workspace is where repeat monitoring and deeper filtering belong.</p><Link className={styles.secondary} href="/login?next=%2Fadspy">Open AdSpy</Link></div></aside></section>
    <section className={styles.faq}><span className={styles.eyebrow}>FAQ</span><h2>Common questions.</h2><div>{entry.faqs.map((faq) => <details key={faq.q}><summary>{faq.q}</summary><p>{faq.a}</p></details>)}</div></section>
    <Related entry={entry} />
    <footer className={styles.footerCta}><span className={styles.eyebrow}>ZOOPTRACK / NEXT STEP</span><h2>Turn public ad evidence into a decision loop.</h2><p>Browse real brand pages, then use Zooptrack when you need repeatable monitoring and deeper research.</p><Link className={styles.primary} href="/login">Start the free trial</Link></footer>
  </main>;
}
