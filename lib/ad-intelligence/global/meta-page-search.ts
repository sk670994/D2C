import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core";
import chromiumPack from "@sparticuz/chromium-min";

export type MetaPageSearchResult = {
  pageId: string;
  name: string;
  category?: string | null;
  imageUrl?: string | null;
  verification?: string | null;
  entityType?: string | null;
  igUsername?: string | null;
  pageAlias?: string | null;
  likes?: number | null;
  igFollowers?: number | null;
};

type Candidate = MetaPageSearchResult;

type SuggestionSession = {
  context: BrowserContext;
  page: Page;
  country: string;
  requestCount: number;
  busy: Promise<void> | null;
  lastUsedAt: number;
};

type CacheEntry = {
  expiresAt: number;
  value: Candidate[];
};

const META_LIBRARY_URL = "https://www.facebook.com/ads/library/";
const DEFAULT_COUNTRY = "IN";

const NAV_TIMEOUT_MS = 8_000;
const SUGGESTION_WAIT_MS = 1500;
const OVERALL_TIMEOUT_MS = 10_000;

const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 180;

const SESSION_MAX_REQUESTS = 80;
const SESSION_IDLE_MS = 2 * 60_000;

const MAX_SUGGESTIONS = 8;

const cache = new Map<string, CacheEntry>();
const sessions = new Map<string, SuggestionSession>();

let browser: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;

function normalizeCountry(value: string): string {
  const country = value.trim().toUpperCase();

  return /^[A-Z]{2}$/.test(country)
    ? country
    : DEFAULT_COUNTRY;
}

function normalizeQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function relevanceScore(
  name: string,
  query: string,
): number {
  const n = normalize(name);
  const q = normalize(query);

  if (!n || !q) return -1;

  if (n === q) {
    return 10000;
  }

  if (n.startsWith(q)) {
    return 9000 - Math.max(0, n.length - q.length);
  }

  if (n.includes(q)) {
    return 7000 - n.indexOf(q);
  }

  const tokens = q.split(" ").filter(Boolean);

  if (
    tokens.length &&
    tokens.every((token) => n.includes(token))
  ) {
    return 5000 - Math.max(0, n.length - q.length);
  }

  return -1;
}

function trimCache() {
  const now = Date.now();

  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }

  while (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;

    if (first === undefined) {
      break;
    }

    cache.delete(first);
  }
}

function cacheKey(
  query: string,
  country: string,
) {
  return `${country}|${normalize(query)}`;
}

function localChromeExecutable(): string {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.EDGE_EXECUTABLE_PATH,

    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",

    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(
    (value): value is string =>
      Boolean(value?.trim()),
  );

  for (const candidate of candidates) {
    try {
      const resolved = path.resolve(candidate);

      if (existsSync(resolved)) {
        return resolved;
      }
    } catch {
      // Continue.
    }
  }

  throw new Error(
    "No local Chrome or Edge executable found. Set CHROME_EXECUTABLE_PATH or EDGE_EXECUTABLE_PATH.",
  );
}

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) {
    return browser;
  }

  browser = null;

  if (!browserPromise) {
    browserPromise = (async () => {
      const local =
        process.platform === "win32" ||
        process.env.IS_LOCAL === "true";

      const executablePath =
        process.env.ADSPY_BROWSER === "playwright"
          ? ""
          : local
        ? localChromeExecutable()
        : await chromiumPack.executablePath(
            process.env.CHROMIUM_PACK_URL?.trim() ||
              undefined,
          );

      const args = local
        ? [
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ]
        : [
            ...chromiumPack.args,
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--disable-setuid-sandbox",
          ];

      const next =
        process.env.ADSPY_BROWSER === "playwright"
          ? await chromium.launch({
              headless: true,
              args: ["--disable-dev-shm-usage", "--no-sandbox"],
            })
          : await chromium.launch({
              executablePath,
              args,
              headless: true,
            });

      next.on("disconnected", () => {
        if (browser === next) {
          browser = null;
        }
      });

      browser = next;

      return next;
    })().finally(() => {
      browserPromise = null;
    });
  }

  return browserPromise;
}

