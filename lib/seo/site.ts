import { INDUSTRIES } from "./industries";
import { SEO_REDIRECTS } from "./redirects";

export { SEO_REDIRECTS };

export type SeoSection = "commercial" | "guide" | "tool" | "industry" | "research";
export type CalculatorType = "roas" | "break-even-roas" | "cac" | "contribution-margin" | "rto";

export type SeoEntry = {
  section: SeoSection;
  slug: string;
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  intro: string;
  audience: string;
  focus: string[];
  caveat: string;
  related: string[];
  faqs: Array<{ q: string; a: string }>;
  calculator?: CalculatorType;
};

type Seed = Omit<SeoEntry, "section" | "eyebrow">;

function seed(section: SeoSection, s: Seed): SeoEntry {
  return { ...s, section, eyebrow: section === "commercial" ? "COMPETITOR AD INTELLIGENCE" : section === "guide" ? "D2C RESEARCH GUIDE" : section === "tool" ? "D2C TOOLS" : section === "industry" ? "D2C INDUSTRY RESEARCH" : "ZOOPTRACK RESEARCH" };
}

const commercialData: Seed[] = [
  {slug:"competitor-ad-intelligence",title:"Competitor Ad Intelligence for D2C",description:"Track competitor ads, creative changes, offers, formats and research history in one workflow.",h1:"Competitor ad intelligence for Indian D2C",intro:"See every Facebook and Instagram ad your rivals run, which ones they keep paying for, and what changed since yesterday.",audience:"D2C founders, growth teams and agencies",focus:["Competitor discovery","Creative history","Offer and format analysis"],caveat:"Meta does not publish spend, reach or results for commercial ads in India, so Zooptrack never estimates them. It shows what is public: every ad, when it started, whether it is still live and what it says.",related:["/competitor-ad-research","/d2c-competitor-analysis","/guides/how-to-analyze-competitor-ads"],faqs:[{q:"What is competitor ad intelligence?",a:"A structured way to collect, normalize and compare competitor advertising evidence over time."},{q:"Can ad intelligence prove a winning ad?",a:"No. It can surface persistence and repeated creative patterns, but performance still requires your own testing data."}]},
  {slug:"d2c-competitor-analysis",title:"D2C Competitor Analysis Using Advertising Evidence",description:"Compare competitor messaging, offers, formats and creative changes without pretending public ads reveal private business results.",h1:"D2C competitor analysis from real ads",intro:"Compare your rivals side by side: who is launching most, which offers they lead with, and which ads have survived for months.",audience:"D2C strategy, growth and brand teams",focus:["Competitor message map","Offer comparison","Creative pattern review"],caveat:"Meta does not publish spend, reach or results for commercial ads in India, so Zooptrack never estimates them. It shows what is public: every ad, when it started, whether it is still live and what it says.",related:["/competitor-ad-intelligence","/industries/beauty","/industries/skincare"],faqs:[{q:"What makes D2C competitor analysis useful?",a:"A clear framework: the same dimensions, the same time window and explicit evidence for each observation."},{q:"Can ad analysis replace market research?",a:"No. It is one input into a broader research process that can include customers, pricing, product and channel data."}]},
  {slug:"ad-spy-for-d2c",title:"Ad Spy for D2C Brands",description:"Use public competitor ads as research evidence, with context for hooks, offers, formats and creative history.",h1:"The ad spy tool built for Indian D2C",intro:"Real Indian brands, Hindi and regional ads, rupee pricing, and a daily read of what your rivals changed.",audience:"Performance marketers, founders and creative teams",focus:["Competitor discovery","Creative references","Offer monitoring"],caveat:"Meta does not publish spend, reach or results for commercial ads in India, so Zooptrack never estimates them. It shows what is public: every ad, when it started, whether it is still live and what it says.",related:["/competitor-ad-research","/meta-ad-library","/guides/how-to-find-winning-ad-creatives"],faqs:[{q:"Is an ad spy tool a replacement for Meta Ad Library?",a:"No. Zooptrack is designed to make repeated competitor research faster and more structured around public ad-library evidence."},{q:"What should I save from a competitor ad?",a:"Save the creative, copy, offer, observed format, advertiser identity and the date you reviewed it."}]},
  {slug:"meta-ad-library-india",title:"Meta Ad Library India for D2C Research",description:"A focused workflow for researching Indian D2C competitors through public Meta ad evidence.",h1:"Meta Ad Library for India, with memory",intro:"Everything in Meta's Ad Library for Indian brands, plus the history it doesn't keep, AI labels on every ad, and an alert when a rival moves.",audience:"India-focused D2C and agency teams",focus:["Indian advertiser research","Language and localization","Offer comparison"],caveat:"Meta does not publish spend, reach or results for commercial ads in India, so Zooptrack never estimates them. It shows what is public: every ad, when it started, whether it is still live and what it says.",related:["/competitor-ad-intelligence","/industries/beauty","/industries/fashion","/research/india-d2c-advertising-report-2026"],faqs:[{q:"Why focus on India?",a:"A focused market scope makes competitor research easier to organize around local brands, language and category context."},{q:"Does Zooptrack estimate competitor ad spend?",a:"No. The public ad record is treated as evidence of advertising activity, not as proof of spend or results."}]},
];

