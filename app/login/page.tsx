import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next && params.next.startsWith("/") ? params.next : "/dashboard";

  return (
    <main className="main">
      <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1>Sign In</h1>
        <p className="muted">Sign in with Google to access the D2C calculator.</p>
        {params.error ? <p style={{ color: "crimson" }}>Authentication failed. Please try again.</p> : null}
        <GoogleSignInButton nextPath={nextPath} />
      </div>
    </main>
  );
}