async function acceptCookies(page: Page) {
  const labels = [
    "Allow all cookies",
    "Accept all",
    "Allow essential and optional cookies",
    "Only allow essential cookies",
  ];

  for (const label of labels) {
    try {
      const button = page
        .getByRole("button", {
          name: label,
          exact: true,
        })
        .first();

      if (await button.isVisible()) {
        await button.click({
          timeout: 300,
        });

        return;
      }
    } catch {
      // Ignore.
    }
  }
}

function addCandidate(
  map: Map<string, Candidate>,
  candidate: Partial<Candidate>,
  query: string,
) {
  const pageId = String(
    candidate.pageId ?? "",
  ).trim();

  const name = String(
    candidate.name ?? "",
  )
    .replace(/\s+/g, " ")
    .trim();

  const score = relevanceScore(
    name,
    query,
  );

  if (
    !/^\d+$/.test(pageId) ||
    !name ||
    score < 0
  ) {
    return;
  }

  const normalizedCandidate: Candidate = {
    pageId,
    name,

    category:
      candidate.category ?? null,

    imageUrl:
      candidate.imageUrl ?? null,

    verification:
      candidate.verification ?? null,

    entityType:
      candidate.entityType ?? null,

    igUsername:
      candidate.igUsername ?? null,

    pageAlias:
      candidate.pageAlias ?? null,

    likes:
      typeof candidate.likes === "number" &&
      Number.isFinite(candidate.likes)
        ? candidate.likes
        : null,

    igFollowers:
      typeof candidate.igFollowers === "number" &&
      Number.isFinite(candidate.igFollowers)
        ? candidate.igFollowers
        : null,
  };

  const existing = map.get(pageId);

  if (!existing) {
    map.set(
      pageId,
      normalizedCandidate,
    );
  }
}

function extractCandidatesFromJSON(
  payload: unknown,
  query: string,
): Candidate[] {
  const found = new Map<
    string,
    Candidate
  >();

  const visited = new Set<object>();

  const MAX_NODES = 30_000;

  const visit = (value: unknown) => {
    if (
      !value ||
      typeof value !== "object"
    ) {
      return;
    }

    if (
      found.size >= MAX_SUGGESTIONS
    ) {
      return;
    }

    if (
      visited.has(value as object)
    ) {
      return;
    }

    if (
      visited.size >= MAX_NODES
    ) {
      return;
    }

    visited.add(value as object);

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }

      return;
    }

    const object =
      value as Record<
        string,
        unknown
      >;

    const pageId =
      object.page_id ??
      object.pageId ??
      object.view_all_page_id ??
      object.pageID ??
      object.id;

    const name =
      object.page_name ??
      object.pageName ??
      object.name ??
      object.title;

    if (
      pageId != null &&
      typeof name === "string"
    ) {
      addCandidate(
        found,
        {
          pageId: String(pageId),
          name,

          category:
            (object.category as
              | string
              | null
              | undefined) ??
            (object.page_category as
              | string
              | null
              | undefined) ??
            null,

          imageUrl:
            (object.image_uri as
              | string
              | null
              | undefined) ??
            (object.image_url as
              | string
              | null
              | undefined) ??
            (object.profile_picture_uri as
              | string
              | null
              | undefined) ??
            (object.profile_picture_url as
              | string
              | null
              | undefined) ??
            null,

          verification:
            (object.verification as
              | string
              | null
              | undefined) ??
            (object.verification_status as
              | string
              | null
              | undefined) ??
            null,

          entityType:
            (object.entity_type as
              | string
              | null
              | undefined) ??
            null,

          igUsername:
            (object.ig_username as
              | string
              | null
              | undefined) ??
            null,

          pageAlias:
            (object.page_alias as
              | string
              | null
              | undefined) ??
            null,

          likes:
            typeof object.likes === "number"
              ? object.likes
              : null,

          igFollowers:
            typeof object.ig_followers === "number"
              ? object.ig_followers
              : null,
        },
        query,
      );
    }

    for (const child of Object.values(
      object,
    )) {
      visit(child);
    }
  };

  visit(payload);

  return [
    ...found.values(),
  ];
}

