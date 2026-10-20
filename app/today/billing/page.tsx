import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BillingView } from "@/components/today/BillingView";
import { TodayShell } from "@/components/today/TodayShell";
import { getVerifiedUser } from "@/lib/supabase/user";

export const metadata: Metadata = { title: "Plan & billing", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/today/billing");

  return (
    <TodayShell active="billing" email={user.email}>
      <BillingView />
    </TodayShell>
  );
}
