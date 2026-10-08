import type { Metadata } from "next";
import { SeoHub } from "@/components/seo/SeoHub";
import { guideEntries } from "@/lib/seo/site";
export const metadata: Metadata = { title: "D2C Advertising Guides", description: "Practical guides for competitor ad research, Meta Ad Library research, creative analysis and offer monitoring.", alternates: { canonical: "/guides" } };
export default function GuidesPage() { return <SeoHub label="D2C RESEARCH GUIDES" title="How to research competitor ads." copy="Step-by-step guides for Indian D2C teams: finding rivals' ads, reading them, spotting the winners and keeping watch, with real examples from live data." entries={guideEntries} />; }
