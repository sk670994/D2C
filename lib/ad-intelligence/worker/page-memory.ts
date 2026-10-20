/**
 * Page memory for the PC collector: brand -> the Meta page it matched last.
 * A JSON file on the PC (not the database), so a slow or unreachable
 * database never makes the collector forget a brand's page.
 *
 * Default file: %LOCALAPPDATA%\zooptrack\page-memory.json
 * (override with ADSPY_PAGE_MEMORY_FILE; delete the file to forget all).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * How the page was matched: "exact" name (never re-checked), "verified"
 * (Meta-verified page with a clear lead) or "lead" (clear lead on audience).
 * Non-exact matches are looked up again after RECHECK_AFTER_MS, so a wrong
 * or outdated pick does not stick for ever.
 */
export type MatchReason = "exact" | "verified" | "lead";

export type RememberedPage = {
  pageId: string;
  name: string;
  /** When the entry was first written or last changed. */
  at: string;
  reason: MatchReason;
  /** When the match was last confirmed by a look-up. */
  checkedAt: string;
};

export const RECHECK_AFTER_MS = 14 * 24 * 60 * 60_000;

/** Pure: does this entry need a fresh look-up? Old files (no reason) do, once. */
export function needsRecheck(page: RememberedPage, now = Date.now(), maxAgeMs = RECHECK_AFTER_MS): boolean {
  if (page.reason === "exact") return false;
  const checked = new Date(page.checkedAt).getTime();
  if (!Number.isFinite(checked) || checked <= 0) return true;
  return now - checked > maxAgeMs;
}

const REASONS = new Set<MatchReason>(["exact", "verified", "lead"]);

export function pageMemoryPath(env: Record<string, string | undefined> = process.env): string {
  if (env.ADSPY_PAGE_MEMORY_FILE?.trim()) return env.ADSPY_PAGE_MEMORY_FILE.trim();
  const base = env.LOCALAPPDATA?.trim() || join(homedir(), ".local", "share");
  return join(base, "zooptrack", "page-memory.json");
}

/** Pure: parse the file body; bad or foreign content = empty memory. */
export function parsePageMemory(text: string): Record<string, RememberedPage> {
  try {
    const raw = JSON.parse(text) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, RememberedPage> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const v = value as Partial<RememberedPage> | null;
      const pageId = String(v?.pageId ?? "").trim();
      if (!key || !/^\d+$/.test(pageId)) continue;
      const at = String(v?.at ?? "");
      // Entries written before reasons existed: treat as non-exact, last
      // checked when written (or never), so they are looked up again once.
      const reason = REASONS.has(v?.reason as MatchReason) ? (v!.reason as MatchReason) : "lead";
      const checkedAt = typeof v?.checkedAt === "string" && v.checkedAt ? v.checkedAt : at;
      out[key] = { pageId, name: String(v?.name ?? key), at, reason, checkedAt };
    }
    return out;
  } catch {
    return {};
  }
}

export class PageMemory {
  private pages: Record<string, RememberedPage>;
  private dirty = false;

  constructor(private readonly file: string = pageMemoryPath()) {
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      text = ""; // first run
    }
    this.pages = parsePageMemory(text);
  }

  /** The remembered page, fresh or not (no expiry). */
  get(key: string): RememberedPage | null {
    return this.pages[key] ?? null;
  }

  /**
   * The remembered page plus whether it is due for a re-check (non-exact
   * and last confirmed more than 14 days ago). A due entry is a cache miss
   * for the caller, but stays available as a fallback if the look-up fails.
   */
  lookup(key: string, now = Date.now()): { page: RememberedPage; recheck: boolean } | null {
    const page = this.pages[key];
    if (!page) return null;
    return { page, recheck: needsRecheck(page, now) };
  }

  remember(
    key: string,
    page: { pageId: string; name: string; reason?: MatchReason },
    now = new Date(),
  ): void {
    if (!key || !/^\d+$/.test(page.pageId)) return;
    const prev = this.pages[key];
    const reason: MatchReason = page.reason ?? "lead";
    const iso = now.toISOString();
    const same = prev?.pageId === page.pageId && prev.name === page.name;
    if (same && prev.reason === reason && !needsRecheck(prev, now.getTime())) return;
    this.pages[key] = {
      pageId: page.pageId,
      name: page.name,
      at: same ? prev.at : iso,
      reason,
      checkedAt: iso,
    };
    this.dirty = true;
  }

  /** Atomic write (temp file + rename), so a crash never leaves half a file. */
  save(): void {
    if (!this.dirty) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.pages, null, 2), "utf8");
      renameSync(tmp, this.file);
      this.dirty = false;
    } catch (error) {
      console.warn("  page memory not saved:", error instanceof Error ? error.message : error);
    }
  }

  get size(): number {
    return Object.keys(this.pages).length;
  }
}