const guideData: Seed[] = [
  {slug:"how-to-use-meta-ad-library",title:"How to Use Meta Ad Library for Competitor Research",description:"Learn a repeatable process for searching, checking advertiser identity, capturing evidence and comparing competitor ads.",h1:"How to use Meta Ad Library",intro:"Move from random searching to a defined research workflow.",audience:"Marketers starting competitor research",focus:["Search by advertiser","Check evidence","Save context"],caveat:"Do not infer hidden performance metrics from the ad itself.",related:["/meta-ad-library","/guides/how-to-find-competitor-ads"],faqs:[{q:"How long should a research session be?",a:"Long enough to answer the question you started with; a narrow question usually produces a more useful result than browsing indefinitely."},{q:"What makes the workflow repeatable?",a:"The same search, evidence fields, naming and comparison process every time."}]},
  {slug:"how-to-find-competitor-ads",title:"How to Find Competitor Ads",description:"A step-by-step workflow for identifying competitors and locating the right public advertising records.",h1:"How to find competitor ads",intro:"Find the right advertiser before you analyze the ad.",audience:"D2C founders and marketers",focus:["Competitor list","Advertiser matching","Creative capture"],caveat:"Do not assume every similar brand name is the correct advertiser.",related:["/competitor-ad-research","/meta-ad-library-competitor-research","/meta-ad-library"],faqs:[{q:"How many competitors should I start with?",a:"Start with a manageable set that represents the segment you actually compete in, then expand once the process is stable."},{q:"What if a brand has multiple advertiser pages?",a:"Verify which page matches the business you are researching before treating its ads as comparable evidence."}]},
  {slug:"how-to-analyze-competitor-ads",title:"How to Analyze Competitor Ads",description:"Break competitor ads into hooks, offers, proof, format, language and timing so your notes become actionable.",h1:"How to analyze competitor ads",intro:"Deconstruct the ad before you decide what it means.",audience:"Growth marketers and creative teams",focus:["Hook analysis","Offer analysis","Format and language"],caveat:"Analysis should produce hypotheses for your own testing, not certainty about a competitor's internal performance.",related:["/competitor-ad-intelligence","/guides/how-to-find-winning-ad-creatives","/d2c-competitor-analysis"],faqs:[{q:"What is the first thing to analyze?",a:"Start with the opening hook and main promise, then work through offer, proof, format and CTA."},{q:"How many ads are enough to see a pattern?",a:"There is no universal number; look for repetition across a meaningful sample and time window."}]},
  {slug:"how-to-monitor-competitor-ads",title:"How to Monitor Competitor Ads",description:"Set up a practical monitoring cadence for launches, persistent creatives and offer changes.",h1:"How to monitor competitor ads",intro:"Monitor the changes that can affect your next decision.",audience:"D2C marketing and strategy teams",focus:["Change detection","Launch tracking","Offer monitoring"],caveat:"Monitoring is only useful when the team knows what action a signal could change.",related:["/competitor-ad-intelligence","/d2c-ad-intelligence","/guides/how-to-monitor-competitor-offers"],faqs:[{q:"How often should I monitor competitors?",a:"Match the cadence to the category and the cost of missing a meaningful launch or offer change."},{q:"What should a monitoring note contain?",a:"What changed, when it changed, the evidence, why it may matter and what the team should verify next."}]},
  {slug:"how-to-find-winning-ad-creatives",title:"How to Find Durable Competitor Ad Creatives",description:"Use persistence, repetition and creative context as research signals without claiming that public ads prove performance.",h1:"How to find durable competitor creatives",intro:"Use persistence as a clue—not a verdict.",audience:"Creative strategists and D2C growth teams",focus:["Creative persistence","Repeated hooks","Hypothesis building"],caveat:"Only your own first-party results can establish whether a similar creative works for your business.",related:["/competitor-ad-intelligence","/guides/how-to-analyze-competitor-ads","/research/d2c-ad-creative-trends-2026"],faqs:[{q:"Does a long-running ad prove it is a winner?",a:"No. It is a useful research signal that may justify closer inspection, not proof of a competitor's performance."},{q:"What should I test after finding a durable creative?",a:"Test the underlying proposition or angle with original creative and your own audience."}]},
];

