import Link from "next/link";
import { redirect } from "next/navigation";

import { AdSpySection } from "@/components/dashboard/AdSpySection";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

import "../../components/dashboard/adspy/adspy.css";

type Suggestion = {
  id: string;
  label: string;
  type: "advertiser" | "creator" | "keyword";
};

async function loadSuggestionCatalog(): Promise<Suggestion[]> {
  const client = createGlobalServiceClient();

  const { data, error } = await client
    .from("ad_intelligence_creatives")
    .select("id,advertiser_name,creator_name,headline,product_name")
    .limit(1500);

  if (error) {
    console.error("[AdSpy catalog] Creative catalog lookup failed:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();

  const push = (
    type: Suggestion["type"],
    id: string,
    value: unknown,
  ) => {
    const label = String(value ?? "").trim();
    if (!label) return;

    const key = `${type}:${label.toLocaleLowerCase()}`;
    if (seen.has(key)) return;

    seen.add(key);
    suggestions.push({ id, label, type });
  };

  for (const row of data ?? []) {
    push("advertiser", `advertiser:${row.id}`, row.advertiser_name);
    push("creator", `creator:${row.id}`, row.creator_name);
    push("keyword", `headline:${row.id}`, row.headline);
    push("keyword", `product:${row.id}`, row.product_name);
  }

  return suggestions.slice(0, 2000);
}

export default async function AdSpyPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login?next=/adspy");
  }

  let suggestionCatalog: Suggestion[] = [];

  try {
    suggestionCatalog = await loadSuggestionCatalog();
  } catch (catalogError) {
    console.error("[AdSpy page] Suggestion catalog failed:", catalogError);
  }

  return (
    <main className="adspy-page">
      <header className="zt-appbar">
        <Link href="/dashboard" className="zt-brand">
          <span className="zt-brand-mark">Z</span>
          <span>zooptrack</span>
        </Link>

        <nav className="zt-appnav" aria-label="Product navigation">
          <Link href="/dashboard">Profit OS</Link>
          <Link href="/adspy" className="active" aria-current="page">
            AdSpy
          </Link>
          <Link href="/zwirk">ZWIRK</Link>
          <Link href="/brand-vault">Brand Vault</Link>
        </nav>

        <div className="zt-app-actions">
          <span className="zt-app-email" title={user.email ?? ""}>
            {user.email ?? ""}
          </span>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <AdSpySection initialSuggestionCatalog={suggestionCatalog} />
    </main>
  );
}
