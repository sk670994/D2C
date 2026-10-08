/**
 * Season and festival pages (/seasons/[slug]). Every number on them comes
 * from ads whose copy mentions the season, so a page is only as rich as the
 * ads we have collected. Keywords are matched case-insensitively in the ad's
 * primary text and headline; Hindi spellings are included.
 */
export type Season = {
  slug: string;
  name: string;
  /** Used inside sentences: "Diwali ads". */
  short: string;
  hue: string;
  keywords: string[];
  when: string;
  intro: string;
  watch: Array<{ title: string; body: string }>;
  faqs: Array<{ q: string; a: string }>;
};

export const SEASONS: Season[] = [
  {
    slug: "diwali",
    name: "Diwali",
    short: "Diwali",
    hue: "#B4231F",
    keywords: ["diwali", "deepavali", "dipawali", "dhanteras", "दिवाली", "दीपावली", "धनतेरस"],
    when: "October to November, peaking in the two weeks before Lakshmi Puja",
    intro: "Diwali is the biggest ad moment of the Indian year. Brands start earlier every year, gifting and bundle offers take over, and costs per click jump. This page tracks every Diwali ad we collect, live.",
    watch: [
      { title: "Who starts first", body: "The week a rival's Diwali ads begin tells you how long their campaign runs. Early starters usually lock in cheaper reach." },
      { title: "Gifting vs discount", body: "Gift sets and combos protect margins; flat discounts do not. Watch which one your rivals lead with this year." },
      { title: "The post-Diwali wave", body: "Many brands stop the day after Diwali. Rivals who keep running into wedding season pick up cheaper attention." },
    ],
    faqs: [
      { q: "When do brands start Diwali ads?", a: "The calendar on this page shows it week by week from our data. Most of the volume lands in the four weeks before Diwali, with the earliest brands starting about six weeks out." },
      { q: "What offers do Diwali ads use most?", a: "See the offer mix on this page: it counts discounts, free gifts, bundles, cashback and no-cost EMI across every Diwali ad we have collected." },
    ],
  },
  {
    slug: "dussehra",
    name: "Dussehra and Navratri",
    short: "Dussehra",
    hue: "#D9480F",
    keywords: ["dussehra", "dusshera", "dussera", "dasara", "dasera", "vijayadashami", "navratri", "navaratri", "garba", "दशहरा", "नवरात्रि"],
    when: "September to October, nine nights of Navratri ending in Dussehra",
    intro: "Navratri and Dussehra open the festive quarter. Fashion, jewellery and vehicles lead, and many brands use it to test offers before Diwali. This page tracks every Dussehra and Navratri ad we collect.",
    watch: [
      { title: "A rehearsal for Diwali", body: "Offers that work in Navratri often scale into Diwali. Note which hooks rivals keep running after Dussehra." },
      { title: "Shubh muhurat buying", body: "Vehicles, gold and big appliances push 'auspicious day' purchase messages. Watch how rivals frame the occasion." },
      { title: "Regional timing", body: "Garba in Gujarat, Durga Puja in Bengal, Dasara in Karnataka: regional language ads show who is targeting which state." },
    ],
    faqs: [
      { q: "Which categories advertise most for Navratri and Dussehra?", a: "The category breakdown on this page counts it from live ads: fashion, jewellery, vehicles and appliances usually lead." },
    ],
  },
  {
    slug: "festive-season",
    name: "Festive season",
    short: "festive",
    hue: "#C2185B",
    keywords: ["festive", "festival", "tyohar", "tyohaar", "durga puja", "onam", "ganesh chaturthi", "raksha bandhan", "rakhi", "eid", "pongal", "holi", "त्योहार", "त्यौहार"],
    when: "All year, with the biggest run from August to November",
    intro: "From Rakhi and Onam to Durga Puja, Diwali and Holi, Indian brands advertise around festivals all year. This page tracks every festive ad we collect and shows which festivals pull the most ad effort.",
    watch: [
      { title: "The festive calendar", body: "Volume climbs from Raksha Bandhan and peaks around Diwali. The weekly chart shows when the market is loudest." },
      { title: "Festival-specific creative", body: "Rakhi gifting, Onam sadya, Puja new clothes: rivals who localise creative to a festival usually beat generic 'festive sale' ads." },
      { title: "Language mix", body: "Festive ads lean on Hindi and regional languages more than the rest of the year. Check whether your creative does too." },
    ],
    faqs: [
      { q: "What counts as a festive ad here?", a: "Any ad whose text mentions a festival or the festive season, such as Rakhi, Onam, Durga Puja, Diwali, Eid, Pongal or Holi." },
    ],
  },
  {
    slug: "holiday-season",
    name: "Holiday and year-end sales",
    short: "holiday",
    hue: "#1E6B52",
    keywords: ["holiday", "christmas", "xmas", "new year", "year end", "year-end", "vacation", "end of season sale", "eoss", "big billion", "great indian festival", "mega sale"],
    when: "Big sale days in September and October, then Christmas, New Year and end-of-season sales",
    intro: "Big Billion Days, the Great Indian Festival, Christmas, New Year and end-of-season sales: these are the days Indian shoppers wait for. This page tracks every sale and holiday ad we collect.",
    watch: [
      { title: "Marketplace sale days", body: "D2C brands run ads that point to Amazon and Flipkart during sale events. Watch whose ads switch landing pages to marketplaces." },
      { title: "Discount depth", body: "The offer mix shows how deep the market is discounting. Going deeper than rivals is rarely needed: being visible is." },
      { title: "End-of-season clearance", body: "Fashion and footwear clear stock in January and July. Track when rivals start, so you are not the last one in." },
    ],
    faqs: [
      { q: "Does this include Amazon and Flipkart sale ads?", a: "It includes Meta ads from brands that mention sale events like Big Billion Days or the Great Indian Festival. It does not include ads shown inside Amazon or Flipkart." },
    ],
  },
  {
    slug: "winter",
    name: "Winter",
    short: "winter",
    hue: "#2B6CB0",
    keywords: ["winter", "sardi", "sardiyon", "cold weather", "thand", "woollen", "woolen", "dry skin", "सर्दी", "सर्दियों", "ठंड"],
    when: "November to February",
    intro: "Winter changes what India buys: heaters, geysers, moisturisers, woollens, chyawanprash. This page tracks every winter ad we collect and shows which categories push hardest when it gets cold.",
    watch: [
      { title: "Season-led products", body: "Geysers, heaters and dry-skin care sell on the weather. Watch how early rivals start: the first cold week in North India is the trigger." },
      { title: "North vs South", body: "Winter means very different things in Delhi and Chennai. Language and region tell you who rivals are targeting." },
      { title: "Bundles and gifting", body: "Winter overlaps wedding season and Christmas. Many brands pair winter products with gift packs." },
    ],
    faqs: [
      { q: "Which brands run the most winter ads?", a: "The ranking on this page counts it from live data, updated every few hours." },
    ],
  },
  {
    slug: "summer",
    name: "Summer",
    short: "summer",
    hue: "#C98500",
    keywords: ["summer", "garmi", "heatwave", "heat wave", "beat the heat", "sunscreen", "sun protection", "गर्मी", "गर्मियों"],
    when: "March to June",
    intro: "Summer drives ACs, coolers, fans, sunscreen, cold drinks and light clothing. This page tracks every summer ad we collect and shows who is fighting for the heat.",
    watch: [
      { title: "The first heatwave", body: "Searches and ads for ACs and coolers spike with the first heatwave. Watch who ramps up first and how hard." },
      { title: "Cooling claims", body: "Energy savings, faster cooling, SPF numbers: track which claim rivals lead with and whether they back it with a number." },
      { title: "EMI and exchange offers", body: "Big summer purchases lean on no-cost EMI and exchange offers. The offer mix shows how common they are this year." },
    ],
    faqs: [
      { q: "When do AC and cooler brands start summer ads?", a: "The weekly calendar on this page shows it from our data; most ramp up in March and peak in April and May." },
    ],
  },
  {
    slug: "monsoon",
    name: "Monsoon",
    short: "monsoon",
    hue: "#1F7A8C",
    keywords: ["monsoon", "rainy", "rainy season", "barish", "baarish", "barsaat", "humidity", "frizz", "बारिश", "मानसून", "बरसात"],
    when: "June to September",
    intro: "The monsoon brings its own shopping list: frizz care, footwear, raincoats, mosquito protection, water purifiers and comfort food. This page tracks every monsoon ad we collect.",
    watch: [
      { title: "Problem-first hooks", body: "Frizz, fungal infections, damp clothes: monsoon ads open with the problem. Watch which problem each rival owns." },
      { title: "Health and hygiene", body: "Water purifiers and immunity products push hardest in the rains. Track their claims and certifications." },
      { title: "Regional arrival", body: "The monsoon reaches Kerala in June and Delhi in July. Language and timing show who is following the rains." },
    ],
    faqs: [
      { q: "Which categories advertise most in the monsoon?", a: "See the category breakdown on this page: it is counted from every monsoon ad we have collected." },
    ],
  },
];

export function findSeason(slug: string): Season | null {
  return SEASONS.find((s) => s.slug === slug) ?? null;
}
