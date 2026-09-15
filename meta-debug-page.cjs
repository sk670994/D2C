const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

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

const executablePath = candidates.find(fs.existsSync);

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

  const diagnostics = await page.evaluate(() => {
    const body = document.body?.innerText || "";

    const textLibraryIds =
      body.match(/(?:Library ID|लाइब्रेरी ID):\s*\d+/gi) || [];

    const articles = document.querySelectorAll("article").length;
    const roleArticles = document.querySelectorAll('[role="article"]').length;
    const testidAds = document.querySelectorAll('[data-testid*="ad" i]').length;
    const videos = document.querySelectorAll("video").length;
    const images = document.querySelectorAll("img").length;

    return {
      url: location.href,
      title: document.title,
      bodyLength: body.length,
      bodyStart: body.slice(0, 3000),
      libraryIdCount: textLibraryIds.length,
      libraryIds: [...new Set(textLibraryIds)].slice(0, 20),
      articleCount: articles,
      roleArticleCount: roleArticles,
      testidAdCount: testidAds,
      videoCount: videos,
      imageCount: images,
      bodyHasMamaearth: body.toLowerCase().includes("mamaearth"),
      bodyHasLogin: body.toLowerCase().includes("log in"),
      bodyHasSecurity: body.toLowerCase().includes("security check"),
      bodyHasAdLibrary: body.toLowerCase().includes("ad library"),
    };
  });

  console.log(JSON.stringify(diagnostics, null, 2));

  const out = path.join(process.cwd(), "meta-debug-page.html");
  await fs.promises.writeFile(out, await page.content(), "utf8");

  console.log(`HTML saved to: ${out}`);

  await context.close();
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