const industryData: Seed[] = INDUSTRIES.map((i) => ({
  slug: i.slug,
  title: `${i.name} Brands' Facebook & Instagram Ads in India`,
  description: `Live Meta ad data for ${i.brands.length} Indian ${i.noun}: active ads, new launches, video vs image mix, languages and the ads running longest.`,
  h1: `${i.name} ads in India, tracked live`,
  intro: i.intro,
  audience: `Founders, growth teams and agencies in ${i.name.toLowerCase()}`,
  focus: i.watch.map((w) => w.title),
  caveat: "Counts come from Meta's public Ad Library for India and update daily. Meta does not publish spend or results for commercial ads, so no figure here is a spend estimate.",
  related: [...INDUSTRIES.filter((x) => x.slug !== i.slug).slice(0, 3).map((x) => `/industries/${x.slug}`), "/research/india-d2c-advertising-report-2026"],
  faqs: [
    { q: `Which ${i.noun} are included?`, a: `${i.brands.join(", ")}. We collect their public Meta ads every night.` },
    { q: "Can I see these brands' ad spend?", a: "No. Meta does not publish spend, reach or results for commercial ads in India. We show what is public: every ad, when it started, whether it is live, its format and language." },
  ],
}));

const researchData: Seed[] = [
  {slug:"india-d2c-advertising-report-2026",title:"India D2C Advertising Report 2026 (Live Meta Ad Data)",description:"Live numbers on how Indian D2C brands advertise on Facebook and Instagram: active ads, new launches, video share, languages and the most active brands by category.",h1:"India D2C advertising report 2026",intro:"How Indian D2C brands advertise on Meta right now, measured from their public ads and refreshed every day.",audience:"D2C founders, marketers, agencies and investors",focus:["Ad volume by category","Format and language mix","Most active advertisers"],caveat:"Figures cover the D2C brands Zooptrack collects every night from Meta's public Ad Library (India). Meta does not publish spend or results for commercial ads, so this report measures ad activity, not spend.",related:["/research/d2c-ad-creative-trends-2026","/industries","/guides/how-to-analyze-competitor-ads"],faqs:[{q:"Where does this data come from?",a:"From Meta's public Ad Library for India. Zooptrack collects every public ad from the tracked brands every night and counts them; nothing is estimated."},{q:"How often is the report updated?",a:"Every day. The numbers on this page are recalculated from the latest collection."}]},
  {slug:"d2c-ad-creative-trends-2026",title:"D2C Ad Creative Trends 2026: Formats, Languages & Longest-Running Ads",description:"Which ad formats and languages Indian D2C brands use in each category, and the ads that have stayed live the longest, from live Meta Ad Library data.",h1:"D2C ad creative trends 2026",intro:"Video or image? English or Hindi? And which ads have survived the longest? Live creative patterns across Indian D2C categories.",audience:"Creative strategists, performance marketers and founders",focus:["Video vs image vs carousel by category","Language mix by category","Longest-running live ads"],caveat:"Longevity is a signal, not proof of performance: an ad that keeps running is usually working, but only the advertiser knows its results.",related:["/research/india-d2c-advertising-report-2026","/guides/how-to-find-winning-ad-creatives","/industries"],faqs:[{q:"Why do long-running ads matter?",a:"Brands switch off losing ads within days. An ad still live after months is very likely profitable, which makes it the best public signal of what works."},{q:"How is format measured?",a:"Each collected ad is classed as video, image or carousel from Meta's own ad data, then counted per category."}]},
];

