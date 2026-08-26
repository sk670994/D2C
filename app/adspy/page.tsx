"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AdSpySection } from "@/components/dashboard/AdSpySection";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { createClient } from "@/lib/supabase/client";

type Platform = "meta" | "google" | "linkedin";

export default function AdSpyPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("IN");
  const [platform, setPlatform] = useState<Platform>("meta");

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!active) {
          return;
        }

        if (!user) {
          router.replace("/login?next=/adspy");
          return;
        }

        setEmail(user.email ?? "");
        setAuthChecked(true);
      } catch (error) {
        console.error("[AdSpyPage] Auth check failed:", error);

        if (!active) {
          return;
        }

        router.replace("/login?next=/adspy");
      }
    };

    void checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }

      if (!session?.user) {
        router.replace("/login?next=/adspy");
        return;
      }

      setEmail(session.user.email ?? "");
      setAuthChecked(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (!authChecked) {
    return (
      <main className="zt-adspy-shell">
        <div
          className="zt-library-loading"
          style={{
            minHeight: "100vh",
            border: 0,
          }}
        >
          <strong>Loading AdSpy...</strong>
        </div>
      </main>
    );
  }

  return (
    <main className="zt-adspy-shell">
      <header className="zt-appbar">
        <Link href="/dashboard" className="zt-brand">
          <span className="zt-brand-mark">Z</span>
          <span>zooptrack</span>
        </Link>

        <nav
          className="zt-appnav"
          aria-label="Product navigation"
        >
          <Link href="/dashboard">
            Profit OS
          </Link>

          <Link
            href="/adspy"
            className="active"
            aria-current="page"
          >
            AdSpy
          </Link>

          <Link href="/zwirk">
            ZWIRK
          </Link>

          <Link href="/brand-vault">
            Brand Vault
          </Link>
        </nav>

        <div className="zt-app-actions">
          <span
            className="zt-app-email"
            title={email}
          >
            {email}
          </span>

          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <section className="zt-hero">
        <div className="zt-hero-copy">
          <span className="zt-eyebrow">
            Competitive creative intelligence
          </span>

          <h1>
            See what competitors launch.
            <br />
            Know what to test next.
          </h1>

          <p>
            Search public Meta creatives, isolate durable
            hooks and offers, then carry the evidence into
            your next profitable experiment.
          </p>
        </div>

        <div className="zt-hero-side">
          <Link href="/zwirk">
            Ask ZWIRK about results
          </Link>

          <span>
            Meta Ad Library · India-first
          </span>
        </div>
      </section>

      <AdSpySection
        query={query}
        country={country}
        platform={platform}
        onQueryChange={setQuery}
        onCountryChange={setCountry}
        onPlatformChange={setPlatform}
      />
    </main>
  );
}