import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default function HomePage() {
  return (
    <main className="main" style={{ display: "grid", gap: 14 }}>
      <section className="card" style={{ display: "grid", gap: 16 }}>
        <p className="eyebrow">D2C Intelligence Platform</p>
        <h1 style={{ margin: 0, fontSize: "clamp(1.6rem, 2.4vw + 0.8rem, 2.7rem)", maxWidth: "20ch" }}>
          Not Another SaaS Dashboard. This Is Your Growth Operating Layer.
        </h1>
        <p className="muted" style={{ margin: 0, maxWidth: "72ch" }}>
          Real-time unit economics, media efficiency, scale planning, and AI-backed priority fixes in one low-latency interface designed for decisive action.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <GoogleSignInButton />
          <Link href="/dashboard">
            <button type="button" className="button-ghost">Open Command Center</button>
          </Link>
        </div>
      </section>
    </main>
  );
}
