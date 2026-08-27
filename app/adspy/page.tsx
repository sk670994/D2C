import Link from "next/link";
import { redirect } from "next/navigation";

import { AdSpySection } from "@/components/dashboard/AdSpySection";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

type Suggestion = {
  id: string;
  label: string;
  type: "advertiser" | "creator" | "keyword";
};

async function loadSuggestionCatalog(): Promise<Suggestion[]> {
  const client = createGlobalServiceClient();

  const [
    brandsResult,
    aliasesResult,
    creatorsResult,
    keywordResult,
  ] = await Promise.all([
    client
      .from("ad_intelligence_brands")
      .select("id,canonical_name")
      .not("canonical_name", "is", null)
      .order("canonical_name", {
        ascending: true,
      })
      .limit(1000),

    client
      .from("ad_intelligence_brand_aliases")
      .select("brand_id,alias")
      .not("alias", "is", null)
      .order("alias", {
        ascending: true,
      })
      .limit(500),

    client
      .from("ad_intelligence_creators")
      .select("id,canonical_name")
      .not("canonical_name", "is", null)
      .order("canonical_name", {
        ascending: true,
      })
      .limit(500),

    client
      .from("ad_intelligence_creatives")
      .select(
        "id,headline,product_name,advertiser_name",
      )
      .order("updated_at", {
        ascending: false,
      })
      .limit(800),
  ]);

  if (brandsResult.error) {
    console.error(
      "[AdSpy catalog] Brand lookup failed:",
      brandsResult.error,
    );
  }

  if (aliasesResult.error) {
    console.error(
      "[AdSpy catalog] Alias lookup failed:",
      aliasesResult.error,
    );
  }

  if (creatorsResult.error) {
    console.error(
      "[AdSpy catalog] Creator lookup failed:",
      creatorsResult.error,
    );
  }

  if (keywordResult.error) {
    console.error(
      "[AdSpy catalog] Keyword lookup failed:",
      keywordResult.error,
    );
  }

  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();

  const push = (
    type: Suggestion["type"],
    id: string,
    label: string,
  ) => {
    const clean = label.trim();

    if (!clean) {
      return;
    }

    const key =
      `${type}:${clean.toLowerCase()}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    suggestions.push({
      id,
      label: clean,
      type,
    });
  };

  for (
    const row of brandsResult.data ?? []
  ) {
    push(
      "advertiser",
      String(row.id),
      String(
        row.canonical_name ?? "",
      ),
    );
  }

  for (
    const row of aliasesResult.data ?? []
  ) {
    push(
      "advertiser",
      String(
        row.brand_id ?? row.alias,
      ),
      String(
        row.alias ?? "",
      ),
    );
  }

  for (
    const row of creatorsResult.data ?? []
  ) {
    push(
      "creator",
      String(row.id),
      String(
        row.canonical_name ?? "",
      ),
    );
  }

  for (
    const row of keywordResult.data ?? []
  ) {
    push(
      "keyword",
      `${row.id}:headline`,
      String(
        row.headline ?? "",
      ),
    );

    push(
      "keyword",
      `${row.id}:product`,
      String(
        row.product_name ?? "",
      ),
    );
  }

  return suggestions;
}

export default async function AdSpyPage() {
  const supabase =
    await createClient();

  const {
    data: {
      user,
    },
    error,
  } =
    await supabase.auth.getUser();

  if (
    error ||
    !user
  ) {
    redirect(
      "/login?next=/adspy",
    );
  }

  let suggestionCatalog: Suggestion[] =
    [];

  try {
    suggestionCatalog =
      await loadSuggestionCatalog();
  } catch (catalogError) {
    /*
     * Do not prevent AdSpy from opening simply because
     * the optional suggestion catalog failed.
     */
    console.error(
      "[AdSpy page] Suggestion catalog failed:",
      catalogError,
    );
  }

  return (
    <main className="zt-adspy-shell">
      <header className="zt-appbar">
        <Link
          href="/dashboard"
          className="zt-brand"
        >
          <span className="zt-brand-mark">
            Z
          </span>

          <span>
            zooptrack
          </span>
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
            title={user.email ?? ""}
          >
            {user.email ?? ""}
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
            Search public Meta creatives,
            isolate durable hooks and offers,
            then carry the evidence into
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
        initialSuggestionCatalog={
          suggestionCatalog
        }
      />
    </main>
  );
}