"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const parsed = await fetch("/api/parse-excel", { method: "POST", body: fd });
      if (!parsed.ok) throw new Error("Failed to parse file");
      const parsedJson = await parsed.json();

      const calc = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedJson)
      });
      if (!calc.ok) throw new Error("Failed to calculate metrics");
      const calcJson = await calc.json();
      sessionStorage.setItem("reportInput", JSON.stringify(parsedJson));
      sessionStorage.setItem("report", JSON.stringify(calcJson));
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="main">
      <div className="card">
        <h2>Upload Excel Report</h2>
        <p className="muted">Supported: your D2C Marketing Calculator .xlsx format</p>
        <form onSubmit={onSubmit}>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div>
            <button type="submit" disabled={!file || loading}>{loading ? "Processing..." : "Generate Dashboard"}</button>
          </div>
        </form>
        {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      </div>
    </main>
  );
}
