"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/components/auth/SignOutButton";

const LINKS = [
  { href: "/dashboard", label: "Command" },
  { href: "/adspy", label: "Market" },
  { href: "/zwirk", label: "ZWIRK" },
  { href: "/brand-vault", label: "Brand" }
] as const;

export function AppNav({ email }: { email?: string | null }) {
  const pathname = usePathname();

  return (
    <header className="zt-appbar">
      <Link href="/dashboard" className="zt-brand">
        <span className="zt-brand-mark">Z</span>
        <span>zooptrack</span>
      </Link>
      <nav className="zt-appnav" aria-label="Product navigation">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link key={link.href} href={link.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="zt-app-actions">
        {email ? <span className="zt-app-email" title={email}>{email}</span> : null}
        <ThemeToggle />
        {email ? <SignOutButton /> : <Link href="/login">Sign in</Link>}
      </div>
    </header>
  );
}
