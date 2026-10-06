import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, CalendarClock, CreditCard, LayoutDashboard, Mail, Search, Sparkles, Tags } from "lucide-react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { ThemeToggle } from "@/components/ui/theme-toggle";

import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";

import { CommandBar } from "./CommandBar";

type NavKey = "today" | "adspy" | "finder" | "vault" | "report" | "zwirk" | "profit" | "billing";

type NavItem = { key: NavKey; href: string; label: string; icon: ReactNode };

/** Grouped by what the user is doing: watching rivals, acting on it, their account. */
const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Watch",
    items: [
      { key: "today", href: "/today", label: "Today", icon: <CalendarClock aria-hidden="true" /> },
      { key: "adspy", href: "/adspy", label: "Discover ads", icon: <Search aria-hidden="true" /> },
      { key: "finder", href: "/today/finder", label: "Ad finder", icon: <Tags aria-hidden="true" /> },
      { key: "vault", href: "/brand-vault", label: "Brand Vault", icon: <BookOpen aria-hidden="true" /> },
    ],
  },
  {
    label: "Act",
    items: [
      { key: "report", href: "/today/report", label: "Report", icon: <Mail aria-hidden="true" /> },
      { key: "zwirk", href: "/zwirk", label: "ZWIRK", icon: <Sparkles aria-hidden="true" /> },
      { key: "profit", href: "/dashboard", label: "Profit OS", icon: <LayoutDashboard aria-hidden="true" /> },
    ],
  },
  {
    label: "Account",
    items: [{ key: "billing", href: "/today/billing", label: "Plan & billing", icon: <CreditCard aria-hidden="true" /> }],
  },
];

/** App frame for the redesigned screens: left rail + main column. */
export function TodayShell({ active, email, children }: { active: NavKey; email?: string | null; children: ReactNode }) {
  return (
    <div className="zd">
      <nav className="zd-rail" aria-label="Product">
        <Link href="/today" className="zd-logo" aria-label="Zooptrack, go to Today">
          <ZooptrackLogo height={30} priority />
        </Link>
        <CommandBar />
        <div className="zd-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="zd-nav-group" role="group" aria-label={group.label}>
              <span className="zd-nav-label" aria-hidden="true">
                {group.label}
              </span>
              {group.items.map((item) => (
                <Link key={item.key} href={item.href} aria-current={item.key === active ? "page" : undefined}>
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="zd-rail-foot">
          {email ? (
            <span className="zd-email" title={email}>
              {email}
            </span>
          ) : null}
          <div className="zd-row" style={{ flexWrap: "wrap", gap: 8 }}>
            <ThemeToggle />
            <SignOutButton />
          </div>
          <div className="zd-rail-legal">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </nav>
      <main className="zd-main">{children}</main>
    </div>
  );
}
