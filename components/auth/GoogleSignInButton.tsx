"use client";

import { createClient } from "@/lib/supabase/client";

export function GoogleSignInButton({
  nextPath = "/dashboard",
  showBadge = false
}: {
  nextPath?: string;
  showBadge?: boolean;
}) {
  async function onClick() {
    try {
      const supabase = createClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || window.location.origin;

      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`
        }
      });
    } catch {
      window.alert("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
    }
  }

  return (
    <div className="google-cta-wrap">
      {showBadge ? (
        <div className="google-badge">
          <GoogleLogo />
        </div>
      ) : null}
      <button type="button" onClick={onClick} className="google-cta">
        <GoogleLogo />
        <span className="google-cta-text">Sign in with Google</span>
      </button>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3.01h3.86c2.26-2.08 3.57-5.14 3.57-8.66z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.86-3.01c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.72-4.95H1.3v3.11A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.8.14-1.56.38-2.29V6.6H1.3A12 12 0 0 0 0 12c0 1.93.46 3.75 1.3 5.4l3.98-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.36.61 4.61 1.8l3.46-3.46C17.94 1.14 15.24 0 12 0A12 12 0 0 0 1.3 6.6l3.98 3.11C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}
