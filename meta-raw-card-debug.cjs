const { chromium } = require("playwright");

const PAGE_ID = "619181354927737";

function cleanText(value) {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/\u200B/g, "")
    .replace(/\u200C/g, "")
    .replace(/\u200D/g, "")
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function isLikelyAdCard(el) {
  const text = (el.innerText || "").trim();
  const testid = el.getAttribute("data-testid") || "";
  return (
    testid === "ad-library-dynamic-content-container" ||
    testid === "ad-content-body-video-container" ||
    /Library ID/i.test(text)
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
  });

  const url =
    `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=${PAGE_ID}`;

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });

  await page.waitForTimeout(5000);

  const cards = await page.evaluate(() => {
    const elements = Array.from(
      document.querySelectorAll(
        '[data-testid="ad-library-dynamic-content-container"], [data-testid="ad-content-body-video-container"]'
      )
    );

    const unique = [];
    const seen = new Set();

    for (const el of elements) {
      const key =
        `${el.getAttribute("data-testid")}|${(el.innerText || "").slice(0, 300)}`;

      if (seen.has(key)) continue;
      seen.add(key);

      unique.push({
        testid: el.getAttribute("data-testid"),
        tag: el.tagName,
        text: (el.innerText || "").split("\n").map(s => s.trim()).filter(Boolean),
        htmlLength: el.outerHTML.length,
      });

      if (unique.length >= 5) break;
    }

    return unique;
  });

  console.log("\n===== RAW META CARDS =====\n");

  cards.forEach((card, index) => {
    console.log(`\n--- CARD ${index + 1} ---`);
    console.log("testid:", card.testid);
    console.log("tag:", card.tag);
    console.log("htmlLength:", card.htmlLength);
    console.log("lines:");

    card.text.forEach((line, i) => {
      console.log(`${String(i).padStart(2, "0")}: ${JSON.stringify(line)}`);
    });
  });

  console.log(`\nCaptured ${cards.length} cards.`);

  await browser.close();
})().catch((error) => {
  console.error("\nDIAGNOSTIC FAILED\n");
  console.error(error);
  process.exit(1);
});
