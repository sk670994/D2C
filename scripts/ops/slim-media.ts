/**
 * Shrink the ad-media bucket to fit the Supabase Free plan (1 GB).
 *
 *   npx tsx scripts/ops/slim-media.ts            # dry run: shows what it would do
 *   npx tsx scripts/ops/slim-media.ts --apply    # do it
 *
 * For every ad that points at a stored image:
 *   - stopped more than --stale-days (default 45) days ago -> delete its image,
 *     the card then shows the ad's hook instead (old, dead ads)
 *   - otherwise -> re-encode to one small WebP (640 px, ~30-60 KB), point both
 *     thumbnail and image at it, delete the old full-size copies
 * Files no ad points at any more are deleted too.
 * Gentle on the database: 2 at a time with short pauses. Safe to stop and re-run.
 * Reads keys from worker\.env.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
const staleIdx = args.indexOf("--stale-days");
const STALE_DAYS = staleIdx >= 0 ? Number(args[staleIdx + 1]) || 45 : 45;
const BUCKET = "ad-media";
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in worker\\.env");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const PREFIX = `${url}/storage/v1/object/public/${BUCKET}/`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

type Obj = { path: string; size: number };
type Row = { id: string; image_url: string | null; thumbnail_url: string | null; is_currently_active: boolean | null; last_seen_at: string | null };

async function listAll(): Promise<Map<string, Obj>> {
  const out = new Map<string, Obj>();
  const walk = async (prefix: string): Promise<void> => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`list ${prefix}: ${error.message}`);
      for (const item of data ?? []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) await walk(path);
        else out.set(path, { path, size: Number((item.metadata as { size?: number } | null)?.size ?? 0) });
      }
      if (!data || data.length < 1000) break;
    }
  };
  await walk("");
  return out;
}

async function storedRows(): Promise<Row[]> {
  const rows: Row[] = [];
  let last = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const { data, error } = await db
      .from("ad_intelligence_creatives")
      .select("id,image_url,thumbnail_url,is_currently_active,last_seen_at")
      .or(`thumbnail_url.like.${PREFIX}%,image_url.like.${PREFIX}%`)
      .gt("id", last)
      .order("id")
      .limit(1000);
    if (error) throw new Error(`creatives: ${error.message}`);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
    last = (data[data.length - 1] as Row).id;
    await sleep(300);
  }
  return rows;
}

const pathOf = (u: string | null) => (u && u.startsWith(PREFIX) ? decodeURIComponent(u.slice(PREFIX.length).split("?")[0]) : null);
const stemOf = (p: string) => p.replace(/-(thumb|image)(?=\.[a-z]+$)/, "").replace(/\.[a-z]+$/, "");

async function toWebp(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const sharp = (await import("sharp")).default;
    return new Uint8Array(await sharp(bytes, { failOn: "none", animated: false }).rotate().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 68, effort: 4 }).toBuffer());
  } catch {
    return null;
  }
}

async function main() {
  console.log(`${APPLY ? "APPLYING" : "DRY RUN (add --apply to do it)"} · stale after ${STALE_DAYS} days`);
  const objects = await listAll();
  const before = [...objects.values()].reduce((a, o) => a + o.size, 0);
  console.log(`Bucket now: ${objects.size} files, ${mb(before)}`);
  const rows = await storedRows();
  console.log(`Ads pointing at stored images: ${rows.length}`);

  const cutoff = Date.now() - STALE_DAYS * 86_400_000;
  const referenced = new Set<string>();
  let dropped = 0;
  let converted = 0;
  let failed = 0;
  let newBytes = 0;
  const toDelete = new Set<string>();

  const work = async (row: Row) => {
    const paths = [pathOf(row.thumbnail_url), pathOf(row.image_url)].filter((p): p is string => Boolean(p));
    const stale = row.is_currently_active === false && row.last_seen_at && Date.parse(row.last_seen_at) < cutoff;
    if (stale) {
      paths.forEach((p) => toDelete.add(p));
      dropped += 1;
      if (APPLY) {
        const patch: Record<string, null> = {};
        if (pathOf(row.thumbnail_url)) patch.thumbnail_url = null;
        if (pathOf(row.image_url)) patch.image_url = null;
        await db.from("ad_intelligence_creatives").update(patch).eq("id", row.id);
      }
      return;
    }
    const target = `${stemOf(paths[0])}.webp`;
    if (paths.every((p) => p === target)) {
      referenced.add(target);
      return;
    }
    const source = paths.find((p) => /-image\./.test(p)) ?? paths[0];
    if (!APPLY) {
      converted += 1;
      newBytes += Math.min(objects.get(source)?.size ?? 60_000, 60_000);
      paths.forEach((p) => p !== target && toDelete.add(p));
      referenced.add(target);
      return;
    }
    const { data: blob, error } = await db.storage.from(BUCKET).download(source);
    if (error || !blob) {
      failed += 1;
      paths.forEach((p) => referenced.add(p));
      return;
    }
    const small = await toWebp(new Uint8Array(await blob.arrayBuffer()));
    if (!small) {
      failed += 1;
      paths.forEach((p) => referenced.add(p));
      return;
    }
    const up = await db.storage.from(BUCKET).upload(target, small, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
    if (up.error) {
      failed += 1;
      paths.forEach((p) => referenced.add(p));
      return;
    }
    const next = `${PREFIX}${target}`;
    const patch: Record<string, string> = { thumbnail_url: next };
    if (pathOf(row.image_url) || !row.image_url) patch.image_url = next;
    const { error: upd } = await db.from("ad_intelligence_creatives").update(patch).eq("id", row.id);
    if (upd) {
      failed += 1;
      paths.forEach((p) => referenced.add(p));
      return;
    }
    referenced.add(target);
    paths.forEach((p) => p !== target && toDelete.add(p));
    converted += 1;
    newBytes += small.byteLength;
  };

  let i = 0;
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      while (i < rows.length) {
        const row = rows[i++];
        await work(row).catch(() => {
          failed += 1;
        });
        if (i % 100 === 0) console.log(`  ${i}/${rows.length} ads · ${converted} slimmed · ${dropped} old dropped · ${failed} skipped`);
        await sleep(APPLY ? 150 : 0);
      }
    }),
  );

  // Files no ad uses any more.
  for (const path of objects.keys()) if (!referenced.has(path)) toDelete.add(path);
  for (const path of referenced) toDelete.delete(path);
  const freed = [...toDelete].reduce((a, p) => a + (objects.get(p)?.size ?? 0), 0);

  if (APPLY) {
    const list = [...toDelete];
    for (let k = 0; k < list.length; k += 100) {
      await db.storage.from(BUCKET).remove(list.slice(k, k + 100));
      await sleep(300);
    }
  }
  // newBytes = size of the new small WebPs (estimated at 60 KB each in a dry run).
  const after = before - freed + newBytes;
  console.log(`\n${APPLY ? "Done" : "Plan"}: ${converted} images slimmed to WebP, ${dropped} old stopped ads cleared, ${toDelete.size} files ${APPLY ? "deleted" : "to delete"}, ${failed} skipped.`);
  console.log(`Bucket: ${mb(before)} -> about ${mb(Math.max(0, after))} (Free plan limit 1024 MB).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
