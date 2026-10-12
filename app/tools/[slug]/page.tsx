import { notFound } from "next/navigation";
import { SeoPage, seoMetadata } from "@/components/seo/SeoPage";
import { toolEntries } from "@/lib/seo/site";
// Rendered on first visit, then cached (ISR): the build never waits on the database.
export const dynamicParams = true;
export function generateStaticParams() { return []; }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const entry = toolEntries.find((item) => item.slug === slug); return entry ? seoMetadata(entry) : {}; }
export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; if (!toolEntries.some((entry) => entry.slug === slug)) notFound(); return <SeoPage section="tool" slug={slug} />; }
