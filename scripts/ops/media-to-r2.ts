/**
 * Move ad images from Supabase Storage (1 GB on the Free plan) to AWS S3 or
 * Cloudflare R2 (whichever is configured, see lib/media/r2.ts).
 *
 *   npx tsx scripts/ops/media-to-r2.ts                 # dry run: counts only
 *   npx tsx scripts/ops/media-to-r2.ts --apply         # copy to R2 + repoint ads
 *   npx tsx scripts/ops/media-to-r2.ts --apply --delete-old   # ...and free Supabase space
 *
 * For every ad whose image points at the Supabase ad-media bucket: download
 * it, upload to R2 under a content-hash key (same image -> stored once), point
 * the ad's thumbnail_url / image_url at R2, then (with --delete-old) delete
 * the Supabase copy. Safe to stop and re-run: moved ads no longer match.
 * Reads keys from worker\.env: Supabase keys + either AWS_S3_BUCKET,
 * AWS_S3_REGION, AWS_S3_ACCESS_KEY_ID, AWS_S3_SECRET_ACCESS_KEY
 * or the R2_* set.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { putR2Object, r2Config } from "../../lib/media/r2";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}
loadEnvFile(join(process.cwd(), "worker", ".env"));

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DELETE_OLD = args.includes("--delete-old");
const BUCKET = "ad-media";
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const r2 = r2Config();
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in worker\\.env");
  process.exit(1);
}
if (!r2) {
  console.error("Missing AWS_S3_BUCKET / AWS_S3_ACCESS_KEY_ID / AWS_S3_SECRET_ACCESS_KEY (or the R2_* keys) in worker\\.env");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const prefix = `${url}/storage/v1/object/public/${BUCKET}/`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = { id: string; thumbnail_url: string | null; image_url: string | null };

const moved = new Map<string, string>(); // old Supabase URL -> R2 URL
const oldPaths = new Set<string>();
let ads = 0;
let uploaded = 0;
let bytes = 0;
let failed = 0;

async function moveOne(oldUrl: string): Promise<string | null> {
  const known = moved.get(oldUrl);
  if (known) return known;
  const res = await fetch(oldUrl, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res || !res.ok) return null;
  const type = (res.headers.get("content-type") ?? "image/webp").split(";")[0].trim();
  const body = new Uint8Array(await res.arrayBuffer());
  const ext = type.includes("png") ? "png" : type.includes("jpeg") || type.includes("jpg") ? "jpg" : type.includes("gif") ? "gif" : "webp";
  const next = await putR2Object(body, type, ext, { config: r2 });
  if (!next) return null;
  moved.set(oldUrl, next);
  oldPaths.add(oldUrl.slice(prefix.length));
  uploaded += 1;
  bytes += body.byteLength;
  return next;
}

async function main() {
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} · Supabase ${BUCKET} -> ${r2!.kind === "s3" ? "AWS S3" : "R2"} ${r2!.bucket} (${r2!.publicBaseUrl})${DELETE_OLD ? " · deleting old copies" : ""}`);
  let lastId = "";
  for (;;) {
    const { data, error } = await db
      .from("ad_intelligence_creatives")
      .select("id,thumbnail_url,image_url")
      .or(`thumbnail_url.like."${prefix}%",image_url.like."${prefix}%"`)
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;
    ads += rows.length;
    if (!APPLY) continue;

    for (let i = 0; i < rows.length; i += 4) {
      await Promise.all(
        rows.slice(i, i + 4).map(async (row) => {
          const patch: Partial<Row> = {};
          for (const field of ["thumbnail_url", "image_url"] as const) {
            const value = row[field];
            if (value && value.startsWith(prefix)) {
              const next = await moveOne(value);
              if (next) patch[field] = next;
            }
          }
          if (!Object.keys(patch).length) {
            failed += 1;
            return;
          }
          const { error: updateError } = await db.from("ad_intelligence_creatives").update(patch).eq("id", row.id);
          if (updateError) failed += 1;
        }),
      );
      await sleep(150); // gentle on the Free plan
    }
    process.stdout.write(`\r${ads} ads scanned · ${uploaded} images moved · ${(bytes / 1_048_576).toFixed(1)} MB · ${failed} failed`);
  }
  console.log("");

  if (!APPLY) {
    console.log(`${ads} ads still point at Supabase Storage. Run again with --apply to move them.`);
    return;
  }
  if (DELETE_OLD && oldPaths.size) {
    const paths = Array.from(oldPaths);
    let removed = 0;
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await db.storage.from(BUCKET).remove(paths.slice(i, i + 100));
      if (!error) removed += Math.min(100, paths.length - i);
      await sleep(200);
    }
    console.log(`Deleted ${removed} old files from Supabase Storage.`);
  }
  console.log(`Done: ${uploaded} images (${(bytes / 1_048_576).toFixed(1)} MB) now on ${r2!.kind === "s3" ? "AWS S3" : "R2"}; ${failed} ads failed (re-run to retry).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
