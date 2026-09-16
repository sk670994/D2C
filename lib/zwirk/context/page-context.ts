import type { ZwirkPage, ZwirkPageContext } from "./types";

export function resolveZwirkPage(pathname: string): ZwirkPage {
  if (pathname === "/" || pathname === "") return "home";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/adspy")) return "adspy";
  if (pathname.startsWith("/brand-vault")) return "brand-vault";
  if (pathname.startsWith("/records")) return "records";
  if (pathname.startsWith("/decision-loop")) return "decision-loop";
  if (pathname.startsWith("/pricing")) return "pricing";
  if (pathname.startsWith("/faq")) return "faq";
  if (pathname.startsWith("/zwirk")) return "zwirk";
  return "other";
}

const PAGE_CONTEXT: Record<ZwirkPage, Omit<ZwirkPageContext, "page">> = {
  home: {
    label: "Zooptrack",
    description: "Public product overview and D2C growth-intelligence positioning."
  },
  dashboard: {
    label: "Command Center · profitability",
    description: "The user's business performance, economics, scale readiness and decision metrics."
  },
  adspy: {
    label: "AdSpy · competitor intelligence",
    description: "Competitor advertisements, advertisers, creative patterns, offers, hooks and observed market signals."
  },
  "brand-vault": {
    label: "Brand Vault",
    description: "The user's brand identity, audience, products, tone, objections and competitor focus."
  },
  records: {
    label: "Records",
    description: "Historical reports, saved workspace records and changes over time."
  },
  "decision-loop": {
    label: "Decision Loop",
    description: "The Zooptrack operating model from market signal to ads to economics to diagnosis to action."
  },
  pricing: {
    label: "Pricing",
    description: "Zooptrack plan and capability information."
  },
  faq: {
    label: "FAQ",
    description: "Product support and common questions."
  },
  zwirk: {
    label: "ZWIRK workspace",
    description: "Full ZWIRK reasoning workspace with access to available product intelligence."
  },
  other: {
    label: "Zooptrack",
    description: "General Zooptrack context."
  }
};

export function buildPageContext(pathname: string): ZwirkPageContext {
  const page = resolveZwirkPage(pathname);

  return {
    page,
    ...PAGE_CONTEXT[page]
  };
}
