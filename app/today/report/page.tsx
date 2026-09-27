import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TodayShell } from "@/components/today/TodayShell";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/today/load";
import { renderReportEmail, reportSubject } from "@/lib/today/report-email";

export const metadata: Metadata = { title: "Monday report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ReportPreviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?next=/today/report");

  const today = await getToday(user.id);
  const appUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.zooptrack.co.in").trim();
  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date());
  const html = renderReportEmail({ headline: today.headline, moves: today.moves, rivals: today.rivals, appUrl, dateLabel });

  return (
    <TodayShell active="report" email={user.email}>
      <header className="zd-col" style={{ gap: 10 }}>
        <div className="zd-eyebrow">Monday report · every Monday, 9 AM IST</div>
        <h1 className="zd-h1">This is what lands in your inbox.</h1>
        <p className="zd-lede">
          Same moves as <Link href="/today">Today</Link>, built from this week’s data. Subject: <strong>{reportSubject(today)}</strong>
        </p>
      </header>
      <iframe
        title="Monday report preview"
        srcDoc={html}
        sandbox="allow-top-navigation-by-user-activation"
        style={{ width: "100%", maxWidth: 680, height: 1400, border: "1px solid var(--zd-line)", borderRadius: 18, background: "#E9E6DE" }}
      />
    </TodayShell>
  );
}
