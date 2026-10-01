import { notFound } from "next/navigation";
import { SeoPage, seoMetadata } from "@/components/seo/SeoPage";
import { researchEntries } from "@/lib/seo/site";
export const dynamicParams = false;
export function generateStaticParams() { return researchEntries.map((entry) => ({ slug: entry.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const entry = researchEntries.find((item) => item.slug === slug); return entry ? seoMetadata(entry) : {}; }
export default async function ResearchEntryPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; if (!researchEntries.some((entry) => entry.slug === slug)) notFound(); return <SeoPage section="research" slug={slug} />; }
