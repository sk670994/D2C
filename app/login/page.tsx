import { EmailAuthForm } from "@/components/auth/EmailAuthForm";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next && params.next.startsWith("/") ? params.next : "/dashboard";

  return (
    <main className="main auth-page">
      <div className="auth-shell">
        <div className="auth-hero">
          <p className="eyebrow">D2C Growth OS</p>
          <h1 className="auth-title">Access the Growth Intelligence Command Center</h1>
          <p className="auth-lead">Join your workspace to track unit economics, ad efficiency, and scale readiness in one place.</p>
          <ul className="auth-points">
            <li>Live KPI health checks across sections.</li>
            <li>Scenario lab with cloud-sync snapshots.</li>
            <li>AI-guided fixes and action plans.</li>
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
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
