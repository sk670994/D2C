import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

import { decodePrompt, normalizeDecoded, parseModelJson, TAXONOMY_VERSION, type Decoded } from "./taxonomy";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

type CreativeForDecode = {
  id: string;
  advertiser_id: string | null;
  advertiser_name: string | null;
  headline: string | null;
  primary_text: string | null;
  call_to_action: string | null;
  creative_type: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
};

export function decodeModel(): string {
  return (process.env.GEMINI_DECODE_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash").replace(/^models\//, "");
}

async function fetchImage(url: string | null): Promise<{ mimeType: string; data: string } | null> {
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(mimeType)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
    return { mimeType, data: bytes.toString("base64") };
  } catch {
    return null;
  }
}

/** One Gemini call: image (when available) + copy -> taxonomy answers. */
export async function decodeCreative(ad: CreativeForDecode, apiKey: string): Promise<Decoded> {
  const image = (await fetchImage(ad.thumbnail_url)) ?? (await fetchImage(ad.image_url));
  const parts: Array<Record<string, unknown>> = [
    {
      text: decodePrompt({
        advertiser: ad.advertiser_name,
        headline: ad.headline,
        copy: ad.primary_text,
        cta: ad.call_to_action,
        format: ad.creative_type,
      }),
    },
  ];
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });

  const response = await fetch(`${GEMINI_BASE}/models/${decodeModel()}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 600, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
  const body = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const parsed = parseModelJson(text);
  if (!parsed) throw new Error("Model did not return JSON.");
  return normalizeDecoded(parsed);
}

/**
 * Decode up to `limit` ads that have no decode yet: live ads of watched
 * brands first (the ads people actually look at), then any recent live ad.
 * Safe to run anywhere (worker, cron); needs GEMINI_API_KEY.
 */
export async function decodePendingAds(options: { limit?: number; deadlineAt?: number } = {}): Promise<{ decoded: number; failed: number; skipped: string | null }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { decoded: 0, failed: 0, skipped: "GEMINI_API_KEY not set" };
  const limit = Math.max(1, Math.min(options.limit ?? 20, 200));
  const client = createGlobalServiceClient();

  const watched = await client.from("adspy_advertiser_watchlists").select("advertiser_id").eq("platform", "meta").limit(500);
  if (watched.error && /42P01|does not exist/i.test(watched.error.message)) return { decoded: 0, failed: 0, skipped: "watchlist table missing" };
  const pageIds = Array.from(new Set((watched.data ?? []).map((r) => String((r as { advertiser_id: unknown }).advertiser_id)).filter((id) => /^\d+$/.test(id))));

  const SELECT = "id,advertiser_id,advertiser_name,headline,primary_text,call_to_action,creative_type,thumbnail_url,image_url";
  const candidates: CreativeForDecode[] = [];
  const seen = new Set<string>();
  const addBatch = async (build: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    const { data, error } = await build();
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as CreativeForDecode[];
    if (!rows.length) return;
    const ids = rows.map((r) => r.id);
    const done = await client.from("ad_creative_decodes").select("creative_id").in("creative_id", ids);
    if (done.error) throw new Error(done.error.message);
    const decoded = new Set((done.data ?? []).map((r) => String((r as { creative_id: unknown }).creative_id)));
    for (const row of rows) {
      if (!decoded.has(row.id) && !seen.has(row.id)) {
        seen.add(row.id);
        candidates.push(row);
      }
    }
  };

  for (let i = 0; i < pageIds.length && candidates.length < limit; i += 20) {
    await addBatch(() =>
      client
        .from("ad_intelligence_creatives")
        .select(SELECT)
        .eq("platform", "meta")
        .eq("is_currently_active", true)
        .in("advertiser_id", pageIds.slice(i, i + 20))
        .order("first_seen_at", { ascending: false, nullsFirst: false })
        .limit(150),
    );
  }
  if (candidates.length < limit) {
    await addBatch(() =>
      client
        .from("ad_intelligence_creatives")
        .select(SELECT)
        .eq("platform", "meta")
        .eq("is_currently_active", true)
        .order("first_seen_at", { ascending: false, nullsFirst: false })
        .limit(150),
    );
  }

  let decoded = 0;
  let failed = 0;
  const model = decodeModel();
  for (const ad of candidates.slice(0, limit)) {
    if (options.deadlineAt && Date.now() > options.deadlineAt) break;
    try {
      const elements = await decodeCreative(ad, apiKey);
      const { error } = await client.from("ad_creative_decodes").upsert({
        creative_id: ad.id,
        advertiser_id: ad.advertiser_id,
        model,
        taxonomy_version: TAXONOMY_VERSION,
        elements,
        status: "done",
        error: null,
        decoded_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      decoded += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      // Rate limits: stop this batch and try again next run.
      if (/Gemini 429|RESOURCE_EXHAUSTED/i.test(message)) break;
      await client.from("ad_creative_decodes").upsert({
        creative_id: ad.id,
        advertiser_id: ad.advertiser_id,
        model,
        taxonomy_version: TAXONOMY_VERSION,
        elements: {},
        status: "failed",
        error: message.slice(0, 300),
        decoded_at: new Date().toISOString(),
      });
    }
  }
  return { decoded, failed, skipped: null };
}

/** Decodes for a set of creative ids (chunked to keep URLs short). */
export async function loadDecodes(creativeIds: string[]): Promise<Map<string, Decoded>> {
  const client = createGlobalServiceClient();
  const out = new Map<string, Decoded>();
  for (let i = 0; i < creativeIds.length; i += 150) {
    const { data, error } = await client
      .from("ad_creative_decodes")
      .select("creative_id,elements")
      .eq("status", "done")
      .in("creative_id", creativeIds.slice(i, i + 150));
    if (error) {
      if (!/42P01|PGRST205|does not exist/i.test(error.message)) console.warn("[decode] load failed", error.message);
      return out;
    }
    for (const row of (data ?? []) as Array<{ creative_id: string; elements: unknown }>) {
      out.set(String(row.creative_id), normalizeDecoded(row.elements));
    }
  }
  return out;
}
