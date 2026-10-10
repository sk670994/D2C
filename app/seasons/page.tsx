import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { Shell } from "@/components/seo/SeoChrome";
import t from "@/components/seo/Themes.module.css";
import { SEASONS } from "@/lib/seo/seasons";

export const metadata: Metadata = {
  title: "Festival and Seasonal Ads in India",
  description: "Live calendars of Indian festival and seasonal ads on Facebook and Instagram: when each season peaks, which brands advertise most and what they offer.",
  alternates: { canonical: "/seasons" },
};

export default function SeasonsPage() {
  return (
    <Shell theme="hub" path="/seasons">
      <header className={t.hubHead}>
        <h1>Festival and season ad calendars</h1>
        <p className={t.lede}>When Indian brands advertise for Diwali, Dussehra, the festive season, sale days, winter, summer and the monsoon, who advertises most, and what they offer. Counted from real ads, refreshed every few hours.</p>
      </header>
      <ul className={t.hubList}>
        {SEASONS.map((s) => (
          <li key={s.slug}>
            <Link href={`/seasons/${s.slug}`}>
              <strong><i style={{ "--dot": s.hue } as CSSProperties} />{s.name}</strong>
              <span>{s.when}. {s.intro.split(". ")[0]}.</span>
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
