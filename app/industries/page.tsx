import type { Metadata } from "next";
import { SeoHub } from "@/components/seo/SeoHub";
import { industryEntries } from "@/lib/seo/site";
export const metadata: Metadata = { title: "D2C Industry Ad Research", description: "Category-focused competitor advertising research for beauty, skincare, fashion and supplements.", alternates: { canonical: "/industries" } };
export default function IndustriesPage() { return <SeoHub label="D2C INDUSTRY RESEARCH" title="Research competitor advertising by category." copy="Use category-specific questions instead of a generic list of ads." entries={industryEntries} />; }
