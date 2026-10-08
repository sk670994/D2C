import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SeasonView } from "@/components/seo/SeasonView";
import { findSeason, SEASONS } from "@/lib/seo/seasons";

export const dynamicParams = false;
// Live ad counts: rebuilt in the background at most every 6 hours.
export const revalidate = 21600;
export const maxDuration = 60;

export function generateStaticParams() {
  return SEASONS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const season = findSeason(slug);
  if (!season) return {};
  const title = `${season.name} Ads in India: Live Ad Calendar, Top Brands & Offers`;
  const description = `Every ${season.short} ad Indian brands run on Facebook and Instagram, tracked live: when the season peaks, which brands advertise most, their offers and the ads still running.`;
  const path = `/seasons/${season.slug}`;
  return { title, description, alternates: { canonical: path }, openGraph: { type: "article", siteName: "Zooptrack", locale: "en_IN", url: path, title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function SeasonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const season = findSeason(slug);
  if (!season) notFound();
  return <SeasonView season={season!} />;
}
