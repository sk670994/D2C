/**
 * Zooptrack QA: simulate N brand-new users end to end on the live site.
 *
 * Each virtual user: gets a fresh account (created with the service key, no
 * email sent) -> signs in through the real login page -> sees onboarding ->
 * starts the trial -> sets "Your brand" -> watches 5 rivals -> is blocked on
 * the 6th (plan limit) -> opens Today, a brand page, AdSpy, Plan & billing.
 * Every step is timed; page crashes, console errors and failed API calls are
 * recorded. Test accounts are deleted at the end (unless --keep).
 *
 * It never starts a Meta collection (it does not call /refresh), so running
 * it does not load the scraper or Meta.
 *
 * Run on your PC from F:\D2C (uses the keys already in worker\.env):
 *   npx tsx scripts/qa/journeys.ts --users 100 --concurrency 5
 * Options: --site https://www.zooptrack.co.in  --users 20  --concurrency 5
 *          --keep (keep test accounts)  --headed (watch the browsers)
 *          --cleanup-only (delete leftover qa+ accounts and exit)
 * Output: qa-report/report.html (+ report.json, screenshots of failures)
 */
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "playwright-core";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------- config ----------
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(join(process.cwd(), "worker", ".env"));
loadEnvFile(join(process.cwd(), ".env.local"));

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SITE = opt("site", "https://www.zooptrack.co.in").replace(/\/+$/, "");
const USERS = Math.max(1, Math.min(500, Number(opt("users", "20"))));
const CONCURRENCY = Math.max(1, Math.min(20, Number(opt("concurrency", "5"))));
const KEEP = flag("keep");
const HEADED = flag("headed");
const QA_DOMAIN = opt("email-domain", "zooptrack.co.in");
const RUN_ID = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
const OUT = join(process.cwd(), "qa-report");
const RIVAL_QUERIES = ["Mamaearth", "Minimalist", "Plum", "Foxtale", "Sugar Cosmetics", "The Derma Co", "Beardo", "boAt"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (put them in worker\\.env).");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// ---------- types ----------
type Step = { name: string; ok: boolean; ms: number; detail?: string };
type UserResult = { n: number; email: string; ok: boolean; steps: Step[]; consoleErrors: string[]; failedRequests: string[]; screenshot?: string };

// ---------- helpers ----------
async function listQaUsers(): Promise<Array<{ id: string; email: string }>> {
  const out: Array<{ id: string; email: string }> = [];
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.email?.startsWith("qa+") && u.user_metadata?.zooptrack_qa) out.push({ id: u.id, email: u.email });
    if (data.users.length < 200) break;
  }
  return out;
}

async function cleanup(ids?: string[]) {
  const targets = ids ?? (await listQaUsers()).map((u) => u.id);
  let deleted = 0;
  for (const id of targets) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error) deleted += 1;
  }
  return deleted;
}

async function step(steps: Step[], name: string, fn: () => Promise<string | void>) {
  const t = Date.now();
  try {
    const detail = (await fn()) || undefined;
    steps.push({ name, ok: true, ms: Date.now() - t, detail });
    return true;
  } catch (error) {
    steps.push({ name, ok: false, ms: Date.now() - t, detail: error instanceof Error ? error.message.slice(0, 300) : String(error) });
    return false;
  }
}

function must(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

async function api(page: Page, method: "GET" | "POST", path: string, body?: unknown) {
  const response = method === "GET" ? await page.request.get(`${SITE}${path}`) : await page.request.post(`${SITE}${path}`, { data: body ?? {} });
  let json: Record<string, unknown> = {};
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    /* not json */
  }
  return { status: response.status(), json };
}

// ---------- rival pool (resolved once, through the first signed-in user) ----------
type Rival = { pageId: string; label: string };
let poolPromise: Promise<Rival[]> | null = null;
function rivalPool(page: Page): Promise<Rival[]> {
  poolPromise ??= (async () => {
    const rivals: Rival[] = [];
    for (const q of RIVAL_QUERIES) {
      const { json } = await api(page, "GET", `/api/ad-intelligence/autocomplete?q=${encodeURIComponent(q)}&country=IN`).catch(() => ({ json: {} as Record<string, unknown> }));
      const list = (json.advertisers as Rival[] | undefined) ?? [];
      const hit = list.find((a) => /^\d+$/.test(String(a.pageId)) && !rivals.some((x) => x.pageId === String(a.pageId)));
      if (hit) rivals.push({ pageId: String(hit.pageId), label: hit.label });
    }
    console.log(`Rival pool: ${rivals.map((x) => x.label).join(", ") || "none found"}`);
    return rivals;
  })();
  return poolPromise;
}

