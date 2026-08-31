export type ProductExtract = {
  url: string;
  title: string;
  description: string;
  h1: string;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  keywords: string[];
  searchQuery: string;
  audienceHint: string;
  offerHint: string;
};

function meta(html: string, key: string): string {
  const property = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i"));
  return property?.[1]?.trim() ?? "";
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function parsePrice(html: string): number | null {
  const jsonLd = html.match(/"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/i);
  if (jsonLd) return Number(jsonLd[1]);
  const og = meta(html, "product:price:amount") || meta(html, "og:price:amount");
  if (og) {
    const n = Number(og.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  const rupee = html.match(/₹\s*([\d,]+(?:\.\d+)?)/);
  if (rupee) return Number(rupee[1].replace(/,/g, ""));
  return null;
}

function keywordsFrom(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const stop = new Set(["the", "and", "for", "with", "from", "your", "this", "that", "india", "buy", "online", "official", "store"]);
  const tokens = text
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3 && !stop.has(token));
  return Array.from(new Set(tokens)).slice(0, 8);
}

export function extractProduct(html: string, url: string): ProductExtract {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = decode(stripTags(meta(html, "og:title") || titleMatch?.[1] || "Untitled product"));
  const description = decode(stripTags(meta(html, "og:description") || meta(html, "description")));
  const h1 = decode(stripTags(h1Match?.[1] || title));
  const image = meta(html, "og:image") || null;
  const price = parsePrice(html);
  const keywords = keywordsFrom(title, description);
  const searchQuery = keywords.slice(0, 4).join(" ") || title.split(/\s+/).slice(0, 4).join(" ");
  const offerHint = /bundle|bogo|buy 2|free shipping|% off|offer/i.test(`${title} ${description}`)
    ? "Offer language is already present on the PDP."
    : "PDP copy is product-led. Market ads may be using stronger offer framing.";
  const audienceHint = description.slice(0, 180) || "Audience not explicit on the page. Infer from category keywords.";

  return {
    url,
    title,
    description: description.slice(0, 500),
    h1,
    price,
    currency: "INR",
    imageUrl: image,
    keywords,
    searchQuery,
    audienceHint,
    offerHint
  };
}
