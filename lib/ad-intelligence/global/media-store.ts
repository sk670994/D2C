import "server-only";

import { createHash } from "node:crypto";

import type { CompetitorAd } from "@/lib/ad-intelligence/types";
import { createGlobalServiceClient } from "./supabase";

/**
 * Copies ad preview images into Supabase Storage so they keep working after
 * Meta's signed CDN links expire (usually within days).
 *
 * Enabled by ADSPY_STORE_MEDIA=1, or automatically in the background
 * collector (ADSPY_BROWSER=playwright). Only ads with a stable Library ID
 * are rehosted, so the stored path never changes between runs.
 */

const BUCKET = "ad-media";
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 8_000;
const CONCURRENCY = 6;

let bucketReady: Promise<boolean> | null = null;

export function mediaStoreEnabled(): boolean {
  return process.env.ADSPY_STORE_MEDIA === "1" || process.env.ADSPY_BROWSER === "playwright";
}

function storagePrefix(): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/`;
}

export function isStoredMediaUrl(value?: string | null): boolean {
  return Boolean(value && value.startsWith(storagePrefix()));
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
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) return null;

    const path = `${key}.${extFor(type)}`;
    const { error } = await createGlobalServiceClient()
      .storage.from(BUCKET)
      .upload(path, bytes, { contentType: type, upsert: true, cacheControl: "31536000" });
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
  if (!(await ensureBucket())) return 0;

  let stored = 0;
  const jobs: Array<() => Promise<void>> = [];
  for (const ad of ads) {
    const id = ad.id?.trim();
    if (!id) continue;
    const base = `${ad.platform}/${createHash("sha1").update(id).digest("hex").slice(0, 2)}/${id.replace(/[^\w-]/g, "_")}`;
    for (const field of ["thumbnailUrl", "imageUrl"] as const) {
      const url = ad[field];
      if (!url || isStoredMediaUrl(url)) continue;
      jobs.push(async () => {
        const next = await rehost(url, `${base}-${field === "thumbnailUrl" ? "thumb" : "image"}`);
        if (next) {
          ad[field] = next;
          stored += 1;
        }
      });
    }
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