// ---------- one virtual user ----------
async function runUser(browser: Browser, n: number, created: string[]): Promise<UserResult> {
  const email = `qa+${RUN_ID}-${String(n).padStart(3, "0")}@${QA_DOMAIN}`;
  const password = `Qa-${randomBytes(9).toString("base64url")}`;
  const result: UserResult = { n, email, ok: false, steps: [], consoleErrors: [], failedRequests: [] };
  const steps = result.steps;

  const made = await step(steps, "create account", async () => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `QA User ${n}`, zooptrack_qa: true } });
    if (error) throw error;
    created.push(data.user.id);
  });
  if (!made) return result;

  const context = await browser.newContext({ viewport: n % 3 === 0 ? { width: 390, height: 844 } : { width: 1366, height: 800 } });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") result.consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => result.consoleErrors.push(`PAGE CRASH: ${e.message.slice(0, 200)}`));
  page.on("response", (r) => {
    if (r.url().startsWith(SITE) && r.status() >= 500) result.failedRequests.push(`${r.status()} ${r.url().replace(SITE, "")}`);
  });

  try {
    const signedIn = await step(steps, "sign in (login page)", async () => {
      await page.goto(`${SITE}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.fill("#email", email);
      await page.fill("#password", password);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/today/, { timeout: 45_000 });
    });
    if (!signedIn) throw new Error("stop");
    const rivals = await rivalPool(page);
    if (rivals.length < 6) steps.push({ name: "rival pool", ok: rivals.length >= 5, ms: 0, detail: `only ${rivals.length} indexed rivals found` });

    await step(steps, "Today: onboarding shown", async () => {
      await page.waitForSelector("text=Your brand", { timeout: 30_000 });
      must(await page.locator("text=Rivals to watch").count(), "rival picker missing");
    });

    await step(steps, "trial started", async () => {
      const { status, json } = await api(page, "GET", "/api/billing");
      const e = json.entitlement as { status?: string; rivalsLimit?: number } | undefined;
      must(status === 200, `billing ${status}`);
      must(e?.status === "trialing" && e.rivalsLimit === 5, `unexpected plan ${JSON.stringify(e)}`);
    });

    await step(steps, "set Your brand", async () => {
      const { status, json } = await api(page, "POST", "/api/today/my-brand", { brandName: `QA Brand ${n}`, pageId: rivals[rivals.length - 1]?.pageId ?? "" });
      must(status === 200 && json.success, `my-brand ${status} ${JSON.stringify(json).slice(0, 120)}`);
    });

    await step(steps, "watch 5 rivals", async () => {
      for (const r of rivals.slice(0, 5)) {
        const { status } = await api(page, "POST", `/api/ad-intelligence/advertiser/${r.pageId}?country=IN`, { country: "IN" });
        must(status === 200, `watch ${r.label} -> ${status}`);
      }
    });

    await step(steps, "6th rival blocked by plan", async () => {
      const extra = rivals[5];
      if (!extra) return "skipped (fewer than 6 indexed rivals)";
      const { status } = await api(page, "POST", `/api/ad-intelligence/advertiser/${extra.pageId}?country=IN`, { country: "IN" });
      must(status === 402, `expected 402, got ${status}`);
    });

    await step(steps, "Today with rivals", async () => {
      await page.goto(`${SITE}/today`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForSelector("h1", { timeout: 30_000 });
      const { status, json } = await api(page, "GET", "/api/today");
      must(status === 200 && json.success, `today api ${status}`);
      must(Number(json.watchedCount) >= 5, `watchedCount ${json.watchedCount}`);
    });

    await step(steps, "brand page", async () => {
      const r = rivals[0];
      await page.goto(`${SITE}/today/brand/${r.pageId}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForSelector("h1", { timeout: 30_000 });
      must(!(await page.locator("text=Could not").count()), "brand page shows an error");
    });

    await step(steps, "AdSpy search", async () => {
      await page.goto(`${SITE}/adspy`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const { status, json } = await api(page, "GET", `/api/ad-intelligence/autocomplete?q=${encodeURIComponent("mamaearth")}&country=IN`);
      must(status === 200, `autocomplete ${status}`);
      must(Array.isArray(json.advertisers) && (json.advertisers as unknown[]).length > 0, "no suggestions");
    });

    await step(steps, "Plan & billing page", async () => {
      await page.goto(`${SITE}/today/billing`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForSelector("text=Growth", { timeout: 30_000 });
    });

    await step(steps, "no page crashes", async () => {
      const crashes = result.consoleErrors.filter((e) => e.startsWith("PAGE CRASH"));
      must(!crashes.length, crashes[0] ?? "");
    });
  } catch {
    /* "stop" after a failed sign-in */
  } finally {
    result.ok = result.steps.every((s) => s.ok);
    if (!result.ok) {
      mkdirSync(join(OUT, "shots"), { recursive: true });
      const shot = join("shots", `user-${n}.png`);
      await page.screenshot({ path: join(OUT, shot), fullPage: false }).catch(() => undefined);
      result.screenshot = shot;
    }
    await context.close().catch(() => undefined);
  }
  return result;
}

// ---------- report ----------
function pct(values: number[], p: number) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function writeReport(results: UserResult[], startedAt: number) {
  mkdirSync(OUT, { recursive: true });
  const names = Array.from(new Set(results.flatMap((r) => r.steps.map((s) => s.name))));
  const rows = names.map((name) => {
    const all = results.map((r) => r.steps.find((s) => s.name === name)).filter(Boolean) as Step[];
    const ok = all.filter((s) => s.ok);
    const fails = all.filter((s) => !s.ok);
    const top = Array.from(fails.reduce((m, s) => m.set(s.detail ?? "", (m.get(s.detail ?? "") ?? 0) + 1), new Map<string, number>())).sort((a, b) => b[1] - a[1])[0];
    return { name, runs: all.length, pass: ok.length, fail: fails.length, p50: pct(ok.map((s) => s.ms), 50), p95: pct(ok.map((s) => s.ms), 95), topError: top ? `${top[1]}× ${top[0]}` : "" };
  });
  const passed = results.filter((r) => r.ok).length;
  const consoleErrors = Array.from(results.flatMap((r) => r.consoleErrors).reduce((m, e) => m.set(e, (m.get(e) ?? 0) + 1), new Map<string, number>())).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const failed5xx = Array.from(results.flatMap((r) => r.failedRequests).reduce((m, e) => m.set(e, (m.get(e) ?? 0) + 1), new Map<string, number>())).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const summary = { site: SITE, users: results.length, passed, failed: results.length - passed, minutes: Math.round((Date.now() - startedAt) / 6000) / 10, steps: rows, consoleErrors, failed5xx };
  writeFileSync(join(OUT, "report.json"), JSON.stringify({ summary, results }, null, 2));
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  const html = `<!doctype html><meta charset="utf-8"><title>Zooptrack QA ${RUN_ID}</title>
<style>body{font:15px system-ui,sans-serif;margin:32px;color:#15171c;background:#f4f2ec}table{border-collapse:collapse;width:100%;background:#fff;margin:12px 0 28px}td,th{padding:8px 10px;border-bottom:1px solid #e2ded4;text-align:left;vertical-align:top}th{background:#f7f5f0}.ok{color:#0b5c37;font-weight:700}.bad{color:#8f1d1d;font-weight:700}h1{margin:0 0 6px}small{color:#5b6070}</style>
<h1>${passed === results.length ? '<span class="ok">All ' + passed + " users passed</span>" : '<span class="bad">' + (results.length - passed) + " of " + results.length + " users hit a problem</span>"}</h1>
<small>${esc(SITE)} · run ${RUN_ID} · ${summary.minutes} min · ${CONCURRENCY} at a time · every 3rd user on a phone-sized screen</small>
<h2>Steps</h2><table><tr><th>Step</th><th>Pass</th><th>Fail</th><th>Median</th><th>Slowest 5%</th><th>Most common error</th></tr>
${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="ok">${r.pass}</td><td class="${r.fail ? "bad" : ""}">${r.fail}</td><td>${(r.p50 / 1000).toFixed(1)} s</td><td>${(r.p95 / 1000).toFixed(1)} s</td><td>${esc(r.topError)}</td></tr>`).join("")}</table>
<h2>Server errors (5xx)</h2><table><tr><th>Count</th><th>Request</th></tr>${failed5xx.map(([e, c]) => `<tr><td>${c}</td><td>${esc(e)}</td></tr>`).join("") || "<tr><td colspan=2>None</td></tr>"}</table>
<h2>Browser console errors</h2><table><tr><th>Count</th><th>Message</th></tr>${consoleErrors.map(([e, c]) => `<tr><td>${c}</td><td>${esc(e)}</td></tr>`).join("") || "<tr><td colspan=2>None</td></tr>"}</table>
<h2>Users with a problem</h2><table><tr><th>#</th><th>Failed step</th><th>Screenshot</th></tr>${results
    .filter((r) => !r.ok)
    .map((r) => { const f = r.steps.find((s) => !s.ok); return `<tr><td>${r.n}</td><td>${esc(f ? `${f.name}: ${f.detail ?? ""}` : "")}</td><td>${r.screenshot ? `<a href="${r.screenshot}">open</a>` : ""}</td></tr>`; })
    .join("") || "<tr><td colspan=3>None</td></tr>"}</table>`;
  writeFileSync(join(OUT, "report.html"), html);
  return summary;
}

// ---------- main ----------
async function main() {
  if (flag("cleanup-only")) {
    console.log(`Deleted ${await cleanup()} leftover QA accounts.`);
    return;
  }
  console.log(`Zooptrack QA: ${USERS} new users on ${SITE}, ${CONCURRENCY} at a time.`);
  const startedAt = Date.now();
  const browser = await chromium.launch({ headless: !HEADED });
  const created: string[] = [];

  const results: UserResult[] = [];
  let next = 1;
  const worker = async () => {
    while (next <= USERS) {
      const n = next++;
      const r = await runUser(browser, n, created);
      results.push(r);
      const f = r.steps.find((s) => !s.ok);
      console.log(`${String(n).padStart(3)} ${r.ok ? "PASS" : "FAIL"} ${f ? `- ${f.name}: ${f.detail}` : ""}`);
    }
  };
  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    await browser.close().catch(() => undefined);
    results.sort((a, b) => a.n - b.n);
    const summary = writeReport(results, startedAt);
    if (!KEEP) console.log(`Cleaned up ${await cleanup(created)} test accounts.`);
    console.log(`\n${summary.passed}/${summary.users} passed in ${summary.minutes} min. Report: ${join(OUT, "report.html")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
