import { PAID_PLANS, PLANS, TRIAL_DAYS } from "@/lib/billing/plans";

/**
 * Structured data (schema.org JSON-LD) shared by the marketing pages.
 * One source of truth so Google, Bing and AI answer engines read the same
 * facts as the page: who we are, what the product does, what it costs.
 */
export const SITE_URL = "https://www.zooptrack.co.in";
export const CONTACT_EMAIL = "hello.zooptrack@gmail.com";

export const ORG_ID = `${SITE_URL}/#organization`;
export const SITE_ID = `${SITE_URL}/#website`;
export const APP_ID = `${SITE_URL}/#software`;

export const PRODUCT_SUMMARY =
  "Zooptrack is competitor ad intelligence for Indian D2C brands and agencies. It reads competitors' public Facebook and Instagram ads from Meta's Ad Library every day, labels each ad's hook, offer, format and language with AI, and shows what changed: new launches, offer and price changes, and the long-running ads rivals keep paying for.";

export function organizationSchema() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "Zooptrack",
    url: SITE_URL,
    logo: `${SITE_URL}/zooptrack-logo.png`,
    email: CONTACT_EMAIL,
    areaServed: "IN",
    description: PRODUCT_SUMMARY,
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: CONTACT_EMAIL, areaServed: "IN", availableLanguage: ["en", "hi"] },
  };
}

export function websiteSchema() {
  return { "@type": "WebSite", "@id": SITE_ID, url: SITE_URL, name: "Zooptrack", inLanguage: "en-IN", publisher: { "@id": ORG_ID } };
}

export function softwareSchema() {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: "Zooptrack",
    url: SITE_URL,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Competitor ad intelligence",
    operatingSystem: "Web",
    description: PRODUCT_SUMMARY,
    publisher: { "@id": ORG_ID },
    featureList: [
      "Track competitors' Facebook and Instagram ads from Meta's public Ad Library",
      "Daily list of rival moves: new launches, offer and price changes",
      "Long-running ads highlighted as likely winners",
      "AI labels for hook, offer, format, language and call to action",
      "Daily or weekly email report at a time you choose, plus instant alerts",
      "ZWIRK AI assistant that answers from your rivals' ads",
    ],
    offers: [
      { "@type": "Offer", name: `${TRIAL_DAYS}-day free trial`, price: "0", priceCurrency: "INR", url: `${SITE_URL}/pricing` },
      ...PAID_PLANS.map((key) => ({
        "@type": "Offer",
        name: `${PLANS[key].name} plan`,
        price: String(PLANS[key].priceInr),
        priceCurrency: "INR",
        url: `${SITE_URL}/pricing`,
        description: `${PLANS[key].rivals} rivals, billed monthly`,
      })),
    ],
  };
}

export function faqSchema(faqs: Array<{ q: string; a: string }>) {
  return { "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}

export function breadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return { "@type": "BreadcrumbList", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${SITE_URL}${it.path}` })) };
}

/** Serialize a graph safely for a <script> tag (no "</script>" break-out). */
export function jsonLd(graph: object[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}
