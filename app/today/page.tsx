import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TodayShell } from "@/components/today/TodayShell";
import { TodayView } from "@/components/today/TodayView";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Today", robots: { index: false, follow: false } };

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?next=/today");

  return (
    <TodayShell active="today" email={user.email}>
      <TodayView />
    </TodayShell>
  );
}
