import type { Metadata } from "next";
import { EmailAuthForm } from "@/components/auth/EmailAuthForm";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { BrandLogo } from "@/components/app/BrandLogo";
import { safeNextPath } from "@/lib/security/safe-redirect";

export const metadata: Metadata = {
  title: "Sign in or start free",
  description:
    "Sign in to Zooptrack to search any brand's Facebook and Instagram ads, track competitors and get weekly briefs.",
  alternates: { canonical: "/login" },
};

export default async function LoginPage({
  searchParams,
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
          <h1 className="auth-title">
            Know what your rivals ran this week.
          </h1>
          <p className="auth-lead">
            Start a 7-day free trial. Verify your email. No password or
            ad-account access needed.
          </p>
          <ul className="auth-points">
            <li>Pick up to 5 rivals; their first ads load right away.</li>
            <li>Today shows what changed, with the ads as evidence.</li>
            <li>A Monday email sums up the week in two minutes.</li>
          </ul>
        </div>

        <Card className="auth-card">
          <CardHeader className="auth-card-header">
            <div>
              <CardTitle>Sign In or Create Account</CardTitle>
              <CardDescription>
                Verify your email with a one-time code, or continue with
                Google.
              </CardDescription>
            </div>
            <ThemeToggle />
          </CardHeader>

          <CardContent className="auth-card-content">
            {params.error ? (
              <p className="auth-error">
                Authentication failed. Please try again.
              </p>
            ) : null}

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
              By continuing, you agree to our <a href="/terms">Terms</a> and{" "}
              <a href="/privacy">Privacy Policy</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
