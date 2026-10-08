import Link from "next/link";

import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { liveHref, titleForHref } from "@/lib/seo/site";

import styles from "./SeoPage.module.css";
import m from "./Market.module.css";

/** Shared header, breadcrumbs, related links and closing CTA for SEO pages. */
export function SeoTopbar({ path }: { path: string }) {
  return (
    <header className={styles.topbar}>
      <Link href="/" aria-label="Zooptrack home">
        <ZooptrackLogo height={30} tone="blue" priority />
      </Link>
      <nav aria-label="Research navigation">
        <Link href="/brand">Brands</Link>
        <Link href="/industries">Industries</Link>
        <Link href="/research">Research</Link>
        <Link href="/guides">Guides</Link>
        <Link href="/tools">Tools</Link>
        <Link className={styles.cta} href={`/login?next=${encodeURIComponent(path)}`}>
          Try Zooptrack free
        </Link>
      </nav>
    </header>
  );
}

export function Crumbs({ items }: { items: Array<{ name: string; href?: string }> }) {
  return (
    <nav className={m.crumbs} aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={it.name}>
          {it.href ? <Link href={it.href}>{it.name}</Link> : it.name}
          {i < items.length - 1 ? " / " : ""}
        </span>
      ))}
    </nav>
  );
}

export function RelatedLinks({ hrefs, title = "Go one layer deeper." }: { hrefs: string[]; title?: string }) {
  const unique = [...new Set(hrefs.map(liveHref))];
  if (!unique.length) return null;
  return (
    <section className={styles.related}>
      <div>
        <span className={styles.eyebrow}>KEEP RESEARCHING</span>
        <h2>{title}</h2>
      </div>
      <div className={styles.relatedGrid}>
        {unique.map((href) => (
          <Link key={href} href={href}>
            <span>{titleForHref(href)}</span>
            <b>→</b>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function FooterCta({ title, copy }: { title: string; copy: string }) {
  return (
    <footer className={styles.footerCta}>
      <span className={styles.eyebrow}>ZOOPTRACK / NEXT STEP</span>
      <h2>{title}</h2>
      <p>{copy}</p>
      <Link className={styles.primary} href="/login">
        Start the free trial
      </Link>
    </footer>
  );
}

export function Faqs({ faqs }: { faqs: Array<{ q: string; a: string }> }) {
  if (!faqs.length) return null;
  return (
    <section className={styles.faq}>
      <span className={styles.eyebrow}>FAQ</span>
      <h2>Common questions.</h2>
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

export function updatedLabel(): string {
  return new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}
