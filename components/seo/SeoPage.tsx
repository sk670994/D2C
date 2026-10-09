import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { findSeoEntry, seoPath, type SeoEntry, type SeoSection, fitTitle } from "@/lib/seo/site";

import { GuideView } from "./GuideView";
import { IndustryView } from "./IndustryView";
import { ProductView } from "./ProductView";
import { ResearchView } from "./ResearchView";
import { SeoCalculator } from "./SeoCalculator";
import { Crumbs, Faqs, FooterCta, RelatedLinks, Shell } from "./SeoChrome";
import t from "./Themes.module.css";

export function seoMetadata(entry: SeoEntry): Metadata {
  const path = seoPath(entry);
  return { title: fitTitle(entry.title), description: entry.description, alternates: { canonical: path }, robots: { index: true, follow: true }, openGraph: { type: "website", siteName: "Zooptrack", locale: "en_IN", title: entry.title, description: entry.description, url: path }, twitter: { card: "summary_large_image", title: entry.title, description: entry.description } };
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


/** A calculator page: the tool first and the answer large, then how to read it. */
function ToolView({ entry }: { entry: SeoEntry }) {
  const path = seoPath(entry);
  const notes = TOOL_NOTES[entry.slug];
  return (
    <Shell theme="tool" path={path}>
      <Crumbs items={[{ name: "Home", href: "/" }, { name: "Tools", href: "/tools" }, { name: entry.h1 }]} />
      <section className={t.toolHero}>
        <div>
          <h1>{entry.h1}</h1>
          <p className={t.lede}>{entry.intro}</p>
          {notes ? <p className={t.formula}>{notes.formula}</p> : null}
          {notes ? <p className={t.note} style={{ marginTop: 14 }}>{notes.example}</p> : null}
        </div>
        <div className={t.calc}>{entry.calculator ? <SeoCalculator type={entry.calculator} /> : null}</div>
      </section>
      {notes ? (
        <section className={`${t.wrap} ${t.section}`}>
          <h2 className={t.h2}>How to read the result</h2>
          <ul className={t.readList}>{notes.read.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className={t.note} style={{ marginTop: 28 }}>{entry.caveat} Your numbers tell you what you can afford; your rivals&apos; ads tell you what the market is testing. <Link href="/brand">See what Indian D2C brands are running.</Link></p>
        </section>
      ) : null}
      <Faqs faqs={entry.faqs} />
      <RelatedLinks hrefs={entry.related} />
      <FooterCta title="Know your numbers. Then know your rivals." copy="Zooptrack tracks your competitors' Facebook and Instagram ads every day and tells you what changed." />
    </Shell>
  );
}

export async function SeoPage({ section, slug }: { section: SeoSection; slug: string }) {
  const found = findSeoEntry(section, slug);
  if (!found) notFound();
  const entry = found as SeoEntry;
  if (section === "guide") return <GuideView entry={entry} />;
  if (section === "industry") return <IndustryView entry={entry} />;
  if (section === "research") return <ResearchView entry={entry} />;
  if (section === "commercial") return <><SeoJsonLd entry={entry} /><ProductView entry={entry} /></>;
  return <><SeoJsonLd entry={entry} /><ToolView entry={entry} /></>;
}
