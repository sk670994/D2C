import { redirect } from "next/navigation";

import { AdSpyWorkspace } from "@/components/dashboard/adspy/AdSpyWorkspace";
import { TodayShell } from "@/components/today/TodayShell";
import { getVerifiedUser } from "@/lib/supabase/user";

export default async function AdSpyPage() {
  const user = await getVerifiedUser();

  if (!user) {
    redirect("/login?next=/zooplens");
  }

  return (
    <TodayShell active="adspy" email={user.email}>
      <AdSpyWorkspace />
    </TodayShell>
  );
}
