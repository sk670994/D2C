import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { BrandOverviewView } from "@/components/today/BrandOverviewView";
import { TodayShell } from "@/components/today/TodayShell";
import { getVerifiedUser } from "@/lib/supabase/user";

export const metadata: Metadata = { title: "Brand", robots: { index: false, follow: false } };

export default async function TodayBrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<{ country?: string }>;
}) {
  const { pageId: raw } = await params;
  const pageId = decodeURIComponent(raw).trim();
  if (!/^\d+$/.test(pageId)) notFound();
  const { country: rawCountry } = await searchParams;
  const country = /^[A-Z]{2}$/.test(String(rawCountry ?? "").toUpperCase()) ? String(rawCountry).toUpperCase() : "IN";

  const user = await getVerifiedUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/today/brand/${pageId}`)}`);

  return (
    <TodayShell active="today" email={user.email}>
      <BrandOverviewView pageId={pageId} country={country} />
    </TodayShell>
  );
}
