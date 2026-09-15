const chromium = require("@sparticuz/chromium");
const { chromium: playwrightChromium } = require("playwright-core");

(async () => {
  let executablePath;

  if (process.env.CHROMIUM_PACK_URL?.trim()) {
    executablePath = await chromium.executablePath(
      process.env.CHROMIUM_PACK_URL.trim()
    );
  } else {
    executablePath = await chromium.executablePath();
  }

  console.log("Chromium executable:", executablePath);

  const browser = await playwrightChromium.launch({
    executablePath,
    args: [
      ...chromium.args,
      "--disable-blink-features=AutomationControlled",
    ],
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
  });

  const page = await context.newPage();

  const pageId = "619181354927737";

  const url =
    `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=${pageId}`;

  console.log("\nOpening Meta Ads Library...");
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });

  await page.waitForTimeout(5000);

  const result = await page.evaluate(() => {
    const selectors = [
      '[data-testid="ad-library-dynamic-content-container"]',
      '[data-testid="ad-content-body-video-container"]',
    ];

    const elements = [];

    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (!elements.includes(el)) {
          elements.push(el);
        }
      }
    }

    return {
      title: document.title,
      bodyLength: document.body?.innerText?.length ?? 0,
      resultText:
        document.body?.innerText?.match(/~?[\d,]+ results?/i)?.[0] ?? null,
      cardCount: elements.length,
      cards: elements.slice(0, 3).map((el, index) => ({
        index: index + 1,
        testid: el.getAttribute("data-testid"),
        lines: (el.innerText || "")
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
      })),
    };
  });

  console.log("\n===== META RESULT =====");
  console.dir(result, { depth: null });

  await browser.close();
})().catch((error) => {
  console.error("\nDIAGNOSTIC FAILED");
  console.error(error);
  process.exit(1);
});