async function extractCandidatesFromDOM(
  page: Page,
  query: string,
): Promise<Candidate[]> {
  const rows = await page.evaluate(
    (searchQuery) => {
      const normalize = (
        value: string,
      ) =>
        value
          .toLocaleLowerCase()
          .normalize("NFKC")
          .replace(
            /[^\p{L}\p{N}]+/gu,
            " ",
          )
          .replace(/\s+/g, " ")
          .trim();

      const q =
        normalize(searchQuery);

      const output: Array<
        Record<
          string,
          string | null
        >
      > = [];

      const visible = (
        el: Element,
      ) => {
        const node =
          el as HTMLElement;

        return Boolean(
          node.offsetWidth ||
            node.offsetHeight ||
            node.getClientRects().length,
        );
      };

      const score = (
        name: string,
      ) => {
        const n = normalize(name);

        if (n === q) {
          return 10000;
        }

        if (n.startsWith(q)) {
          return 9000;
        }

        if (n.includes(q)) {
          return 7000;
        }

        const tokens =
          q
            .split(" ")
            .filter(Boolean);

        return tokens.length &&
          tokens.every((t) =>
            n.includes(t),
          )
          ? 5000
          : -1;
      };

      const readId = (
        el: Element,
      ): string | null => {
        const attrs = [
          "data-page-id",
          "data-pageid",
          "data-id",
          "data-object-id",
        ];

        for (const attr of attrs) {
          const value =
            el.getAttribute(attr);

          if (
            value &&
            /^\d+$/.test(value)
          ) {
            return value;
          }
        }

        const hrefs = [
          ...Array.from(
            el.matches("a[href]")
              ? [el]
              : [],
          ),

          ...Array.from(
            el.querySelectorAll(
              "a[href]",
            ),
          ),
        ]
          .map(
            (a) =>
              a.getAttribute(
                "href",
              ) ?? "",
          )
          .filter(Boolean);

        for (const href of hrefs) {
          const match =
            href.match(
              /(?:view_all_page_id|page_id)=(\d+)/i,
            ) ??
            href.match(
              /facebook\.com\/profile\.php\?id=(\d+)/i,
            );

          if (match?.[1]) {
            return match[1];
          }
        }

        return null;
      };

      for (const el of Array.from(
        document.querySelectorAll(
          '[role="option"],[role="listbox"] [role="option"],[role="listbox"] a,[role="menuitem"],a[href*="view_all_page_id"]',
        ),
      )) {
        if (!visible(el)) {
          continue;
        }

        const text = (
          el.textContent ?? ""
        )
          .replace(/\s+/g, " ")
          .trim();

        if (!text) {
          continue;
        }

        const firstLine =
          (
            el.textContent ?? ""
          )
            .split(/\r?\n/)
            .map((v) =>
              v.trim(),
            )
            .find(Boolean) ??
          text;

        const name =
          el
            .querySelector(
              "strong,b,h3,h4",
            )
            ?.textContent?.trim() ??
          firstLine;

        if (
          !name ||
          score(name) < 0
        ) {
          continue;
        }

        const pageId =
          readId(el);

        if (!pageId) {
          continue;
        }

        const img =
          el.querySelector(
            "img",
          ) as HTMLImageElement | null;

        output.push({
          pageId,
          name,

          imageUrl:
            img?.currentSrc ??
            img?.src ??
            null,

          category: null,
          verification: null,
          entityType: null,
          igUsername: null,
          pageAlias: null,
        });
      }

      return output;
    },
    query,
  );

  const result = new Map<
    string,
    Candidate
  >();

  for (const row of rows) {
    addCandidate(
      result,
      row,
      query,
    );
  }

  return [
    ...result.values(),
  ];
}

