import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { dataStamp } from "@/lib/seo/data-date";
import { liveHref, titleForHref } from "@/lib/seo/site";

import t from "./Themes.module.css";

export type Theme = "product" | "brand" | "industry" | "research" | "guide" | "tool" | "hub";

const THEME_CLASS: Record<Theme, string> = {
  product: t.product,
  brand: "",
  industry: t.industry,
  research: t.research,
  guide: t.guide,
  tool: t.tool,
  hub: "",
};

/** Page frame for every public research page: theme surface + top bar. */
export function Shell({ theme, path, style, children, dark }: { theme: Theme; path: string; style?: CSSProperties; children: ReactNode; dark?: boolean }) {
  return (
    <main className={`${t.root} ${THEME_CLASS[theme]}`} style={style}>
      <div className={dark ? t.darkTop : undefined}>
        <SeoTopbar path={path} dark={dark} />
      </div>
      {children}
    </main>
  );
}

export function SeoTopbar({ path, dark }: { path: string; dark?: boolean }) {
  return (
    <header className={t.top}>
      <Link href="/" aria-label="Zooptrack home" className={t.logo}>
        <ZooptrackLogo height={28} tone={dark ? "white" : "blue"} priority />
      </Link>
      <nav className={t.nav} aria-label="Research">
        <Link href="/brand">Brands</Link>
        <Link href="/industries">Industries</Link>
        <Link href="/seasons">Seasons</Link>
        <Link href="/research">Research</Link>
        <Link href="/guides">Guides</Link>
        <Link href="/tools">Tools</Link>
        <Link className={t.cta} href={`/login?next=${encodeURIComponent(path)}`}>
          Try it free
        </Link>
      </nav>
    </header>
  );
}

export function Crumbs({ items }: { items: Array<{ name: string; href?: string }> }) {
  return (
    <nav className={t.crumbs} aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={it.name}>
          {it.href ? <Link href={it.href}>{it.name}</Link> : it.name}
          {i < items.length - 1 ? " / " : ""}
        </span>
      ))}
    </nav>
  );
}

export function RelatedLinks({ hrefs, title = "Keep reading" }: { hrefs: string[]; title?: string }) {
  const unique = [...new Set(hrefs.map(liveHref))];
  if (!unique.length) return null;
  return (
    <section className={`${t.wrap} ${t.related}`}>
      <h2 className={t.h2}>{title}</h2>
      <ul className={t.relatedList}>
        {unique.map((href) => (
          <li key={href}>
            <Link href={href}>{titleForHref(href)}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FooterCta({ title, copy }: { title: string; copy: string }) {
  return (
    <footer className={t.foot}>
      <h2>{title}</h2>
      <div>
        <p>{copy}</p>
        <Link className={t.btn} href="/login">
          Start free trial
        </Link>
      </div>
    </footer>
  );
}

export function Faqs({ faqs, title = "Questions people ask" }: { faqs: Array<{ q: string; a: string }>; title?: string }) {
  if (!faqs.length) return null;
  return (
    <section className={`${t.wrap} ${t.faq}`}>
      <h2 className={t.h2}>{title}</h2>
      <div>
        {faqs.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/**
 * Build-date label. Only for pages with no data date (editorial guides);
 * data pages use <DataDate> with the date of the data they show.
 */
export function updatedLabel(): string {
  return new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

/**
 * "Data collected 19 Oct 2026" from the newest data the page renders, plus a
 * quiet "refresh pending" when that is older than 36 hours. Falls back to the
 * build date only when there is no data date at all.
 */
export function DataDate({ date, className = t.note, style, before }: { date: string | null | undefined; className?: string; style?: CSSProperties; before?: ReactNode }) {
  const stamp = dataStamp(date);
  return (
    <p className={className} style={style}>
      {before}
      {stamp.fromData ? <time dateTime={stamp.iso}>{stamp.text}</time> : stamp.text}
      {stamp.pending ? <span style={{ opacity: 0.7 }}> · refresh pending</span> : null}.
    </p>
  );
}
