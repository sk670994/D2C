import type { Metadata } from "next";
import { SeoHub } from "@/components/seo/SeoHub";
import { toolEntries } from "@/lib/seo/site";
export const metadata: Metadata = { title: "D2C Marketing Calculators & Tools", description: "Simple calculators for ROAS, break-even ROAS, CAC, contribution margin and RTO rate.", alternates: { canonical: "/tools" } };
export default function ToolsPage() { return <SeoHub label="D2C TOOLS" title="Small calculators for everyday D2C decisions." copy="Transparent arithmetic with the inputs and assumptions visible." entries={toolEntries} />; }