/**
 * Extract Page suggestions from Meta's
 * current public Ad Library GraphQL response.
 *
 * Current structure:
 *
 * data
 *   └── ad_library_main
 *       └── dynamic_filter_options
 *           └── pages[]
 *               ├── key
 *               ├── display_name
 *               └── count
 *
 * `key` is the real Facebook Page ID.
 */
function extractMetaDynamicPages(
  payload: unknown,
  query: string,
): Candidate[] {
  const found = new Map<
    string,
    Candidate
  >();

  const root =
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    payload.data &&
    typeof payload.data === "object"
      ? payload.data
      : null;

  const adLibraryMain =
    root &&
    "ad_library_main" in root &&
    root.ad_library_main &&
    typeof root.ad_library_main === "object"
      ? root.ad_library_main
      : null;

  const dynamicFilters =
    adLibraryMain &&
    "dynamic_filter_options" in
      adLibraryMain &&
    adLibraryMain.dynamic_filter_options &&
    typeof adLibraryMain.dynamic_filter_options ===
      "object"
      ? adLibraryMain.dynamic_filter_options
      : null;

  const pages =
    dynamicFilters &&
    "pages" in dynamicFilters &&
    Array.isArray(
      dynamicFilters.pages,
    )
      ? dynamicFilters.pages
      : [];

  for (const page of pages) {
    if (
      !page ||
      typeof page !== "object"
    ) {
      continue;
    }

    const record =
      page as Record<
        string,
        unknown
      >;

    const pageId =
      typeof record.key === "string"
        ? record.key.trim()
        : typeof record.key === "number"
          ? String(record.key)
          : "";

    const name =
      typeof record.display_name ===
      "string"
        ? record.display_name.trim()
        : "";

    if (
      !pageId ||
      !name
    ) {
      continue;
    }

    addCandidate(
      found,
      {
        pageId,
        name,
      },
      query,
    );
  }

  return [
    ...found.values(),
  ];
}

async function extractNetworkCandidates(
  payloads: unknown[],
  query: string,
): Promise<Candidate[]> {
  const result = new Map<
    string,
    Candidate
  >();

  for (const payload of payloads) {
    /**
     * Primary Meta-specific parser.
     *
     * This handles:
     *
     * data.ad_library_main
     *   .dynamic_filter_options
     *   .pages[]
     */
    for (const candidate of
      extractMetaDynamicPages(
        payload,
        query,
      )) {
      result.set(
        candidate.pageId,
        candidate,
      );
    }

    /**
     * Generic JSON parser fallback.
     */
    for (const candidate of
      extractCandidatesFromJSON(
        payload,
        query,
      )) {
      const existing =
        result.get(
          candidate.pageId,
        );

      if (!existing) {
        result.set(
          candidate.pageId,
          candidate,
        );
      } else {
        result.set(
          candidate.pageId,
          {
            ...existing,

            imageUrl:
              existing.imageUrl ??
              candidate.imageUrl,

            category:
              existing.category ??
              candidate.category,

            verification:
              existing.verification ??
              candidate.verification,

            likes:
              existing.likes ??
              candidate.likes,

            igFollowers:
              existing.igFollowers ??
              candidate.igFollowers,

            igUsername:
              existing.igUsername ??
              candidate.igUsername,

            pageAlias:
              existing.pageAlias ??
              candidate.pageAlias,
          },
        );
      }
    }
  }

  return [
    ...result.values(),
  ];
}

