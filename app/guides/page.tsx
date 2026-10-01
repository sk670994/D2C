import type { Metadata } from "next";
import { SeoHub } from "@/components/seo/SeoHub";
import { guideEntries } from "@/lib/seo/site";
export const metadata: Metadata = { title: "D2C Advertising Guides", description: "Practical guides for competitor ad research, Meta Ad Library research, creative analysis and offer monitoring.", alternates: { canonical: "/guides" } };
export default function GuidesPage() { return <SeoHub label="D2C RESEARCH GUIDES" title="Practical guides for competitor advertising research." copy="Workflows for finding, analyzing and monitoring public competitor ads without treating assumptions as facts." entries={guideEntries} />; }
