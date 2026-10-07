import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TodayShell } from "@/components/today/TodayShell";
import { ZwirkWorkspace } from "@/components/zwirk/ZwirkWorkspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ask ZWIRK", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ZwirkPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?next=/zwirk");

  return (
    <TodayShell active="zwirk" email={user.email}>
      <ZwirkWorkspace />
    </TodayShell>
  );
}
