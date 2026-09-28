import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { askJev, JevError, jevKey } from "@/lib/ai/jev";
import { createLedger } from "@/lib/ai/ledger";

import { hasText, jevQuestions, jevState, labelsFromJev, mergeDecodes, needsVisualRead, type JevLabels } from "./jev-labels";
import { cleanEnvValue, decodePrompt, isKeyError, isRetryableError, normalizeDecoded, parseModelJson, shouldSkipDecode, TAXONOMY_VERSION, type Decoded } from "./taxonomy";

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
  first_seen_at?: string | null;
  is_currently_active?: boolean | null;
};

type DecodeRow = { creative_id: unknown; status: string | null; decoded_at: string | null; model: string | null; elements: unknown };

/** Decodes written by Jev alone: text labels, no visual read yet. */
export const isJevOnly = (model: string | null | undefined) => /^jev:/.test(String(model ?? ""));

export function decodeModel(): string {
  return (cleanEnvValue(process.env.GEMINI_DECODE_MODEL) || cleanEnvValue(process.env.GEMINI_MODEL) || "gemini-2.5-flash").replace(/^models\//, "");
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

export type GeminiDecode = { elements: Decoded; inputTokens: number; outputTokens: number; ms: number };

/** One Gemini call: image (when available) + copy -> taxonomy answers. */
export async function decodeCreative(ad: CreativeForDecode, apiKey: string): Promise<Decoded> {
  return (await decodeCreativeWithUsage(ad, apiKey)).elements;
}

export async function decodeCreativeWithUsage(ad: CreativeForDecode, apiKey: string): Promise<GeminiDecode> {
  const started = Date.now();
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
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const parsed = parseModelJson(text);
  if (!parsed) throw new Error("Model did not return JSON.");
  return {
    elements: normalizeDecoded(parsed),
    inputTokens: Number(body.usageMetadata?.promptTokenCount ?? 0),
    outputTokens: Number(body.usageMetadata?.candidatesTokenCount ?? 0) + Number(body.usageMetadata?.thoughtsTokenCount ?? 0),
    ms: Date.now() - started,
  };
}

/** Jev's labels stored inside a decode row (kept next to the taxonomy fields). */
function jevFromRow(row: DecodeRow | undefined): JevLabels | null {
  if (!row || !row.elements || typeof row.elements !== "object") return null;
  const e = row.elements as Record<string, unknown>;
  const confidence = (e._confidence && typeof e._confidence === "object" ? e._confidence : {}) as JevLabels["confidence"];
  return { elements: normalizeDecoded(e), confidence, bigPush: typeof e._bigPush === "number" ? e._bigPush : null };
}

function runningDays(firstSeen: string | null | undefined, now: number): number | null {
  const t = firstSeen ? Date.parse(firstSeen) : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86_400_000)) : null;
}

export type DecodeRunResult = { decoded: number; failed: number; skipped: string | null; labelled?: number; visualSkipped?: number };

/**
 * The AI pipeline for ads, run by the drain (idle time), the nightly cron and
 * the worker:
 *  1. Jev labels the copy of every new ad (cheap, fast; TYPESAFE_API_KEY).
 *  2. Gemini reads the image only for ads that pass triage (watched brands,
 *     running 7+ days, launches/sales) — or for every ad when Jev is off,
 *     exactly as before.
 * Every model call is written to the ai_calls cost ledger.
 */