async function createSuggestionSession(
  browserInstance: Browser,
  country: string,
): Promise<SuggestionSession> {
  const context =
    await browserInstance.newContext({
      locale: "en-IN",

      viewport: {
        width: 1280,
        height: 900,
      },
    });

  // Page lookup reads text only; downloading ad images/videos just fills /tmp.
  await context.route("**/*", (route) =>
    ["image", "media", "font"].includes(route.request().resourceType())
      ? route.abort()
      : route.continue(),
  );

  const page =
    await context.newPage();

  page.setDefaultTimeout(
    2_000,
  );

  const session: SuggestionSession =
    {
      context,
      page,
      country,
      requestCount: 0,
      busy: null,
      lastUsedAt: Date.now(),
    };

  await page.goto(
    `${META_LIBRARY_URL}?active_status=all&ad_type=all&country=${encodeURIComponent(
      country,
    )}&media_type=all&is_targeted_country=false`,
    {
      waitUntil:
        "domcontentloaded",

      timeout:
        NAV_TIMEOUT_MS,
    },
  );

  await acceptCookies(page);

  return session;
}

async function getSuggestionSession(
  browserInstance: Browser,
  country: string,
): Promise<SuggestionSession> {
  const existing =
    sessions.get(country);

  if (
    existing &&
    existing.requestCount <
      SESSION_MAX_REQUESTS &&
    Date.now() -
      existing.lastUsedAt <
      SESSION_IDLE_MS &&
    existing.page.isClosed() ===
      false
  ) {
    return existing;
  }

  if (existing) {
    await existing.context
      .close()
      .catch(
        () => undefined,
      );

    sessions.delete(country);
  }

  const created =
    await createSuggestionSession(
      browserInstance,
      country,
    );

  sessions.set(
    country,
    created,
  );

  return created;
}

async function findVisibleMetaSearchInput(
  page: Page,
) {
  const selectors = [
    'input[type="search"]:visible',
    'input[role="searchbox"]:visible',
    'input[aria-label*="search" i]:visible',
    'input[placeholder*="search" i]:visible',
    'input[type="text"]:visible',
    'input:not([type="hidden"]):visible',
  ];

  for (const selector of selectors) {
    try {
      const locator =
        page.locator(selector);

      const count = Math.min(
        await locator.count(),
        8,
      );

      for (
        let index = 0;
        index < count;
        index += 1
      ) {
        const candidate =
          locator.nth(index);

        if (
          !(await candidate.isVisible())
        ) {
          continue;
        }

        const box =
          await candidate
            .boundingBox()
            .catch(
              () => null,
            );

        if (
          !box ||
          box.width < 160 ||
          box.height < 18
        ) {
          continue;
        }

        return candidate;
      }
    } catch {
      // Try next selector.
    }
  }

  return null;
}

