/**
 * Facts for the /compare pages. Competitor prices are their public starting
 * prices as listed in Sep 2026 — keep them honest and dated, and update when
 * they change.
 */
export const PRICES_CHECKED = "September 2026";

export type Competitor = {
  slug: string;
  name: string;
  price: string;
  platforms: string;
  bestFor: string;
  /** What they genuinely do well. */
  strengths: string[];
  /** Where Zooptrack is different, for an Indian D2C team. */
  differences: string[];
  /** One honest line: when to pick them instead. */
  pickThemIf: string;
};

export const ZOOPTRACK = {
  price: "Free plan · paid from ₹999/month",
  platforms: "Facebook & Instagram (Meta), India",
  bestFor: "Indian D2C brands and agencies watching competitors",
  points: [
    "Priced in rupees, with a free plan",
    "Indian D2C brands already indexed and refreshed every night",
    "Filters for Indian languages and regions",
    "“Just launched” and “Running 60+ days” rows to spot tests and likely winners",
    "Compare brands side by side: launch pace, video share, languages, live ads",
    "ZWIRK turns what competitors run into counter-ad ideas for your brand",
  ],
  limits: [
    "Meta (Facebook & Instagram) only for now",
    "Focused on India, so the library is smaller than global tools",
    "No spend numbers — Meta does not publish them, so we don’t guess",
  ],
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "meta-ad-library",
    name: "Meta Ad Library",
    price: "Free",
    platforms: "Facebook, Instagram, Messenger, Audience Network",
    bestFor: "Quick one-off checks of a single brand",
    strengths: ["Free and official", "Every active ad on Meta, straight from the source"],
    differences: [
      "Ad Library shows what is live right now; Zooptrack keeps history, so you see what launched and what stopped",
      "No filters for “new this week” or “running 60+ days” in Ad Library",
      "No side-by-side brand comparison or weekly launch chart",
      "Nothing that tells you what to do next — ZWIRK does",
    ],
    pickThemIf: "you only need to peek at one brand once in a while.",
  },
  {
    slug: "foreplay",
    name: "Foreplay",
    price: "From $49/month",
    platforms: "Meta, TikTok",
    bestFor: "Creative teams building swipe files and briefs",
    strengths: ["Excellent swipe-file and board workflow", "Turns saved ads into creative briefs"],
    differences: [
      "Priced in dollars; Zooptrack starts free and is priced in rupees",
      "Built for global DTC; Zooptrack comes with Indian D2C brands already indexed",
      "Indian language and region filters on every search",
      "Brand-vs-brand comparison with launch pace and live-ad share",
    ],
    pickThemIf: "your main job is organising creative inspiration for a design team across TikTok and Meta.",
  },
  {
    slug: "adspy",
    name: "AdSpy",
    price: "About $149/month",
    platforms: "Facebook, Instagram",
    bestFor: "Affiliates and media buyers searching a huge global index",
    strengths: ["One of the largest Facebook/Instagram ad archives", "Deep text and URL search"],
    differences: [
      "Around ₹12,000+ a month at their price; Zooptrack has a free plan",
      "Global affiliate focus; Zooptrack is tuned for Indian D2C brands",
      "Zooptrack highlights new launches and long-running ads automatically",
      "Counter-ad ideas from ZWIRK instead of raw search only",
    ],
    pickThemIf: "you run affiliate offers worldwide and need the biggest possible archive.",
  },
  {
    slug: "bigspy",
    name: "BigSpy",
    price: "From $9/month",
    platforms: "Meta, TikTok, YouTube, Pinterest, X",
    bestFor: "Cheap, broad browsing across many ad networks",
    strengths: ["Low entry price", "Many platforms in one place"],
    differences: [
      "Broad but generic; Zooptrack goes deep on Indian D2C on Meta",
      "Brand-level view: every ad from one advertiser, with launch history",
      "Side-by-side competitor comparison and plain-language differences",
      "ZWIRK suggests what your brand should test next",
    ],
    pickThemIf: "you want to scan many ad platforms cheaply and don’t need brand-level depth.",
  },
  {
    slug: "poweradspy",
    name: "PowerAdSpy",
    price: "From $49/month",
    platforms: "Meta, YouTube, Reddit and more",
    bestFor: "Marketers filtering ads by country, domain and keyword",
    strengths: ["Many filters", "Covers several networks"],
    differences: [
      "Priced in dollars; Zooptrack starts free in rupees",
      "Indian D2C brands pre-loaded and refreshed nightly",
      "Clear “just launched” and “still running after 60 days” signals",
      "Compare up to several brands at once with plain-language takeaways",
    ],
    pickThemIf: "you need many ad networks and advanced keyword filters worldwide.",
  },
  {
    slug: "minea",
    name: "Minea",
    price: "From $49/month",
    platforms: "Meta, TikTok, Pinterest",
    bestFor: "Dropshippers hunting winning products",
    strengths: ["Product-first research", "Good for finding trending products to sell"],
    differences: [
      "Minea is built for dropshipping; Zooptrack is built for brands watching competitors",
      "Brand pages, watchlists and side-by-side comparison",
      "Indian languages, regions and D2C brands out of the box",
      "Counter-strategy ideas instead of product-hunting",
    ],
    pickThemIf: "you are a dropshipper looking for the next product to sell.",
  },
];

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}