const tools: SeoEntry[] = [
  seed("tool",{slug:"roas-calculator",title:"ROAS Calculator",description:"Calculate return on ad spend from revenue and advertising spend.",h1:"ROAS calculator",intro:"Get the arithmetic right before you interpret the result.",audience:"Marketers and D2C operators",focus:["Revenue","Ad spend","ROAS"],caveat:"ROAS alone does not tell you contribution margin or profit.",related:["/tools/break-even-roas","/d2c-ad-intelligence"],faqs:[{q:"What is the formula?",a:"ROAS is revenue divided by advertising spend."},{q:"Does ROAS equal profit?",a:"No. Profit also depends on product economics and other costs."}],calculator:"roas"}),
  seed("tool",{slug:"break-even-roas",title:"Break-Even ROAS Calculator",description:"Calculate the ROAS at which contribution covers ad spend under a simple margin assumption.",h1:"Break-even ROAS calculator",intro:"Know the minimum ROAS your economics require.",audience:"D2C founders and performance marketers",focus:["Contribution margin","Break-even ROAS","Scenario thinking"],caveat:"The real break-even point depends on the exact costs included in your margin definition.",related:["/tools/roas-calculator","/guides/how-to-monitor-competitor-offers"],faqs:[{q:"What is the simplified formula?",a:"Break-even ROAS is 1 divided by contribution margin expressed as a decimal."},{q:"Is the result a forecast?",a:"No. It is a transparent guardrail based on your input assumptions."}],calculator:"break-even-roas"}),
  seed("tool",{slug:"cac-calculator",title:"CAC Calculator",description:"Calculate customer acquisition cost from acquisition spend and new customers.",h1:"CAC calculator",intro:"Turn acquisition spend into a comparable customer cost.",audience:"Growth teams and founders",focus:["Acquisition spend","New customers","CAC"],caveat:"A blended CAC can hide channel and cohort differences.",related:["/tools/contribution-margin","/competitor-ad-intelligence"],faqs:[{q:"What is the formula?",a:"CAC is acquisition spend divided by new customers acquired."},{q:"What should CAC be compared with?",a:"Compare it with contribution per customer, payback assumptions and cohort economics."}],calculator:"cac"}),
  seed("tool",{slug:"contribution-margin",title:"Contribution Margin Calculator",description:"Estimate contribution margin from revenue and variable costs with explicit inputs.",h1:"Contribution margin calculator",intro:"See what is left before fixed costs and advertising.",audience:"D2C finance and growth teams",focus:["Revenue","Variable costs","Contribution margin"],caveat:"The result is only as useful as the cost definition behind it.",related:["/tools/roas-calculator","/tools/break-even-roas"],faqs:[{q:"What is contribution margin?",a:"For this calculator, it is contribution profit divided by revenue using the variable costs you enter."},{q:"Why define the costs carefully?",a:"Different teams include different variable costs, so the definition needs to stay consistent across comparisons."}],calculator:"contribution-margin"}),
  seed("tool",{slug:"rto-calculator",title:"RTO Calculator",description:"Calculate return-to-origin rate from shipped orders and returned orders.",h1:"RTO calculator",intro:"Measure the return-to-origin rate clearly.",audience:"COD-heavy D2C teams and operators",focus:["Shipped orders","RTO orders","RTO rate"],caveat:"RTO rate alone does not measure the full financial impact of returns.",related:["/tools/contribution-margin","/industries/fashion"],faqs:[{q:"What is the formula?",a:"RTO rate is returned-to-origin orders divided by shipped orders."},{q:"What should I track alongside RTO?",a:"Track fulfillment cost, contribution margin, customer experience and the cohort definition used for the rate."}],calculator:"rto"})
];

export const commercialEntries = commercialData.map((s) => seed("commercial", s));
export const guideEntries = guideData.map((s) => seed("guide", s));
export const toolEntries = tools;
export const industryEntries = industryData.map((s) => seed("industry", s));
export const researchEntries = researchData.map((s) => seed("research", s));

export const allSeoEntries: SeoEntry[] = [...commercialEntries, ...guideEntries, ...toolEntries, ...industryEntries, ...researchEntries];
export function seoPath(entry: SeoEntry) {
  if (entry.section === "commercial") return `/${entry.slug}`;
  return `/${entry.section === "guide" ? "guides" : entry.section === "tool" ? "tools" : entry.section === "industry" ? "industries" : "research"}/${entry.slug}`;
}
export function findSeoEntry(section: SeoSection, slug: string) {
  return allSeoEntries.find((entry) => entry.section === section && entry.slug === slug) ?? null;
}


const REDIRECT_TO = new Map(SEO_REDIRECTS);

/** A related link, followed through any redirect so we never link to a removed page. */
export function liveHref(href: string): string {
  return REDIRECT_TO.get(href) ?? href;
}

/** Human title for an internal link (falls back to a tidy version of the path). */
export function titleForHref(href: string): string {
  const path = liveHref(href);
  const entry = allSeoEntries.find((e) => seoPath(e) === path);
  if (entry) return entry.h1;
  if (path === "/brand") return "Browse brand ad pages";
  if (path === "/pricing") return "Zooptrack pricing";
  if (path === "/industries") return "All D2C industries";
  return path.replace(/^\//, "").replace(/[-/]+/g, " ");
}
