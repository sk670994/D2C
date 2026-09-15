const { chromium } = require("playwright-core");

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--disable-dev-shm-usage", "--disable-gpu"]
  });

  const page = await browser.newPage({
    locale: "en-IN",
    viewport: { width: 1280, height: 900 }
  });

  page.on("response", r => {
    const u = r.url();

    if (
      u.includes("facebook.com") &&
      /graphql|ajax|api|ads\/library/i.test(u)
    ) {
      console.log("RESPONSE", r.status(), u.slice(0, 500));
    }
  });

  const url =
    "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&is_targeted_country=false&media_type=all&search_type=keyword_unordered&q=foxtale";

  console.log("Opening Meta...");

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 15000
  });

  await page.waitForTimeout(5000);

  console.log("\n========== PAGE ==========");
  console.log("URL:", page.url());
  console.log("TITLE:", await page.title());

  console.log("\n========== INPUTS ==========");

  console.log(
    await page.locator("input").evaluateAll(els =>
      els.map(e => ({
        type: e.getAttribute("type"),
        aria: e.getAttribute("aria-label"),
        placeholder: e.getAttribute("placeholder"),
        value: e.value
      }))
    )
  );

  console.log("\n========== BODY ==========");

  console.log(
    (await page.locator("body").innerText()).slice(0, 15000)
  );

  await page.screenshot({
    path: "meta-debug.png",
    fullPage: false
  });

  await browser.close();
})();
