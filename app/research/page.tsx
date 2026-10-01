import type { Metadata } from "next";
import { SeoHub } from "@/components/seo/SeoHub";
import { researchEntries } from "@/lib/seo/site";
export const metadata: Metadata = { title: "Zooptrack D2C Advertising Research", description: "Methodology-led research on D2C advertising patterns, competitor ads and offers using public evidence.", alternates: { canonical: "/research" } };
export default function ResearchPage() { return <SeoHub label="ZOOPTRACK RESEARCH" title="Research pages with the methodology visible." copy="We do not invent private spend, ROAS or market-share numbers. Research pages stay explicit about sample, scope and limitations." entries={researchEntries} />; }
