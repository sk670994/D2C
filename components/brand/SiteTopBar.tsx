import Link from "next/link";

import { ZooptrackLogo } from "./ZooptrackLogo";

/** Slim header with the official logo for simple pages (legal, support, records, demo). */
export function SiteTopBar() {
  return (
    <div className="zt-topbar">
      <ZooptrackLogo href="/" height={28} />
      <nav aria-label="Site">
        <Link href="/pricing">Pricing</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/today" className="zt-topbar-cta">
          Open app
        </Link>
      </nav>
    </div>
  );
}
