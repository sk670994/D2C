import { redirect } from "next/navigation";

import { AdSpySection } from "@/components/dashboard/AdSpySection";
import { TodayShell } from "@/components/today/TodayShell";
import { createClient } from "@/lib/supabase/server";

export default async function AdSpyPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login?next=/adspy");
  }

  return (
    <TodayShell active="adspy" email={user.email}>
      <AdSpySection />
    </TodayShell>
  );
}
