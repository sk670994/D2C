import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="main" style={{ display: "grid", gap: 14 }}>
      <Card>
        <CardHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <p className="eyebrow">D2C Intelligence Platform</p>
            <CardTitle style={{ fontSize: "clamp(1.6rem, 2.4vw + 0.8rem, 2.7rem)", maxWidth: "24ch" }}>
              D2C Operating System for Founders, Marketers, and Agencies.
            </CardTitle>
            <CardDescription style={{ maxWidth: "72ch" }}>
              Real-time unit economics, media efficiency, scale planning, and AI-backed priority fixes with scenario comparison.
            </CardDescription>
          </div>
          <ThemeToggle />
        </CardHeader>
        <CardContent style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/login">
            <Button type="button">Sign In / Sign Up</Button>
          </Link>
          <Link href="/dashboard">
            <Button type="button" variant="secondary">Open Command Center</Button>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