async function runInteractiveLookup(
  session: SuggestionSession,
  query: string,
): Promise<Candidate[]> {
  const page =
    session.page;

  session.requestCount += 1;
  session.lastUsedAt =
    Date.now();

  const payloads: unknown[] =
    [];

const onResponse = async (response: {
  url(): string;
  headers(): Record<string, string>;
  json(): Promise<unknown>;
  text(): Promise<string>;
  status(): number;
}) => {
  const url = response.url();

  if (
    !url.includes("facebook.com") ||
    !/(graphql|ajax|api|ads\/library)/i.test(url)
  ) {
    return;
  }

  console.log(
    "[MetaPageSearch] RESPONSE:",
    response.status(),
    url,
  );

  try {
    const contentType =
      response.headers()["content-type"] ?? "";

    console.log(
      "[MetaPageSearch] CONTENT-TYPE:",
      contentType,
    );

    // Prefer JSON parsing, but don't depend on content-type.
    try {
      const payload = await response.json();

      console.log(
        "[MetaPageSearch] JSON CAPTURED:",
        url,
      );

      payloads.push(payload);
      return;
    } catch {
      // Some Meta responses may have a non-standard content type.
    }

    const text = await response.text();

    if (!text.trim()) {
      return;
    }

    try {
      const payload = JSON.parse(text);

      console.log(
        "[MetaPageSearch] TEXT->JSON CAPTURED:",
        url,
      );

      payloads.push(payload);
    } catch {
      console.log(
        "[MetaPageSearch] NON-JSON RESPONSE:",
        url,
        "length=",
        text.length,
      );
    }
  } catch (error) {
    console.log(
      "[MetaPageSearch] RESPONSE ERROR:",
      url,
      error instanceof Error ? error.message : String(error),
    );
  }
};

  page.on(
    "response",
    onResponse,
  );

  try {
    let input =
      await findVisibleMetaSearchInput(
        page,
      );

    /**
     * Meta sometimes hydrates the
     * search shell after DOMContentLoaded.
     */
    if (!input) {
      await page.waitForTimeout(
        700,
      );

      input =
        await findVisibleMetaSearchInput(
          page,
        );
    }

    /**
     * Direct public Ad Library
     * navigation fallback.
     */
    if (!input) {
      try {
        const url =
          new URL(
            META_LIBRARY_URL,
          );

        url.searchParams.set(
          "active_status",
          "all",
        );

        url.searchParams.set(
          "ad_type",
          "all",
        );

        url.searchParams.set(
          "country",
          session.country,
        );

        url.searchParams.set(
          "is_targeted_country",
          "false",
        );

        url.searchParams.set(
          "media_type",
          "all",
        );

        url.searchParams.set(
          "search_type",
          "keyword_unordered",
        );

        url.searchParams.set(
          "q",
          query,
        );

        await page.goto(
          url.toString(),
          {
            waitUntil:
              "domcontentloaded",

            timeout:
              NAV_TIMEOUT_MS,
          },
        );

        await page.waitForTimeout(
          500,
        );

        input =
          await findVisibleMetaSearchInput(
            page,
          );
      } catch (error) {
        console.warn(
          "[MetaPageSearch] query navigation fallback failed",
          error,
        );
      }
    }

    if (!input) {
      console.warn(
        "[MetaPageSearch] no interactive input; using captured network data",
        {
          url: page.url(),
          title: await page.title().catch(() => ""),
          capturedPayloads: payloads.length,
        },
      );

      const networkCandidates =
        await extractNetworkCandidates(
          payloads,
          query,
        );

      const domCandidates =
        await extractCandidatesFromDOM(
          page,
          query,
        );

      const merged = new Map<string, Candidate>();

      for (const candidate of [
        ...domCandidates,
        ...networkCandidates,
      ]) {
        const existing =
          merged.get(candidate.pageId);

        if (!existing) {
          merged.set(
            candidate.pageId,
            candidate,
          );
          continue;
        }

        merged.set(
          candidate.pageId,
          {
            ...existing,
            imageUrl:
              existing.imageUrl ??
              candidate.imageUrl,
            category:
              existing.category ??
              candidate.category,
            verification:
              existing.verification ??
              candidate.verification,
            likes:
              existing.likes ??
              candidate.likes,
            igFollowers:
              existing.igFollowers ??
              candidate.igFollowers,
            igUsername:
              existing.igUsername ??
              candidate.igUsername,
            pageAlias:
              existing.pageAlias ??
              candidate.pageAlias,
          },
        );
      }

      return [
        ...merged.values(),
      ]
        .map((candidate) => ({
          candidate,
          score: relevanceScore(
            candidate.name,
            query,
          ),
        }))
        .filter(({ score }) => score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SUGGESTIONS)
        .map(({ candidate }) => candidate);
    }

    await input.click({
      timeout: 1_500,
    });

    await input.fill("");

    await input.pressSequentially(
      query,
      {
        delay: 5,
      },
    );

    /**
     * Give Meta time to fire its
     * typeahead / GraphQL requests.
     */
    await page.waitForTimeout(
      SUGGESTION_WAIT_MS,
    );

    const network =
      await extractNetworkCandidates(
        payloads,
        query,
      );

    const dom =
      await extractCandidatesFromDOM(
        page,
        query,
      );

    const merged =
      new Map<
        string,
        Candidate
      >();

    /**
     * DOM + network candidates.
     *
     * Network candidates are especially
     * important because Meta's GraphQL
     * response contains the real Page ID.
     */
    for (const candidate of [
      ...dom,
      ...network,
    ]) {
      const existing =
        merged.get(
          candidate.pageId,
        );

      if (!existing) {
        merged.set(
          candidate.pageId,
          candidate,
        );
      } else {
        merged.set(
          candidate.pageId,
          {
            ...existing,

            imageUrl:
              existing.imageUrl ??
              candidate.imageUrl,

            category:
              existing.category ??
              candidate.category,

            verification:
              existing.verification ??
              candidate.verification,

            likes:
              existing.likes ??
              candidate.likes,

            igFollowers:
              existing.igFollowers ??
              candidate.igFollowers,

            igUsername:
              existing.igUsername ??
              candidate.igUsername,

            pageAlias:
              existing.pageAlias ??
              candidate.pageAlias,
          },
        );
      }
    }

    return [
      ...merged.values(),
    ]
      .map(
        (candidate) => ({
          candidate,

          score:
            relevanceScore(
              candidate.name,
              query,
            ),
        }),
      )
      .filter(
        ({ score }) =>
          score >= 0,
      )
      .sort(
        (a, b) =>
          b.score - a.score,
      )
      .slice(
        0,
        MAX_SUGGESTIONS,
      )
      .map(
        ({ candidate }) =>
          candidate,
      );
  } finally {
    page.off(
      "response",
      onResponse,
    );
  }
}

