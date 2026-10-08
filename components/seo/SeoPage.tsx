import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { SeoCalculator } from "./SeoCalculator";
import styles from "./SeoPage.module.css";
import { findSeoEntry, seoPath, type SeoEntry, type SeoSection } from "@/lib/seo/site";
import { GuideView } from "./GuideView";
import { IndustryView } from "./IndustryView";
import { ResearchView } from "./ResearchView";
import { ProductView } from "./ProductView";
import { RelatedLinks } from "./SeoChrome";

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


/** Concrete notes for each calculator: formula, a worked example in rupees, and how to read it. */
const TOOL_NOTES: Record<string, { formula: string; example: string; read: string[] }> = {
  "roas-calculator": { formula: "ROAS = revenue from ads ÷ ad spend", example: "₹3,00,000 of revenue from ₹1,00,000 of ad spend is a 3.0x ROAS.", read: ["Compare ROAS with your break-even ROAS, not with another brand's: margins differ.", "Use revenue net of discounts and cancellations, or ROAS will look better than it is.", "For COD-heavy brands, use delivered revenue; RTO orders are not revenue."] },
  "break-even-roas": { formula: "Break-even ROAS = 1 ÷ contribution margin (before ad spend)", example: "With a 40% contribution margin, break-even ROAS is 1 ÷ 0.40 = 2.5x. Below 2.5x, every order loses money.", read: ["Contribution margin here is after product, shipping, payment and packaging costs, but before ads.", "Your scaling target should sit above break-even to leave room for profit and returns.", "Recalculate whenever you change prices, discounts or shipping costs."] },
  "cac-calculator": { formula: "CAC = acquisition spend ÷ new customers", example: "₹2,00,000 spent to win 800 new customers is a CAC of ₹250.", read: ["Count only new customers; repeat orders belong in retention, not CAC.", "Compare CAC with first-order contribution and with lifetime value.", "Include agency fees and creative costs if you want the true cost to acquire."] },
  "contribution-margin": { formula: "Contribution margin = (revenue − variable costs) ÷ revenue", example: "A ₹1,000 order with ₹550 of product, shipping, payment and packaging costs has a 45% contribution margin.", read: ["Variable costs change with each order: product cost, shipping, payment gateway fees, packaging, returns.", "This margin sets your break-even ROAS: 1 ÷ margin.", "A discount comes straight out of contribution, which is why bundles are often cheaper than price cuts."] },
  "rto-calculator": { formula: "RTO rate = RTO orders ÷ shipped orders", example: "60 orders returned out of 500 shipped is a 12% RTO rate.", read: ["Each RTO costs forward and return shipping with no revenue.", "Track RTO by payment method, pin code and campaign to find where it comes from.", "Prepaid incentives and address checks are the usual levers to bring it down."] },
};


export async function SeoPage({ section, slug }: { section: SeoSection; slug: string }) {
  const found = findSeoEntry(section, slug);
  if (!found) notFound();
  const entry = found as SeoEntry;
  if (section === "guide") return <GuideView entry={entry} />;
  if (section === "industry") return <IndustryView entry={entry} />;
  if (section === "research") return <ResearchView entry={entry} />;
  if (section === "commercial") return <ProductView entry={entry} />;
  return <main className={`${styles.page} zt-scope`}><SeoJsonLd entry={entry} />
    <header className={styles.topbar}><Link href="/" aria-label="Zooptrack home"><ZooptrackLogo height={30} tone="blue" priority /></Link><nav aria-label="SEO navigation"><Link href="/brand">Brands</Link><Link href="/guides">Guides</Link><Link href="/tools">Tools</Link><Link href="/industries">Industries</Link><Link href="/research">Research</Link><Link className={styles.cta} href={`/login?next=${encodeURIComponent(seoPath(entry))}`}>Try Zooptrack free</Link></nav></header>
    <section className={styles.hero}><div><span className={styles.eyebrow}>{entry.eyebrow}</span><h1>{entry.h1}</h1><p>{entry.intro}</p><div className={styles.heroMeta}><span>For {entry.audience}</span><Link href="/brand">Browse real brand ad pages →</Link></div></div><aside className={styles.signalCard}><span>WHAT YOU NEED</span>{entry.focus.map((item, i) => <div key={item}><b>0{i + 1}</b><strong>{item}</strong></div>)}</aside></section>
    {entry.calculator ? <section className={styles.toolBlock}><SeoCalculator type={entry.calculator} /><p className={styles.toolNote}>Transparent arithmetic only. Keep your assumptions visible and compare the output with your own operating data.</p></section> : null}
    {TOOL_NOTES[entry.slug] ? <section className={styles.contentGrid}><article className={styles.article}>
      <div className={styles.section}><span className={styles.eyebrow}>THE FORMULA</span><h2>{TOOL_NOTES[entry.slug].formula}</h2><p>{TOOL_NOTES[entry.slug].example}</p></div>
      <div className={styles.section}><span className={styles.eyebrow}>HOW TO READ IT</span><h2>Three things to check</h2><ul>{TOOL_NOTES[entry.slug].read.map((r) => <li key={r}>{r}</li>)}</ul></div>
      <div className={styles.callout}><strong>Keep in mind</strong><p>{entry.caveat}</p></div>
    </article><aside className={styles.side}><div className={styles.sideCard}><span className={styles.eyebrow}>NEXT STEP</span><h2>See what rivals are doing.</h2><p>Your numbers tell you what you can afford. Your rivals&apos; ads tell you what the market is testing.</p><Link className={styles.primary} href="/brand">Browse brand ads</Link></div></aside></section> : null}
    <section className={styles.faq}><span className={styles.eyebrow}>FAQ</span><h2>Common questions.</h2><div>{entry.faqs.map((faq) => <details key={faq.q}><summary>{faq.q}</summary><p>{faq.a}</p></details>)}</div></section>
    <RelatedLinks hrefs={entry.related} />
    <footer className={styles.footerCta}><span className={styles.eyebrow}>ZOOPTRACK</span><h2>Know your numbers. Then know your rivals.</h2><p>Zooptrack tracks your competitors&apos; Facebook and Instagram ads every day and tells you what changed.</p><Link className={styles.primary} href="/login">Start the free trial</Link></footer>
  </main>;
}