export async function decodePendingAds(options: { limit?: number; deadlineAt?: number } = {}): Promise<DecodeRunResult> {
  const geminiKey = cleanEnvValue(process.env.GEMINI_API_KEY);
  const jevOn = Boolean(jevKey()) && process.env.JEV_LABELS !== "0";
  if (!geminiKey && !jevOn) return { decoded: 0, failed: 0, skipped: "GEMINI_API_KEY / TYPESAFE_API_KEY not set" };
  const limit = Math.max(1, Math.min(options.limit ?? 20, 200));
  const client = createGlobalServiceClient();
  const ledger = createLedger(client);
  const past = () => Boolean(options.deadlineAt && Date.now() > options.deadlineAt);

  const watched = await client.from("adspy_advertiser_watchlists").select("advertiser_id").eq("platform", "meta").limit(500);
  if (watched.error && /42P01|does not exist/i.test(watched.error.message)) return { decoded: 0, failed: 0, skipped: "watchlist table missing" };
  const pageIds = Array.from(new Set((watched.data ?? []).map((r) => String((r as { advertiser_id: unknown }).advertiser_id)).filter((id) => /^\d+$/.test(id))));
  const watchedSet = new Set(pageIds);

  const SELECT = "id,advertiser_id,advertiser_name,headline,primary_text,call_to_action,creative_type,thumbnail_url,image_url,first_seen_at,is_currently_active";

  /** Live ads, watched brands first, with their current decode row (if any). */
  const loadCandidates = async (want: (ad: CreativeForDecode, row: DecodeRow | undefined) => boolean, max: number) => {
    const out: Array<{ ad: CreativeForDecode; row: DecodeRow | undefined }> = [];
    const seen = new Set<string>();
    const addBatch = async (build: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
      const { data, error } = await build();
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as CreativeForDecode[];
      if (!rows.length) return;
      const done = await client.from("ad_creative_decodes").select("creative_id,status,decoded_at,model,elements").in("creative_id", rows.map((r) => r.id));
      if (done.error) throw new Error(done.error.message);
      const byId = new Map(((done.data ?? []) as DecodeRow[]).map((row) => [String(row.creative_id), row]));
      for (const ad of rows) {
        if (seen.has(ad.id) || out.length >= max) continue;
        seen.add(ad.id);
        if (want(ad, byId.get(ad.id))) out.push({ ad, row: byId.get(ad.id) });
      }
    };
    for (let i = 0; i < pageIds.length && out.length < max; i += 20) {
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
    if (out.length < max) {
      await addBatch(() =>
        client
          .from("ad_intelligence_creatives")
          .select(SELECT)
          .eq("platform", "meta")
          .eq("is_currently_active", true)
          .order("first_seen_at", { ascending: false, nullsFirst: false })
          .limit(300),
      );
    }
    return out;
  };

  const now = Date.now();
  let labelled = 0;
  let decoded = 0;
  let failed = 0;
  let visualSkipped = 0;

  // ---- 1. Jev: text labels for ads with no decode at all ----
  if (jevOn) {
    const jevLimit = Math.max(limit, Number(process.env.JEV_BATCH) || 60);
    const todo = await loadCandidates((ad, row) => !row && hasText(ad), jevLimit);
    const questions = jevQuestions();
    for (const { ad } of todo) {
      if (past()) break;
      try {
        const res = await askJev(jevState(ad), questions);
        ledger.record({ provider: "jev", model: res.model, purpose: "ad_labels", creativeId: ad.id, inputTokens: res.inputTokens, outputTokens: res.outputTokens, latencyMs: res.ms, ok: true });
        const labels = labelsFromJev(res.answers);
        const { error } = await client.from("ad_creative_decodes").upsert({
          creative_id: ad.id,
          advertiser_id: ad.advertiser_id,
          model: `jev:${res.model}`,
          taxonomy_version: TAXONOMY_VERSION,
          elements: { ...labels.elements, _confidence: labels.confidence, _bigPush: labels.bigPush },
          status: "done",
          error: null,
          decoded_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
        labelled += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ledger.record({ provider: "jev", model: "jev", purpose: "ad_labels", creativeId: ad.id, ok: false, error: message });
        // Bad key / plan: stop Jev for this run, Gemini still runs below.
        if (error instanceof JevError && (error.status === 401 || error.status === 403)) {
          console.error("[decode] Jev rejected the key:", message);
          break;
        }
        if (error instanceof JevError && error.retryable) break;
      }
    }
    await ledger.flush();
  }

  // ---- 2. Gemini: visual read for triaged ads (or all ads when Jev is off) ----
  if (geminiKey && !past()) {
    const model = decodeModel();
    const todo = await loadCandidates((ad, row) => {
      const jevOnly = row && row.status === "done" && isJevOnly(row.model);
      if (row && !jevOnly && shouldSkipDecode(row, now)) return false; // already read, or failed recently
      if (!jevOn) return true; // previous behaviour: every ad
      const jev = jevFromRow(row);
      const pass = needsVisualRead({
        watched: watchedSet.has(String(ad.advertiser_id ?? "")),
        isActive: ad.is_currently_active ?? null,
        runningDays: runningDays(ad.first_seen_at, now),
        hasMedia: Boolean(ad.thumbnail_url || ad.image_url),
        bigPush: jev?.bigPush ?? null,
      });
      if (!pass) visualSkipped += 1;
      return pass;
    }, limit);

    for (const { ad, row } of todo) {
      if (past()) break;
      try {
        let res: GeminiDecode;
        try {
          res = await decodeCreativeWithUsage(ad, geminiKey);
        } catch (first) {
          // One quick retry for timeouts and Google-side 5xx.
          if (!isRetryableError(first instanceof Error ? first.message : String(first))) throw first;
          await new Promise((resolve) => setTimeout(resolve, 2_000));
          res = await decodeCreativeWithUsage(ad, geminiKey);
        }
        ledger.record({ provider: "gemini", model, purpose: "ad_visual_read", creativeId: ad.id, inputTokens: res.inputTokens, outputTokens: res.outputTokens, latencyMs: res.ms, ok: true });
        const jev = jevFromRow(row);
        const elements = mergeDecodes(res.elements, jev);
        const { error } = await client.from("ad_creative_decodes").upsert({
          creative_id: ad.id,
          advertiser_id: ad.advertiser_id,
          model: jev ? `${model}+jev` : model,
          taxonomy_version: TAXONOMY_VERSION,
          elements: jev ? { ...elements, _confidence: jev.confidence, _bigPush: jev.bigPush } : elements,
          status: "done",
          error: null,
          decoded_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
        decoded += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ledger.record({ provider: "gemini", model, purpose: "ad_visual_read", creativeId: ad.id, ok: false, error: message });
        // A bad key or model is not the ad's fault: record nothing, stop, say why.
        if (isKeyError(message)) {
          await ledger.flush();
          return { decoded, failed, labelled, visualSkipped, skipped: `Gemini rejected the key or model: ${message.slice(0, 160)}` };
        }
        failed += 1;
        // Rate limits: stop this batch and try again next run.
        if (/Gemini 429|RESOURCE_EXHAUSTED/i.test(message)) break;
        // Keep Jev's labels if we had them; only a fresh ad gets a failed row.
        if (!row) {
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
    }
  }
  await ledger.flush();
  return { decoded, failed, labelled, visualSkipped, skipped: null };
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
