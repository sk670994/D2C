"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AdSpySection } from "@/components/dashboard/AdSpySection";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type AdSpyPlatform =
  | "meta"
  | "google"
  | "linkedin";

export default function AdSpyPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] =
    useState(false);

  const [email, setEmail] =
    useState<string>("");

  const [query, setQuery] =
    useState<string>("");

  const [country, setCountry] =
    useState<string>("IN");

  const [platform, setPlatform] =
    useState<AdSpyPlatform>("meta");

  useEffect(() => {
    let mounted = true;

    const supabase =
      createClient();

    const redirectToLogin = () => {
      if (!mounted) {
        return;
      }

      router.replace(
        "/login?next=/adspy",
      );
    };

    const checkSession = async () => {
      try {
        const {
          data,
          error,
        } =
          await supabase.auth.getUser();

        if (!mounted) {
          return;
        }

        if (error) {
          console.error(
            "[AdSpyPage] Failed to check auth session:",
            error,
          );
        }

        const userEmail =
          data.user?.email ??
          "";

        setEmail(userEmail);
        setAuthChecked(true);

        if (!data.user) {
          redirectToLogin();
        }
      } catch (error) {
        console.error(
          "[AdSpyPage] Auth check failed:",
          error,
        );

        if (!mounted) {
          return;
        }

        setEmail("");
        setAuthChecked(true);
        redirectToLogin();
      }
    };

    void checkSession();

    const {
      data: authSubscription,
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (!mounted) {
            return;
          }

          const userEmail =
            session?.user?.email ??
            "";

          setEmail(userEmail);
          setAuthChecked(true);

          if (!session?.user) {
            redirectToLogin();
          }
        },
      );

    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, [router]);

  if (
    !authChecked ||
    !email
  ) {
    return (
      <main
        className="app-loading"
        aria-live="polite"
      >
        <p>
          Opening AdSpy workspace…
        </p>
      </main>
    );
  }

  return (
    <main className="adspy-workspace">
      <header className="app-topbar">
        <Link
          href="/dashboard"
          className="app-brand"
          aria-label="Zooptrack dashboard"
        >
          <span className="app-brand-mark">
            Z
          </span>

          <span>
            zooptrack
          </span>
        </Link>

        <nav
          className="app-nav"
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

        <div className="app-topbar-actions">
          <span
            className="app-user"
            title={email}
          >
            {email}
          </span>

          <ThemeToggle />

          <SignOutButton />
        </div>
      </header>

      <section className="adspy-page-hero">
        <div>
          <p className="eyebrow">
            Competitive creative intelligence
          </p>

          <h1>
            See what competitors launch.
            <br />
            Know what to test next.
          </h1>

          <p>
            Search public Meta creatives,
            isolate durable hooks and
            offers, then carry the evidence
            into your next profitable
            experiment.
          </p>
        </div>

        <div className="adspy-hero-actions">
          <Link href="/zwirk">
            <Button
              type="button"
              variant="secondary"
            >
              Ask ZWIRK about results
            </Button>
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