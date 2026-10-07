import type { Metadata } from "next";
import Link from "next/link";
import { SiteTopBar } from "@/components/brand/SiteTopBar";
import { allSeoEntries, seoPath } from "@/lib/seo/site";

export const metadata: Metadata = { title: "Sitemap", description: "Every public page on Zooptrack in one place.", alternates: { canonical: "/sitemap" } };

const coreLinks = [
  ["/", "Home"],
  ["/brand", "Brand ad library"],
  ["/guides", "D2C Guides"],
  ["/tools", "D2C Tools"],
  ["/industries", "Industry research"],
  ["/research", "Zooptrack research"],
  ["/pricing", "Pricing"],
  ["/decision-loop", "How it works"],
  ["/faq", "FAQ"],
  ["/contact", "Contact"],
  ["/privacy", "Privacy"],
  ["/refund-policy", "Cancellation & refunds"],
  ["/shipping-policy", "Shipping & delivery"],
  ["/terms", "Terms"],
] as const;

export default function SitemapPage() {
  const groups = [
    ["Commercial", allSeoEntries.filter((entry) => entry.section === "commercial")],
    ["Guides", allSeoEntries.filter((entry) => entry.section === "guide")],
    ["Tools", allSeoEntries.filter((entry) => entry.section === "tool")],
    ["Industries", allSeoEntries.filter((entry) => entry.section === "industry")],
    ["Research", allSeoEntries.filter((entry) => entry.section === "research")],
  ] as const;
  return <main className="main policy-page sitemap-page"><SiteTopBar /><header className="policy-hero"><p className="eyebrow">Navigation</p><h1>Sitemap</h1><p className="muted-text">All primary public pages and SEO research surfaces in the Zooptrack workspace.</p></header><section className="policy-grid">{coreLinks.map(([href,label]) => <article key={href} className="policy-card"><h3>{label}</h3><p className="muted-text"><Link href={href}>{href}</Link></p></article>)}</section>{groups.map(([title,entries]) => <section key={title} className="policy-grid"><article className="policy-card"><h2>{title}</h2><ul>{entries.map((entry) => <li key={entry.slug}><Link href={seoPath(entry)}>{entry.h1}</Link></li>)}</ul></article></section>)}</main>;
}
