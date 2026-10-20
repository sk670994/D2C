import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TodayShell } from "@/components/today/TodayShell";
import { ZwirkWorkspace } from "@/components/zwirk/ZwirkWorkspace";
import { getVerifiedUser } from "@/lib/supabase/user";

export const metadata: Metadata = { title: "Ask ZWIRK", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ZwirkPage() {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/zwirk");

  return (
    <TodayShell active="zwirk" email={user.email}>
      <ZwirkWorkspace />
    </TodayShell>
  );
}
