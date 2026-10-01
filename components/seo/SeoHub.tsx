import Link from "next/link";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import styles from "./SeoPage.module.css";
import { seoPath, type SeoEntry } from "@/lib/seo/site";

export function SeoHub({ label, title, copy, entries }: { label: string; title: string; copy: string; entries: SeoEntry[] }) {
  return <main className={styles.hub}><header className={styles.hubHeader}><Link href="/" aria-label="Zooptrack home"><ZooptrackLogo height={30} tone="blue" /></Link><nav><Link href="/brand">Brands</Link><Link href="/guides">Guides</Link><Link href="/tools">Tools</Link><Link href="/industries">Industries</Link><Link href="/research">Research</Link></nav></header><div className={styles.hubWrap}><p className={styles.label}>{label}</p><h1>{title}</h1><p>{copy}</p><div className={styles.hubGrid}>{entries.map((entry) => <Link key={entry.slug} href={seoPath(entry)}><strong>{entry.h1}</strong><span>{entry.description}</span></Link>)}</div></div></main>;
}