async function lookupMetaPages(
  query: string,
  country: string,
): Promise<Candidate[]> {
  const browserInstance =
    await getBrowser();

  const session =
    await getSuggestionSession(
      browserInstance,
      country,
    );

  let resolveBusy!: () => void;

  const previous =
    session.busy;

  const gate =
    new Promise<void>(
      (resolve) => {
        resolveBusy = resolve;
      },
    );

  session.busy =
    previous
      ? previous.then(
          () => gate,
        )
      : gate;

  await previous;

  try {
    return await runInteractiveLookup(
      session,
      query,
    );
  } catch (error) {
    console.warn(
      "[MetaPageSearch] interactive public lookup failed",
      error,
    );

    await session.context
      .close()
      .catch(
        () => undefined,
      );

    sessions.delete(
      country,
    );

    return [];
  } finally {
    resolveBusy();

    if (
      session.busy === gate
    ) {
      session.busy = null;
    }
  }
}

export async function searchMetaPages(
  query: string,
  country = DEFAULT_COUNTRY,
): Promise<MetaPageSearchResult[]> {
  const normalizedQuery =
    normalizeQuery(query);

  const normalizedCountry =
    normalizeCountry(country);

  if (
    normalizedQuery.length < 2
  ) {
    return [];
  }

  const key =
    cacheKey(
      normalizedQuery,
      normalizedCountry,
    );

  const cached =
    cache.get(key);

  if (
    cached &&
    cached.expiresAt >
      Date.now()
  ) {
    return cached.value;
  }

  const value =
    await Promise.race([
      lookupMetaPages(
        normalizedQuery,
        normalizedCountry,
      ),

      new Promise<
        Candidate[]
      >((resolve) =>
        setTimeout(
          () =>
            resolve([]),
          OVERALL_TIMEOUT_MS,
        ),
      ),
    ]);

  cache.set(key, {
    expiresAt:
      Date.now() +
      CACHE_TTL_MS,

    value,
  });

  trimCache();

  return value;
}

export function normalizeAdvertiserName(
  value: string,
): string {
  return normalize(value);
}

export function inferDomain(
  page: MetaPageSearchResult,
): string | null {
  return page.igUsername
    ? `https://instagram.com/${encodeURIComponent(
        page.igUsername,
      )}`
    : null;
}
