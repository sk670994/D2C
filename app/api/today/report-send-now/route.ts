import { NextResponse } from "next/server";

import { sendEmail } from "@/lib/email/send";
import { checkSharedRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/today/load";
import { renderReportEmail, reportSubject } from "@/lib/today/report-email";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

/**
 * "Send now": emails the signed-in user their current report straight away.
 * It does not count as the scheduled one, so the daily/weekly email still goes out.
 */
export async function POST() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user?.email) return NextResponse.json({ success: false, error: "Sign in again to send the report." }, { status: 401 });

  if (!process.env.RESEND_API_KEY?.trim() || !process.env.REPORT_FROM_EMAIL?.trim()) {
    return NextResponse.json({ success: false, error: "Email isn't switched on yet. Add the Resend key in Vercel, then try again." }, { status: 503 });
  }

  const rate = await checkSharedRateLimit(`report-send-now:${user.id}`, 5, 3_600_000);
  if (!rate.allowed) {
    return NextResponse.json({ success: false, error: `You've sent a few already. Try again in ${Math.ceil(rate.retryAfterSeconds / 60)} min.` }, { status: 429 });
  }

  const today = await getToday(user.id);
  const appUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.zooptrack.co.in").trim();
  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date());
  const result = await sendEmail({
    to: user.email,
    subject: reportSubject(today),
    html: renderReportEmail({ headline: today.headline, moves: today.moves, rivals: today.rivals, appUrl, dateLabel }),
  });
  if (!result.sent) {
    console.error("[report-send-now] failed", result.error ?? result.skipped);
    return NextResponse.json({ success: false, error: "The email could not be sent. Check Resend → Logs, or try again in a minute." }, { status: 502 });
  }
  return NextResponse.json({ success: true, to: user.email });
}
