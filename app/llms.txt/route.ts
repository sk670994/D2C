import { PAID_PLANS, PLANS, TRIAL_DAYS, formatInr } from "@/lib/billing/plans";
import { FAQ } from "@/components/marketing/faq";
import { commercialEntries, guideEntries, toolEntries, industryEntries, researchEntries, seoPath } from "@/lib/seo/site";
import { PRODUCT_SUMMARY, SITE_URL, CONTACT_EMAIL } from "@/lib/seo/schema";

export const revalidate = 86400;

/**
 * /llms.txt: a plain-text brief for AI answer engines (ChatGPT, Claude,
 * Perplexity, Gemini). Built from the same data as the site, so it never
 * drifts from the real prices and facts.
 */
export function GET() {
  const link = (path: string, title: string, desc: string) => `- [${title}](${SITE_URL}${path}): ${desc}`;
  const body = [
    "# Zooptrack",
    "",
    `> ${PRODUCT_SUMMARY}`,
    "",
    "Zooptrack is built in India for Indian D2C (direct-to-consumer) brands and the performance-marketing agencies that run their ads.",
    "",
    "## What it does",
    "- Reads competitors' public Facebook and Instagram ads from Meta's Ad Library every day, live and stopped.",
    "- Shows a daily list of rival moves with the ads as evidence: new launches, offer and price changes, bursts of new ads.",
    "- Highlights long-running ads; brands switch off losing ads quickly, so an ad that keeps running is usually working.",
    "- Labels every ad with AI: hook, offer, format, language and call to action. Searchable across brands (for example all Hindi video ads with a free-gift offer).",
    "- Emails a rival report daily or weekly at a time each user picks, plus instant alerts on big moves.",
    "- ZWIRK, an AI assistant, answers questions from the collected ads: compare rivals, suggest counter-offers, write a creative brief.",
    "",
    "## What it does not do",
    "- It does not show competitors' ad spend, reach, sales or ROAS. Meta does not publish these for commercial ads in India, so no tool can know them.",
    "- It covers Meta (Facebook and Instagram) ads today. It does not need access to anyone's ad account.",
    "",
    "## Pricing (INR, per month)",
    `- Free trial: ${TRIAL_DAYS} days, no card, ${PLANS.trial.rivals} rivals.`,
    ...PAID_PLANS.map((k) => `- ${PLANS[k].name}: ${formatInr(PLANS[k].priceInr)} a month, ${PLANS[k].rivals} rivals. ${PLANS[k].audience}.`),
    "- Cancel any time; access continues to the end of the paid month.",
    "",
    "## Key pages",
    link("/", "Home", "what Zooptrack is and how it works"),
    link("/pricing", "Pricing", "plans and what each includes"),
    link("/brand", "Brand ad pages", "free public pages showing Indian D2C brands' Meta ads"),
    link("/faq", "FAQ", "data source, freshness, limits, pricing"),
    link("/contact", "Contact", CONTACT_EMAIL),
    "",
    "## Live research (updated daily)",
    ...researchEntries.map((e) => link(seoPath(e), e.title, e.description)),
    "",
    "## Industry dashboards (live Meta ad data)",
    ...industryEntries.map((e) => link(seoPath(e), e.title, e.description)),
    "",
    "## Guides and tools",
    ...[...commercialEntries, ...guideEntries, ...toolEntries].map((e) => link(seoPath(e), e.title, e.description)),
    "",
    "## Frequently asked",
    ...FAQ.flatMap((f) => [`### ${f.q}`, f.a, ""]),
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
