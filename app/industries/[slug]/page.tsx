import { notFound } from "next/navigation";
import { SeoPage, seoMetadata } from "@/components/seo/SeoPage";
import { industryEntries } from "@/lib/seo/site";
export const dynamicParams = false;
export function generateStaticParams() { return industryEntries.map((entry) => ({ slug: entry.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const entry = industryEntries.find((item) => item.slug === slug); return entry ? seoMetadata(entry) : {}; }
export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; if (!industryEntries.some((entry) => entry.slug === slug)) notFound(); return <SeoPage section="industry" slug={slug} />; }
