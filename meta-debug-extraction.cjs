const { chromium } = require("playwright-core");
const fs = require("fs");

const pageId = "619181354927737";

const url =
  "https://www.facebook.com/ads/library/?" +
  new URLSearchParams({
    active_status: "all",
    ad_type: "all",
    country: "IN",
    is_targeted_country: "false",
    media_type: "all",
    search_type: "page",
    view_all_page_id: pageId,
  }).toString();

const candidates = [
  process.env.CHROME_EXECUTABLE_PATH,
  process.env.EDGE_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const executablePath = candidates.find((x) => fs.existsSync(x));

if (!executablePath) {
  throw new Error("Chrome/Edge executable not found.");
}

(async () => {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--disable-dev-shm-usage", "--disable-gpu"],
  });

  const context = await browser.newContext({
    locale: "en-IN",
    viewport: { width: 1440, height: 1000 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
  });

  const page = await context.newPage();

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });

  await page.waitForTimeout(8000);

  const result = await page.evaluate(() => {
    const clean = (v) =>
      v
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const getId = (v) =>
      v.match(/(?:Library ID|लाइब्रेरी ID):\s*(\d+)/i)?.[1] ?? null;

    const countIds = (el) => {
      const all =
        (el.textContent ?? "").match(
          /(?:Library ID|लाइब्रेरी ID):\s*\d+/gi
        ) ?? [];

      return new Set(
        all.map((x) => x.match(/(\d+)/)?.[1] ?? "")
      ).size;
    };

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );

    const recognised = new Map();

    let node = walker.nextNode();

    while (node) {
      const id = getId(node.textContent ?? "");

      if (id) {
        let el = node.parentElement;
        let best = null;

        for (let depth = 0; depth < 16 && el; depth++) {
          const text = el.textContent?.trim() ?? "";
          const ids = countIds(el);

          if (
            ids === 1 &&
            text.length >= 60 &&
            text.length <= 30000
          ) {
            best = el;
          }

          if (ids > 1) break;

          el = el.parentElement;
        }

        if (best) {
          recognised.set(id, {
            id,
            textLength: best.textContent?.length ?? 0,
            firstText: clean(best.textContent ?? "").slice(0, 1000),
            tag: best.tagName,
            testId:
              best.getAttribute?.("data-testid") ?? null,
            role:
              best.getAttribute?.("role") ?? null,
          });
        }
      }

      node = walker.nextNode();
    }

    const testidAds = Array.from(
      document.querySelectorAll('[data-testid*="ad" i]')
    ).map((el) => ({
      tag: el.tagName,
      testId: el.getAttribute("data-testid"),
      textLength: el.textContent?.length ?? 0,
      ids: (el.textContent?.match(
        /(?:Library ID|लाइब्रेरी ID):\s*\d+/gi
      ) ?? []).length,
      text: clean(el.textContent ?? "").slice(0, 700),
    }));

    return {
      recognisedCount: recognised.size,
      recognised: [...recognised.values()].slice(0, 10),
      testidAdCount: testidAds.length,
      testidAds: testidAds.slice(0, 10),
    };
  });

  console.log(JSON.stringify(result, null, 2));

  await context.close();
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
