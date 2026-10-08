import "server-only";

import { createHash } from "node:crypto";

import type { CompetitorAd } from "@/lib/ad-intelligence/types";
import { isR2Url, putR2Object, r2Config } from "@/lib/media/r2";
import { createGlobalServiceClient } from "./supabase";

/**
 * Copies ad preview images into Supabase Storage so they keep working after
 * Meta's signed CDN links expire (usually within days).
 *
 * Enabled by ADSPY_STORE_MEDIA=1, or automatically in the background
 * collector (ADSPY_BROWSER=playwright). Only ads with a stable Library ID
 * are rehosted, so the stored path never changes between runs.
 *
 * One small WebP per ad (max 640 px wide, ~30-60 KB) serves both the card
 * thumbnail and the detail view. Before this, each ad kept two full-size
 * copies (~440 KB), which pushed the Free plan past its 1 GB storage.
 */

const BUCKET = "ad-media";
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 8_000;
const CONCURRENCY = 6;

let bucketReady: Promise<boolean> | null = null;

export function mediaStoreEnabled(): boolean {
  if (process.env.ADSPY_STORE_MEDIA === "0") return false;
  return (
    process.env.ADSPY_STORE_MEDIA === "1" ||
    process.env.ADSPY_BROWSER === "playwright" ||
    // API collectors (SearchApi / ScrapeCreators) on Vercel: Meta's links expire.
    process.env.ADSPY_COLLECTOR === "searchapi" ||
    Boolean(r2Config())
  );
}

/** Where new images go: Cloudflare R2 when configured, else Supabase Storage. */
export function mediaTarget(): "r2" | "supabase" {
  return r2Config() ? "r2" : "supabase";
}

function storagePrefix(): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/`;
}

/** An image we host (Supabase Storage or R2), as opposed to Meta's expiring CDN link. */
export function isStoredMediaUrl(value?: string | null): boolean {
  return Boolean(value && (value.startsWith(storagePrefix()) || isR2Url(value)));
}

async function ensureBucket(): Promise<boolean> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const storage = createGlobalServiceClient().storage;
      const existing = await storage.getBucket(BUCKET);
      if (existing.data) return true;
      const created = await storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      });
      if (created.error && !/already exists/i.test(created.error.message)) {
        console.error("[AdSpy media] bucket unavailable:", created.error.message);
        return false;
      }
      return true;
    })();
  }
  return bucketReady;
}

export const MEDIA_MAX_WIDTH = 640;
export const MEDIA_QUALITY = 68;

/** Re-encode to a small WebP; null when sharp is unavailable or the image is unreadable. */
export async function toSmallWebp(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(bytes, { failOn: "none", animated: false })
      .rotate()
      .resize({ width: MEDIA_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: MEDIA_QUALITY, effort: 4 })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

function extFor(type: string): string {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  return "jpg";
}

async function rehost(url: string, key: string): Promise<string | null> {
  if (!/^https:\/\//i.test(url) || isStoredMediaUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!response.ok || !type.startsWith("image/") || type.includes("svg")) return null;
    const original = new Uint8Array(await response.arrayBuffer());
    if (!original.byteLength || original.byteLength > MAX_BYTES) return null;

    const small = await toSmallWebp(original);
    const bytes = small ?? original;
    const contentType = small ? "image/webp" : type;
    const ext = small ? "webp" : extFor(type);
    if (mediaTarget() === "r2") return await putR2Object(bytes, contentType, ext);
    const path = `${key}.${ext}`;
    const { error } = await createGlobalServiceClient()
      .storage.from(BUCKET)
      .upload(path, bytes, { contentType, upsert: true, cacheControl: "31536000" });
    if (error) return null;
    return `${storagePrefix()}${path}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Mutates ads in place: imageUrl / thumbnailUrl point at our storage when copied. */
export async function persistAdMedia(ads: CompetitorAd[]): Promise<number> {
  if (!mediaStoreEnabled() || !ads.length) return 0;
  if (mediaTarget() === "supabase" && !(await ensureBucket())) return 0;

  let stored = 0;
  const jobs: Array<() => Promise<void>> = [];
  for (const ad of ads) {
    const id = ad.id?.trim();
    if (!id) continue;
    const base = `${ad.platform}/${createHash("sha1").update(id).digest("hex").slice(0, 2)}/${id.replace(/[^\w-]/g, "_")}`;
    // One stored image per ad, shared by the thumbnail and the detail view.
    const already = [ad.thumbnailUrl, ad.imageUrl].find((u) => isStoredMediaUrl(u));
    if (already) {
      if (!ad.thumbnailUrl || !isStoredMediaUrl(ad.thumbnailUrl)) ad.thumbnailUrl = already;
      continue;
    }
    const source = ad.imageUrl || ad.thumbnailUrl;
    if (!source) continue;
    jobs.push(async () => {
      const next = await rehost(source, base);
      if (next) {
        ad.thumbnailUrl = next;
        if (!ad.imageUrl || ad.imageUrl === source) ad.imageUrl = next;
        stored += 1;
      }
    });
  }

  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
      while (index < jobs.length) {
        const job = jobs[index++];
        await job();
      }
    }),
  );
  return stored;
}

/**
 * Same image, served from our own domain through the CDN (app/m/[...path]).
 * Supabase-stored images become /m/<key>; anything else (R2, Meta) is returned unchanged.
 */
export function fastMediaUrl(value?: string | null): string {
  if (!value) return "";
  const prefix = storagePrefix();
  return prefix.length > 30 && value.startsWith(prefix) ? `/m/${value.slice(prefix.length)}` : value;
}
