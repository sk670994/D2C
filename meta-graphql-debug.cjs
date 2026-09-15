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

  page.on("response", async response => {
    const url = response.url();

    if (!url.includes("/api/graphql/")) return;

    try {
      const text = await response.text();

      console.log("\n========== GRAPHQL RESPONSE ==========");
      console.log("STATUS:", response.status());
      console.log("URL:", url);
      console.log("LENGTH:", text.length);
      console.log(text.slice(0, 30000));
      console.log("========== END GRAPHQL ==========\n");
    } catch (e) {
      console.log("GRAPHQL READ ERROR:", String(e));
    }
  });

  const url =
    "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&is_targeted_country=false&media_type=all&search_type=keyword_unordered&q=foxtale";

  console.log("Opening Meta...");

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 15000
  });

  await page.waitForTimeout(8000);

  console.log("DONE");
  console.log("FINAL URL:", page.url());

  await browser.close();
})();
