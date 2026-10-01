import { notFound } from "next/navigation";
import { SeoPage, seoMetadata } from "@/components/seo/SeoPage";
import { guideEntries } from "@/lib/seo/site";
export const dynamicParams = false;
export function generateStaticParams() { return guideEntries.map((entry) => ({ slug: entry.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const entry = guideEntries.find((item) => item.slug === slug); return entry ? seoMetadata(entry) : {}; }
export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; if (!guideEntries.some((entry) => entry.slug === slug)) notFound(); return <SeoPage section="guide" slug={slug} />; }
