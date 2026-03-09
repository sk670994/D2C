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
    <main className="main">
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <CardHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <CardTitle>Access Your Workspace</CardTitle>
            <CardDescription>Email/password sign-in for owners and agencies.</CardDescription>
          </div>
          <ThemeToggle />
        </CardHeader>
        <CardContent>
          {params.error ? <p style={{ color: "crimson" }}>Authentication failed. Please try again.</p> : null}
          <EmailAuthForm nextPath={nextPath} />
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>or continue with Google</p>
            <GoogleSignInButton nextPath={nextPath} />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
