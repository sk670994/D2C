/**
 * D2C categories for the public industry pages. Brand names match
 * scripts/adspy-seed-brands.json exactly (the nightly collection list), so
 * every number on an industry page comes from brands we actually collect.
 * Copy here is editorial guidance on what to watch; all figures are live.
 */
export type Industry = {
  slug: string;
  name: string;
  /** Short noun used inside sentences, e.g. "skincare brands". */
  noun: string;
  intro: string;
  watch: Array<{ title: string; body: string }>;
  brands: string[];
};

export const INDUSTRIES: Industry[] = [
  {
    slug: "skincare",
    name: "Skincare",
    noun: "skincare brands",
    intro: "Indian skincare is one of the most crowded D2C categories on Meta. Brands compete on ingredients, routines and proof, and many test dozens of creatives at once.",
    watch: [
      { title: "Ingredient-led hooks", body: "Niacinamide, vitamin C or retinol in the first line. Watch which actives a rival keeps leading with week after week." },
      { title: "Routine bundles", body: "Kits and 'complete routine' combos raise order value without a straight discount. Note when a rival moves from single products to bundles." },
      { title: "Proof formats", body: "Before/after, dermatologist and customer-review creatives. The ones that stay live for months are worth studying first." },
    ],
    brands: ["Minimalist", "The Derma Co", "Aqualogica", "Dr. Sheth's", "Plum", "Foxtale", "Re'equil", "Deconstruct", "Dot & Key", "Pilgrim", "Mamaearth", "WOW Skin Science", "mCaffeine", "Juicy Chemistry", "Skinkraft"],
  },
  {
    slug: "beauty",
    name: "Beauty & Ayurveda",
    noun: "beauty and Ayurvedic brands",
    intro: "Makeup, fragrance and Ayurvedic beauty brands sell on look, ritual and heritage. Creative tends to be visual first, with festive and gifting moments driving bursts of new ads.",
    watch: [
      { title: "Festive bursts", body: "Count new launches in the weeks before Diwali, Raksha Bandhan and wedding season. A sudden jump usually means a seasonal push." },
      { title: "Gift sets and minis", body: "Gift boxes and travel minis are a common way to discount without cutting the hero price." },
      { title: "Heritage vs. results", body: "Ayurvedic brands often lead with tradition, modern brands with results. See which angle a rival keeps paying for." },
    ],
    brands: ["Sugar Cosmetics", "Nykaa", "Kama Ayurveda", "Forest Essentials", "Biotique", "Khadi Natural", "Just Herbs", "Soulflower", "Bella Vita Organic", "Vedix", "Arata"],
  },
  {
    slug: "mens-grooming",
    name: "Men's grooming & wellness",
    noun: "men's grooming and wellness brands",
    intro: "Men's grooming and wellness brands, from beard care to hair-loss treatment, rely heavily on problem-first hooks, founder or expert faces, and Hindi creative to reach beyond metros.",
    watch: [
      { title: "Problem-first hooks", body: "Hair fall, beard patchiness, confidence. The first three seconds name the problem; watch how rivals phrase it." },
      { title: "Hindi and Hinglish", body: "Language mix tells you which audience a rival is chasing. A rise in Hindi ads often signals a push into tier-2 cities." },
      { title: "Consultation offers", body: "Free assessments and doctor consults lower the barrier for treatment brands. Note when a rival adds or drops them." },
    ],
    brands: ["The Man Company", "Bombay Shaving Company", "Beardo", "Ustraa", "Man Matters", "Bold Care", "Traya", "Villain"],
  },
  {
    slug: "supplements",
    name: "Health & supplements",
    noun: "health, nutrition and fitness brands",
    intro: "Supplement and nutrition brands compete on trust: certifications, experts and visible results. Ads often lean on education and subscription offers rather than one-off discounts.",
    watch: [
      { title: "Education-led video", body: "Explainers on ingredients and benefits. Long-running videos here usually anchor the brand's whole funnel." },
      { title: "Subscribe-and-save", body: "Watch for subscription and 'buy 3 months' offers; they show where a rival is fighting for repeat purchase." },
      { title: "Claims and trust signals", body: "Lab-tested, clinically studied, expert-approved. Track which trust signal each rival leads with." },
    ],
    brands: ["Kapiva", "Plix", "Oziva", "Wellbeing Nutrition", "Power Gummies", "Mars by GHC", "Be Bodywise", "MuscleBlaze", "HealthKart", "Fast&Up", "Gritzo", "Nutrabay", "Cult.fit", "Boldfit"],
  },
  {
    slug: "fashion",
    name: "Fashion & ethnic wear",
    noun: "fashion and ethnic-wear brands",
    intro: "Fashion brands run the highest volume of creative of almost any D2C category, because every drop, colour and season needs new ads. Catalogue and carousel formats dominate.",
    watch: [
      { title: "Drop cadence", body: "New ads per week is a proxy for how often a rival launches collections. Spikes mark new drops or sales." },
      { title: "Catalogue vs. story", body: "Carousels and catalogue ads sell inventory; video and model stories build the brand. The mix shows a rival's priority." },
      { title: "Sale windows", body: "End-of-season and festive sales show up as bursts of discount-led creative. Plan your counter-moves around them." },
    ],
    brands: ["Snitch", "The Souled Store", "Bewakoof", "Rare Rabbit", "Libas", "Bunaai", "FableStreet", "Pinklay", "Suta", "Okhai", "Fabindia", "Jaypore", "The Label Life"],
  },
  {
    slug: "innerwear",
    name: "Innerwear & loungewear",
    noun: "innerwear and loungewear brands",
    intro: "Innerwear brands sell comfort and fit, often with multi-pack offers. Comfort claims, fabric close-ups and size inclusivity are the recurring creative themes.",
    watch: [
      { title: "Multi-pack offers", body: "Packs of 3 or 5 are the default discount mechanic. Note pack size and price-per-piece changes." },
      { title: "Fit and fabric proof", body: "Stretch tests, fabric macros and fit guides. These often run for a long time once they work." },
      { title: "Gender and audience split", body: "Separate men's and women's lines often mean separate creative sets; compare them side by side." },
    ],
    brands: ["Nykd by Nykaa", "Clovia", "Zivame", "Jockey India", "XYXX", "Damensch", "Bummer"],
  },
  {
    slug: "electronics",
    name: "Audio, wearables & gadgets",
    noun: "audio, wearable and gadget brands",
    intro: "Consumer-electronics D2C brands launch fast and price sharply. Ads are built around launches, specs and sale events on marketplaces as well as their own sites.",
    watch: [
      { title: "Launch spikes", body: "A cluster of new ads usually means a new product. Track how long launch creative stays live." },
      { title: "Spec-first copy", body: "Battery life, ANC, display size. See which spec each rival leads with for the same price band." },
      { title: "Sale-event timing", body: "Ads ramp up around big marketplace sales. Compare when each rival starts and stops pushing." },
    ],
    brands: ["boAt", "Noise", "Fire-Boltt", "Boult", "Ultrahuman"],
  },
  {
    slug: "home-sleep",
    name: "Home, sleep & furniture",
    noun: "home, sleep and furniture brands",
    intro: "Mattress, furniture and home-decor brands sell high-ticket products with long consideration. Trials, warranties and EMI offers do much of the work in their ads.",
    watch: [
      { title: "Risk-reversal offers", body: "100-night trials, long warranties and no-cost EMI. These are the levers rivals pull instead of deep discounts." },
      { title: "Comparison creative", body: "Side-by-side tests against 'ordinary' mattresses or furniture are common and often long-running." },
      { title: "Sale calendars", body: "Big festive and end-of-season sales drive most new creative. Watch when each rival starts its push." },
    ],
    brands: ["Wakefit", "Sleepyhead", "The Sleep Company", "Duroflex", "Pepperfry", "Urban Ladder", "Chumbak", "Nestasia"],
  },
  {
    slug: "jewellery-accessories",
    name: "Jewellery, eyewear & travel",
    noun: "jewellery, eyewear and travel-accessory brands",
    intro: "Jewellery, eyewear and luggage brands sell style and gifting. Creative is product-close and visual, with gifting occasions and try-on or warranty offers as recurring hooks.",
    watch: [
      { title: "Gifting moments", body: "Valentine's, Raksha Bandhan and Diwali drive bursts of gifting creative. Count new ads per week around them." },
      { title: "Try-on and warranty", body: "Home try-on, lifetime plating or long luggage warranties reduce purchase risk. Note which rivals lead with them." },
      { title: "Price anchoring", body: "'Starting at' prices and price-band collections. Watch for changes in the anchor price a rival advertises." },
    ],
    brands: ["Giva", "Salty", "Melorra", "CaratLane", "BlueStone", "Lenskart", "Mokobara", "Nasher Miles", "Uppercase", "Zouk"],
  },
  {
    slug: "footwear",
    name: "Footwear",
    noun: "footwear brands",
    intro: "Footwear D2C brands compete on comfort, style and price. Product demos and comfort claims are the standard creative, with sale events driving bursts of new ads.",
    watch: [
      { title: "Comfort proof", body: "Flex tests, all-day wear stories and material close-ups. Long-running versions show what actually convinces buyers." },
      { title: "Range vs. hero", body: "Some rivals push one hero shoe, others a whole range. The format mix (video vs. carousel) usually tells you which." },
      { title: "Price-led sales", body: "Watch for flat-price and 'buy 2' offers around sale seasons." },
    ],
    brands: ["Neemans", "Bacca Bucci", "Campus Shoes", "Sparx"],
  },
  {
    slug: "food-beverage",
    name: "Food & beverage",
    noun: "food and beverage brands",
    intro: "Food and beverage D2C brands, from snacks and coffee to dairy and meat, sell taste, health and convenience. Ads often focus on new flavours, clean labels and subscription or first-order offers.",
    watch: [
      { title: "New flavours and SKUs", body: "Launch creative for new flavours shows up as bursts of new ads. Track which launches keep running." },
      { title: "Clean-label claims", body: "No added sugar, high protein, preservative-free. See which claim each rival leads with." },
      { title: "First-order and subscription offers", body: "Delivery brands lean on first-order discounts and subscriptions; snack brands on combos." },
    ],
    brands: ["Yoga Bar", "The Whole Truth", "Slurrp Farm", "True Elements", "Wingreens Farms", "Paper Boat", "Sleepy Owl", "Blue Tokai", "Rage Coffee", "Country Delight", "Licious", "FreshToHome", "Epigamia", "Akshayakalpa", "Farmley", "Happilo", "Open Secret", "Too Yumm", "Chaayos", "Vahdam", "Tea Trunk", "Bira 91", "Hocco", "Pintola", "MyFitness", "Kilrr"],
  },
  {
    slug: "mother-baby",
    name: "Mother & baby",
    noun: "mother and baby brands",
    intro: "Mother and baby brands sell safety and trust to anxious first-time parents. Ads lean on certifications, gentle ingredients and real-parent stories.",
    watch: [
      { title: "Safety and certification", body: "Dermatologically tested, toxin-free, paediatrician-approved. Track the trust signal each rival leads with." },
      { title: "Parent testimonials", body: "Real-parent videos tend to run for a long time. Study the ones that stay live longest." },
      { title: "Bundles for life stages", body: "Newborn kits and stage-based bundles are common offers. Note when rivals introduce new ones." },
    ],
    brands: ["The Moms Co", "Mother Sparsh", "SuperBottoms", "Mylo", "FirstCry", "Hopscotch", "The Baby Brand Store"],
  },
  {
    slug: "womens-wellness",
    name: "Women's wellness & hygiene",
    noun: "women's wellness and hygiene brands",
    intro: "Period-care and intimate-hygiene brands balance education with product. Ads often break taboos with direct, conversational hooks and lean on subscriptions and trial packs.",
    watch: [
      { title: "Education hooks", body: "Myth-busting and 'what no one tells you' openers. These often anchor long-running campaigns." },
      { title: "Trial packs and subscriptions", body: "Low-price trial packs and monthly subscriptions lower the first purchase. Track price changes on them." },
      { title: "Tone and language", body: "Some rivals stay clinical, others playful. The language mix shows which audience they are reaching." },
    ],
    brands: ["Sirona", "Pee Safe", "Nua", "Carmesi", "Azah"],
  },
  {
    slug: "pet-care",
    name: "Pet care",
    noun: "pet-care brands",
    intro: "Pet food, treats and accessories brands sell to devoted pet parents. Cute-first creative, ingredient transparency and first-order offers are the recurring patterns.",
    watch: [
      { title: "Pet-first video", body: "Short videos of pets reacting to food or toys. The long-running ones are usually the brand's best performers." },
      { title: "Ingredient transparency", body: "Real meat, grain-free, vet-approved. Watch which claim each rival repeats." },
      { title: "First-order and repeat offers", body: "Pet care is a repeat-purchase category; look for subscription and auto-reorder offers." },
    ],
    brands: ["Supertails", "Heads Up For Tails", "Drools", "Wiggles"],
  },
  {
    slug: "kitchen-appliances",
    name: "Kitchen & home appliances",
    noun: "kitchen and home-appliance brands",
    intro: "Fan, purifier, cookware and appliance brands sell on energy savings, durability and demos. Ads are demo-heavy and often tied to seasonal demand like summer or monsoon.",
    watch: [
      { title: "Demo creative", body: "Product-in-use videos and comparisons. These tend to run long when they work." },
      { title: "Savings claims", body: "Energy, water or time savings in the hook. Track which number each rival advertises." },
      { title: "Seasonal timing", body: "Fans and coolers before summer, purifiers before monsoon. Watch when rivals start ramping up." },
    ],
    brands: ["Atomberg", "Wonderchef", "Borosil", "Milton", "Agaro", "Kent RO", "Livpure"],
  },
];

export function findIndustry(slug: string): Industry | null {
  return INDUSTRIES.find((i) => i.slug === slug) ?? null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The industry a brand belongs to, by name (case and punctuation ignored). */
export function industryOfBrand(name: string): Industry | null {
  const want = norm(name);
  return INDUSTRIES.find((i) => i.brands.some((b) => norm(b) === want)) ?? null;
}
