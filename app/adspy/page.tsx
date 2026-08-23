"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdSpySection } from "@/components/dashboard/AdSpySection";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export default function AdSpyPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("IN");
  const [platform, setPlatform] = useState<"meta" | "google" | "linkedin">("meta");

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    async function checkSession() {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setEmail(data.user?.email ?? "");
      setAuthChecked(true);
      if (!data.user) router.replace("/login?next=/adspy");
    }
    void checkSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setEmail(session?.user?.email ?? "");
      setAuthChecked(true);
      if (!session?.user) router.replace("/login?next=/adspy");
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [router]);

  if (!authChecked || !email) return <main className="app-loading"><p>Opening AdSpy workspace…</p></main>;

  return (
    <main className="adspy-workspace">
      <header className="app-topbar">
        <Link href="/dashboard" className="app-brand" aria-label="Zooptrack dashboard"><span className="app-brand-mark">Z</span><span>zooptrack</span></Link>
        <nav className="app-nav" aria-label="Product navigation">
          <Link href="/dashboard">Profit OS</Link><Link href="/adspy" className="active">AdSpy</Link><Link href="/zwirk">ZWIRK</Link><Link href="/brand-vault">Brand Vault</Link>
        </nav>
        <div className="app-topbar-actions"><span className="app-user">{email}</span><ThemeToggle /><SignOutButton /></div>
      </header>
      <section className="adspy-page-hero">
        <div><p className="eyebrow">Competitive creative intelligence</p><h1>See what competitors launch.<br />Know what to test next.</h1><p>Search public Meta creatives, isolate durable hooks and offers, then carry the evidence into your next profitable experiment.</p></div>
        <div className="adspy-hero-actions"><Link href="/zwirk"><Button type="button" variant="secondary">Ask ZWIRK about results</Button></Link><span>Meta Ad Library · India-first</span></div>
      </section>
      <AdSpySection query={query} country={country} platform={platform} onQueryChange={setQuery} onCountryChange={setCountry} onPlatformChange={setPlatform} />
    </main>
  );
}
