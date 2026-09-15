import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import {
  discoverAdvertisers,
  type AdvertiserDiscoveryResult,
} from "@/lib/ad-intelligence/discovery/advertiser-discovery";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 15_000;
const CACHE_MAX = 120;
type AdvertiserSuggestion = {
  id: string;
  pageId: string;
  label: string;
  type: "advertiser";
  domain: string | null;
  profileUrl: string | null;
  profileImageUrl: string | null;
  category: string | null;
  verification: string | null;
  likes: number | null;
  igFollowers: number | null;
  source: "indexed" | "meta_public";
  country: string;
};
const cache = new Map<string, { expiresAt: number; advertisers: AdvertiserSuggestion[] }>();
type AutocompleteResponse = Awaited<ReturnType<typeof buildResponse>>;
const inflight = new Map<string, Promise<AutocompleteResponse>>();

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function relevant(query: string, label: string, domain?: string | null): boolean {
  const q = normalize(query);
  const l = normalize(label);
  const d = normalize(domain ?? "");
  if (!q || !l) return false;
  if (l === q || l.startsWith(q) || l.includes(q)) return true;
  if (d === q || d.startsWith(q) || d.includes(q)) return true;
  const tokens = q.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => l.includes(token));
}

function localItem(item: AdvertiserDiscoveryResult): AdvertiserSuggestion {
  return {
    id: item.id,
    pageId: item.pageId,
    label: item.label,
    type: "advertiser" as const,
    domain: item.domain,
    profileUrl: item.profileUrl,
    profileImageUrl: item.profileImageUrl,
    category: item.category,
    verification: item.verification,
    likes: item.likes,
    igFollowers: item.igFollowers,
    source: "indexed" as const,
    country: item.country,
  };
}

function rank(query: string, item: AdvertiserSuggestion): number {
  const q = normalize(query);
  const l = normalize(item.label);
  if (l === q) return 1000;
  if (l.replace(/[^\p{L}\p{N}]+/gu, "") === q.replace(/[^\p{L}\p{N}]+/gu, "")) return 900;
  if (l.startsWith(q)) return 800;
  const firstWord = l.split(" ")[0] ?? "";
  if (firstWord.startsWith(q)) return 750;
  if (l.includes(q)) return 650;
  if (q.split(" ").every((token) => l.includes(token))) return 550;
  return 0;
}

async function buildResponse(query: string, country: string) {
  // Interactive autocomplete must stay on the local indexed advertiser catalog.
  // Live Meta browser discovery is intentionally excluded from the keystroke path.
  const localSettled = await Promise.allSettled([
    discoverAdvertisers({ query, platform: "meta", country, limit: 12 }),
  ]);

  const localResult = localSettled[0];
  const local: AdvertiserSuggestion[] =
    localResult?.status === "fulfilled"
      ? localResult.value
          .map(localItem)
          .filter((item: AdvertiserSuggestion) => relevant(query, item.label, item.domain))
      : [];

  const seen = new Set<string>();
  const merged = local
    .sort((a, b) => {
      const score = rank(query, b) - rank(query, a);
      return score !== 0 ? score : a.label.localeCompare(b.label);
    })
    .filter((item) => {
      const key = item.pageId || normalize(item.label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  return {
    success: true as const,
    advertisers: merged,
    source: merged.length ? "indexed" : "none",
  };
}

function writeCache(key: string, advertisers: AdvertiserSuggestion[]) {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, advertisers });
  while (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;
    if (!first) break;
    cache.delete(first);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await createServerAuthClient();
    const { data: { user }, error } = await auth.auth.getUser();
    if (error || !user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const rate = checkRateLimit(`adspy-autocomplete:${user.id}`, 120, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many autocomplete requests." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      );
    }

    const params = request.nextUrl.searchParams;
    const query = (params.get("q") ?? "").replace(/\s+/g, " ").trim();
    const country = (params.get("country") ?? "IN").trim().toUpperCase();
    if (!query || !/^[A-Z]{2}$/.test(country)) {
      return NextResponse.json({ success: true, advertisers: [], source: "none" });
    }

    const key = `${country}|${normalize(query)}`;
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return NextResponse.json(
        { success: true, advertisers: hit.advertisers, source: "cache" },
        { headers: { "Cache-Control": "private, max-age=8, stale-while-revalidate=30" } },
      );
    }

    let requestPromise = inflight.get(key);
    if (!requestPromise) {
      requestPromise = buildResponse(query, country);
      inflight.set(key, requestPromise);
      void requestPromise.finally(() => {
        if (inflight.get(key) === requestPromise) inflight.delete(key);
      });
    }

    const result = await requestPromise;
    writeCache(key, result.advertisers);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, max-age=8, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    console.error("[ADSPY_AUTOCOMPLETE_COMPLETE]", error);
    return NextResponse.json(
      { success: false, advertisers: [], source: "none", error: error instanceof Error ? error.message : "Autocomplete unavailable." },
      { status: 503 },
    );
  }
}
