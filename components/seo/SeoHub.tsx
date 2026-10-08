import type { CSSProperties } from "react";
import Link from "next/link";

import { findIndustry } from "@/lib/seo/industries";
import { seoPath, type SeoEntry } from "@/lib/seo/site";

import { Shell } from "./SeoChrome";
import t from "./Themes.module.css";

/** Index page for a section: a plain, scannable list (industries show their colour). */
export function SeoHub({ title, copy, entries }: { label?: string; title: string; copy: string; entries: SeoEntry[] }) {
  const path = entries[0] ? seoPath(entries[0]).replace(/\/[^/]+$/, "") || "/" : "/";
  return (
    <Shell theme="hub" path={path}>
      <header className={t.hubHead}>
        <h1>{title}</h1>
        <p className={t.lede}>{copy}</p>
      </header>
      <ul className={t.hubList}>
        {entries.map((entry) => {
          const hue = entry.section === "industry" ? findIndustry(entry.slug)?.hue : undefined;
          return (
            <li key={entry.slug}>
              <Link href={seoPath(entry)}>
                <strong>{hue ? <i style={{ "--dot": hue } as CSSProperties} /> : null}{entry.h1}</strong>
                <span>{entry.description}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
