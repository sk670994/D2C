import Link from "next/link";
import { redirect } from "next/navigation";

import { AdSpySection } from "@/components/dashboard/AdSpySection";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { BrandLogo } from "@/components/app/BrandLogo";
import { AdSpy3DAtmosphere } from "@/components/ui/adspy/AdSpy3DAtmosphere";

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
      <AdSpy3DAtmosphere />

      <header className="zt-appbar relative z-[200]">
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

      <div className="relative z-10">
        <AdSpySection />
      </div>
    </main>
  );
}
