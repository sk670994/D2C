import Link from "next/link";

export default function HomePage() {
  return (
    <main className="main">
      <div className="card">
        <h1>D2C Marketing Dashboard</h1>
        <p className="muted">Upload your calculator Excel and convert it into a clean dashboard + action insights.</p>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/upload"><button>Upload Report</button></Link>
          <Link href="/dashboard"><button>Open Demo Dashboard</button></Link>
        </div>
      </div>
    </main>
  );
}
