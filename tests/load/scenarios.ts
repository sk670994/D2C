import type { Page } from "@playwright/test";
import {
  EXISTING_BRANDS,
  UNKNOWN_BRANDS,
  KEYWORDS,
  randomDelay,
  randomItem,
} from "./brands";

export type UserResult = {
  userId: number;
  email: string;
  success: boolean;
  durationMs: number;
  scenario: string;
  errors: string[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeGoto(
  page: Page,
  path: string
) {
  await page.goto(path, {
    waitUntil: "domcontentloaded",
  });

  await sleep(randomDelay(500, 1800));
}

async function searchAdSpy(
  page: Page,
  query: string
) {
  await safeGoto(page, "/adspy");

  const search = page.getByRole("combobox").first();

  await search.waitFor({
    state: "visible",
    timeout: 15_000,
  });

  await search.fill(query);

  await sleep(randomDelay(300, 1200));

  await search.press("Enter");

  await sleep(randomDelay(1200, 3500));
}

async function existingBrandScenario(page: Page) {
  await searchAdSpy(
    page,
    randomItem(EXISTING_BRANDS)
  );

  // Exercise a second independent search.
  await sleep(randomDelay(700, 2500));

  await searchAdSpy(
    page,
    randomItem(EXISTING_BRANDS)
  );
}

async function unknownBrandScenario(page: Page) {
  await searchAdSpy(
    page,
    randomItem(UNKNOWN_BRANDS)
  );

  await sleep(randomDelay(1500, 4000));
}

async function keywordScenario(page: Page) {
  await safeGoto(page, "/adspy");

  const modeButton = page.getByRole("radio", {
    name: /keyword/i,
  });

  if (await modeButton.count()) {
    await modeButton.click();
    await sleep(randomDelay(300, 1000));
  }

  const search = page.getByRole("combobox").first();

  await search.fill(randomItem(KEYWORDS));
  await sleep(randomDelay(300, 900));
  await search.press("Enter");

  await sleep(randomDelay(1200, 3500));
}

async function filterScenario(page: Page) {
  await searchAdSpy(
    page,
    randomItem(EXISTING_BRANDS)
  );

  // Sort control
  const sort = page.getByLabel("Sort ads");

  if (await sort.count()) {
    const options = await sort.locator("option").allTextContents();

    if (options.length > 1) {
      await sort.selectOption({ index: 1 }).catch(() => {});
    }
  }

  // Try filters without assuming every filter exists.
  const filterButton = page.getByRole("button", {
    name: /^Filters/i,
  });

  if (await filterButton.count()) {
    await filterButton.first().click().catch(() => {});
  }

  await sleep(randomDelay(700, 2500));
}

async function navigationScenario(page: Page) {
  await safeGoto(page, "/today");

  await sleep(randomDelay(700, 2000));

  await safeGoto(page, "/adspy");

  await sleep(randomDelay(700, 2000));

  await searchAdSpy(
    page,
    randomItem(EXISTING_BRANDS)
  );
}

async function repeatedSearchScenario(page: Page) {
  const first = randomItem(EXISTING_BRANDS);
  const second = randomItem(EXISTING_BRANDS);

  await searchAdSpy(page, first);

  await sleep(randomDelay(500, 1800));

  await searchAdSpy(page, second);

  await sleep(randomDelay(500, 1800));

  await searchAdSpy(page, first);
}

async function runScenario(
  page: Page
): Promise<string> {
  const scenario = randomItem([
    "existing-brand",
    "unknown-brand",
    "keyword-search",
    "filters",
    "navigation",
    "repeated-search",
  ]);

  switch (scenario) {
    case "existing-brand":
      await existingBrandScenario(page);
      break;

    case "unknown-brand":
      await unknownBrandScenario(page);
      break;

    case "keyword-search":
      await keywordScenario(page);
      break;

    case "filters":
      await filterScenario(page);
      break;

    case "navigation":
      await navigationScenario(page);
      break;

    case "repeated-search":
      await repeatedSearchScenario(page);
      break;
  }

  return scenario;
}

export async function runUser(
  page: Page,
  user: {
    id: number;
    email: string;
    password: string;
  }
): Promise<UserResult> {
  const startedAt = Date.now();

  const errors: string[] = [];

  let scenario = "unknown";

  page.on("pageerror", (error) => {
    errors.push(`PAGE_ERROR: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`CONSOLE_ERROR: ${message.text()}`);
    }
  });

  try {
    // Login
    await page.goto("/login", {
      waitUntil: "domcontentloaded",
    });

    const email = page.getByLabel("Email");
    const password = page.getByLabel("Password");

    await email.waitFor({
      state: "visible",
      timeout: 15_000,
    });

    await email.fill(user.email);
    await password.fill(user.password);

    await page.getByRole("button", {
      name: "Sign In",
    }).click();

    // Allow auth redirect to settle.
    await page.waitForLoadState("domcontentloaded");

    await sleep(randomDelay(1000, 2500));

    // Make sure user actually entered the app.
    const url = page.url();

    if (/\/login/.test(url)) {
      throw new Error(
        `Login did not complete. Current URL: ${url}`
      );
    }

    scenario = await runScenario(page);

    return {
      userId: user.id,
      email: user.email,
      success: true,
      durationMs: Date.now() - startedAt,
      scenario,
      errors,
    };
  } catch (error) {
    return {
      userId: user.id,
      email: user.email,
      success: false,
      durationMs: Date.now() - startedAt,
      scenario,
      errors: [
        ...errors,
        error instanceof Error
          ? error.stack || error.message
          : String(error),
      ],
    };
  }
}
