import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FinderView } from "@/components/today/FinderView";
import { TodayShell } from "@/components/today/TodayShell";
import { getVerifiedUser } from "@/lib/supabase/user";

export const metadata: Metadata = { title: "Ad finder", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function FinderPage() {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/today/finder");

  return (
    <TodayShell active="finder" email={user.email}>
      <FinderView />
    </TodayShell>
  );
}
