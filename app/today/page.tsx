import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TodayShell } from "@/components/today/TodayShell";
import { TodayView } from "@/components/today/TodayView";
import { getVerifiedUser } from "@/lib/supabase/user";

export const metadata: Metadata = { title: "Today", robots: { index: false, follow: false } };

export default async function TodayPage() {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/today");

  return (
    <TodayShell active="today" email={user.email}>
      <TodayView />
    </TodayShell>
  );
}
