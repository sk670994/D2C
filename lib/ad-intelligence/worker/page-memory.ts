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

export type RememberedPage = { pageId: string; name: string; at: string };

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
      if (key && /^\d+$/.test(pageId)) out[key] = { pageId, name: String(v?.name ?? key), at: String(v?.at ?? "") };
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

  get(key: string): RememberedPage | null {
    return this.pages[key] ?? null;
  }

  remember(key: string, page: { pageId: string; name: string }, now = new Date()): void {
    if (!key || !/^\d+$/.test(page.pageId)) return;
    const prev = this.pages[key];
    if (prev?.pageId === page.pageId && prev.name === page.name) return;
    this.pages[key] = { pageId: page.pageId, name: page.name, at: now.toISOString() };
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
