import Link from "next/link";

export default function HomePage() {
  return (
    <main className="main">
      <div className="card">
        <h1>D2C Marketing SaaS Tool</h1>
        <p className="muted">No Excel upload needed. Fill input cells, apply changes, and get all six sections auto-calculated.</p>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/dashboard"><button>Open Calculator</button></Link>
        </div>
      </div>
    </main>
  );
}
