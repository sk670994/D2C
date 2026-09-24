import type { Metadata } from "next";
import { EmailAuthForm } from "@/components/auth/EmailAuthForm";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { BrandLogo } from "@/components/app/BrandLogo";
import { safeNextPath } from "@/lib/security/safe-redirect";

export const metadata: Metadata = {
  title: "Sign in or start free",
  description: "Sign in to Zooptrack to search any brand's Facebook and Instagram ads, track competitors and get weekly briefs.",
  alternates: { canonical: "/login" },
};


export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);

  return (
    <main className="main auth-page">
      <div className="auth-shell">
        <div className="auth-hero">
          <BrandLogo href="/" />
          <h1 className="auth-title">See the diagnosis, then decide.</h1>
          <p className="auth-lead">True contribution after COD and returns, competitor creatives, and ZWIRK on what to do next.</p>
          <ul className="auth-points">
            <li>Command Center opens on attention, not an empty dashboard.</li>
            <li>Paste a product URL to read the market.</li>
            <li>Recommendations carry evidence and rupee impact.</li>
          </ul>
        </div>
        <Card className="auth-card">
          <CardHeader className="auth-card-header">
            <div>
              <CardTitle>Sign In or Create Account</CardTitle>
              <CardDescription>Email/password sign-in for owners and agencies.</CardDescription>
            </div>
            <ThemeToggle />
          </CardHeader>
          <CardContent className="auth-card-content">
            {params.error ? <p className="auth-error">Authentication failed. Please try again.</p> : null}
            <div className="auth-form-shell">
              <EmailAuthForm nextPath={nextPath} />
            </div>
            <div className="auth-divider">
              <span>or continue with Google</span>
            </div>
            <div className="auth-oauth">
              <GoogleSignInButton nextPath={nextPath} />
            </div>
            <p className="auth-legal">
              By continuing, you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
