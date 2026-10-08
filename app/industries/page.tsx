import type { Metadata } from "next";
import { SeoHub } from "@/components/seo/SeoHub";
import { industryEntries } from "@/lib/seo/site";
export const metadata: Metadata = { title: "D2C Industry Ad Research", description: "Live Meta ad dashboards for 23 Indian consumer categories, from skincare and fashion to cars, mobiles, ACs and geysers: active ads, new launches, format and language mix, and the longest-running ads.", alternates: { canonical: "/industries" } };
export default function IndustriesPage() { return <SeoHub label="D2C INDUSTRY RESEARCH" title="Live ad data for every category." copy="Each dashboard tracks the leading Indian D2C brands in one category every day: who is pushing hardest, how they advertise and which ads keep running." entries={industryEntries} />; }
