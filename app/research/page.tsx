import type { Metadata } from "next";
import { SeoHub } from "@/components/seo/SeoHub";
import { researchEntries } from "@/lib/seo/site";
export const metadata: Metadata = { title: "Zooptrack D2C Advertising Research", description: "Live research on how Indian D2C brands advertise on Meta: activity by category, format and language trends, and the longest-running ads. Updated daily.", alternates: { canonical: "/research" } };
export default function ResearchPage() { return <SeoHub label="ZOOPTRACK RESEARCH" title="Live research on Indian D2C advertising." copy="Measured every day from the public Meta ads of the D2C brands we track. We never invent spend or ROAS; every number is counted, and the methodology is on the page." entries={researchEntries} />; }
