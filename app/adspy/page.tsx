import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { BrandLogo } from "@/components/app/BrandLogo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AdSpySection } from "@/components/dashboard/AdSpySection";
import { createClient } from "@/lib/supabase/server";

export default async function AdSpyPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login?next=/adspy");
  }

  return (
    <main className="adspy-page">
      <header className="zt-appbar relative z-[300]">
        <BrandLogo />
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
      <AdSpySection />
    </main>
  );
}
