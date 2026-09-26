import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, CalendarClock, LayoutDashboard, Mail, Search, Sparkles } from "lucide-react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { ThemeToggle } from "@/components/ui/theme-toggle";

type NavKey = "today" | "adspy" | "vault" | "report" | "zwirk" | "profit";

const NAV: Array<{ key: NavKey; href: string; label: string; icon: ReactNode }> = [
  { key: "today", href: "/today", label: "Today", icon: <CalendarClock size={18} aria-hidden="true" /> },
  { key: "adspy", href: "/adspy", label: "Discover ads", icon: <Search size={18} aria-hidden="true" /> },
  { key: "vault", href: "/brand-vault", label: "Brand Vault", icon: <BookOpen size={18} aria-hidden="true" /> },
  { key: "report", href: "/today/report", label: "Monday report", icon: <Mail size={18} aria-hidden="true" /> },
  { key: "zwirk", href: "/zwirk", label: "ZWIRK", icon: <Sparkles size={18} aria-hidden="true" /> },
  { key: "profit", href: "/dashboard", label: "Profit OS", icon: <LayoutDashboard size={18} aria-hidden="true" /> },
];

/** App frame for the redesigned screens: left rail + main column. */
export function TodayShell({ active, email, children }: { active: NavKey; email?: string | null; children: ReactNode }) {
  return (
    <div className="zd">
      <nav className="zd-rail" aria-label="Product">
        <Link href="/today" className="zd-logo">
          Zooptrack
        </Link>
        <div className="zd-nav">
          {NAV.map((item) => (
            <Link key={item.key} href={item.href} aria-current={item.key === active ? "page" : undefined}>
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
        <div className="zd-rail-foot">
          {email ? (
            <span className="zd-email" title={email}>
              {email}
            </span>
          ) : null}
          <div className="zd-row" style={{ padding: "0 8px", flexWrap: "wrap" }}>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </nav>
      <main className="zd-main">{children}</main>
    </div>
  );
}
