import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { checkSignupEmail, emailCheckMessage } from "@/lib/auth/email-check-server";
import { checkSharedRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sends the sign-in / sign-up code after a server-side email check, so a
 * throwaway address is refused before Supabase creates an account.
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const signup = body.mode === "signup";

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const rate = await checkSharedRateLimit(`send-otp:${ip}`, 8, 10 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  // Sign-in of an existing account skips the check (old accounts keep working).
  if (signup) {
    const check = await checkSignupEmail(email);
    if (!check.ok) return NextResponse.json({ ok: false, error: emailCheckMessage(check.reason) }, { status: 400 });
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anonKey) return NextResponse.json({ ok: false, error: "Sign-in is not configured." }, { status: 500 });

  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: signup } });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
