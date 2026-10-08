import { notFound } from "next/navigation";
import { SeoPage, seoMetadata } from "@/components/seo/SeoPage";
import { commercialEntries } from "@/lib/seo/site";

export const dynamicParams = false;
// Live ad numbers: rebuilt in the background at most every 6 hours.
export const revalidate = 21600;
export const maxDuration = 60;
export function generateStaticParams() { return commercialEntries.map((entry) => ({ slug: entry.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const entry = commercialEntries.find((item) => item.slug === slug); return entry ? seoMetadata(entry) : {}; }
export default async function CommercialSeoPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; if (!commercialEntries.some((entry) => entry.slug === slug)) notFound(); return <SeoPage section="commercial" slug={slug} />; }
