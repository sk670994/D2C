/**
 * Long-form guide content. Written for Indian D2C founders and agencies;
 * each guide answers one job end to end. Keep every claim true: Meta's
 * Ad Library shows ads and dates for commercial advertisers in India,
 * not spend, reach or results.
 */
export type GuideSection = { id: string; h2: string; paras: string[]; list?: string[]; ordered?: boolean };
export type Guide = { slug: string; minutes: number; tldr: string[]; sections: GuideSection[]; next: string[] };

export const GUIDES: Record<string, Guide> = {
  "how-to-use-meta-ad-library": {
    slug: "how-to-use-meta-ad-library",
    minutes: 7,
    tldr: [
      "Meta's Ad Library is free and shows every active ad a brand runs on Facebook, Instagram, Messenger and Audience Network.",
      "Set the country to India and the category to 'All ads', then search by brand name, not keyword, to see one advertiser cleanly.",
      "It shows creatives, copy, platforms and the date each ad started. It does not show spend, reach or results for commercial ads in India.",
      "The 'Started running on' date is the most useful signal: ads that stay live for months are usually profitable.",
    ],
    sections: [
      {
        id: "what-it-is",
        h2: "What the Meta Ad Library is",
        paras: [
          "The Meta Ad Library is a public, searchable archive of ads running across Meta's apps. Meta built it for transparency, which means anyone can see what any business is advertising today, without logging in to an ad account and without the advertiser knowing you looked.",
          "For a D2C brand this is the closest thing to a window into a competitor's marketing. You can see the exact images and videos they are paying to show, the words they use, the offers they lead with and how many versions they are testing at once.",
        ],
      },
      {
        id: "step-by-step",
        h2: "How to search it, step by step",
        ordered: true,
        paras: ["The interface changes from time to time, but the flow has stayed the same for years:"],
        list: [
          "Open facebook.com/ads/library in a browser. You do not need to be logged in.",
          "Set the country to India. Ads are shown by the country they are delivered in, so the wrong country hides most Indian D2C ads.",
          "Set the ad category to 'All ads'. The other category covers political and social-issue ads, which work differently.",
          "Type the brand name and pick the advertiser from the drop-down (the Page with its logo), rather than pressing Enter for a keyword search. This shows only that Page's ads.",
          "Use the filters for active status, platform and date to narrow the list, and open 'See ad details' on any ad to see its versions.",
        ],
      },
      {
        id: "what-you-can-see",
        h2: "What you can and cannot see",
        paras: [
          "For each ad you can see the creative, the primary text and headline, the call-to-action button, the platforms it runs on, whether it is active and the date it started running. When an advertiser runs several versions of the same ad, the library groups them, which tells you they are testing variations.",
          "What you cannot see for normal commercial ads in India is just as important: spend, impressions, reach, clicks, sales and targeting are not published. Spend and reach ranges are only shown for political and social-issue ads. Any tool that claims to show a D2C competitor's exact spend in India is estimating, not reading data.",
        ],
      },
      {
        id: "signals",
        h2: "The three signals worth reading",
        paras: ["Because spend is hidden, experienced marketers read the library through a few proxies:"],
        list: [
          "Longevity: an ad that has been running for 60 or 90 days is almost certainly working, because brands switch off losing ads within days.",
          "Volume: the number of active ads shows how hard a brand is pushing right now. A sudden jump usually means a launch or a sale.",
          "Repetition: when the same hook, offer or format appears across many new ads, the brand has found something it believes in.",
        ],
      },
      {
        id: "limits",
        h2: "Where the Ad Library falls short",
        paras: [
          "The library is built for looking up one advertiser at a time. It keeps no history once ads stop (for commercial ads in India), has no labels for hooks or offers, does not compare brands side by side and does not tell you what changed since you last looked. Teams end up with folders of screenshots and no memory of what a rival was running last month.",
          "That gap is what tools like Zooptrack fill: the same public data, collected every day for every rival, kept after ads stop, labelled by hook, offer, format and language, and summarised as 'what changed'. You can see the result for real brands on our free brand pages.",
        ],
      },
    ],
    next: ["/guides/how-to-find-competitor-ads", "/guides/how-to-find-winning-ad-creatives", "/meta-ad-library-india"],
  },

  "how-to-find-competitor-ads": {
    slug: "how-to-find-competitor-ads",
    minutes: 6,
    tldr: [
      "Start from a list of 5 to 10 real rivals: the brands your customers compare you with, not just the biggest names.",
      "Look them up on Facebook and Instagram via the Meta Ad Library, by Page, with the country set to India.",
      "Check sub-brands and second Pages: many brands run ads from more than one Page.",
      "Save what you find in one place with dates, or you will lose the history the moment ads stop.",
    ],
    sections: [
      {
        id: "who-are-rivals",
        h2: "Decide who your competitors actually are",
        paras: [
          "The most useful competitor list is not the five biggest brands in your category. It is the brands your customers actually consider before buying from you. Ask recent customers what else they looked at, check who appears next to you on Amazon and Nykaa search, and see which brands show up when you search your main keyword on Instagram.",
          "Aim for three groups: two or three category leaders (to learn what scale looks like), three or four direct rivals at your price point, and one or two fast-growing newcomers. Ten brands is plenty; more than that and nobody reads the research.",
        ],
      },
      {
        id: "meta",
        h2: "Find their Facebook and Instagram ads",
        ordered: true,
        paras: ["Meta is where most Indian D2C brands spend, so start there:"],
        list: [
          "In the Meta Ad Library, set country to India and category to 'All ads'.",
          "Search each brand and pick its Page from the drop-down so you see only that advertiser.",
          "Filter to active ads first. That is what the brand is betting on today.",
          "Sort or scan by start date and note the oldest active ads; these are the likely winners.",
          "Open ads with several versions to see what the brand is testing.",
        ],
      },
      {
        id: "pages",
        h2: "Don't miss second Pages and sub-brands",
        paras: [
          "Many D2C companies advertise from more than one Facebook Page: a main brand, a sub-brand for a product line, a founder's Page, or a Page used for a specific market. If a competitor looks oddly quiet, search for their product names and sub-brands too. In Zooptrack, every brand is tied to its exact Meta Page ID, so ads from look-alike Pages are not mixed in.",
        ],
      },
      {
        id: "other-platforms",
        h2: "Other places competitors advertise",
        paras: [
          "Google's Ads Transparency Center shows search, YouTube and display ads by advertiser. Marketplace ads on Amazon and Flipkart have no public library, but you can see sponsored placements by searching your main keywords and noting which brands appear as 'Sponsored'. For most D2C brands, though, Meta is where creative testing happens, so it gives you the richest picture.",
        ],
      },
      {
        id: "keep-history",
        h2: "Keep a record, or you'll lose it",
        paras: [
          "The hardest part is not finding ads, it is remembering them. Once an ad stops, it disappears from the active view, and without a record you cannot answer simple questions like 'when did they start that offer?' or 'how long did that video run?'.",
          "At minimum, keep a sheet with the brand, a screenshot or link, the start date, the hook, the offer and the format. Or let Zooptrack collect it every night and keep the history for you.",
        ],
      },
    ],
    next: ["/guides/how-to-analyze-competitor-ads", "/guides/how-to-monitor-competitor-ads", "/brand"],
  },

  "how-to-analyze-competitor-ads": {
    slug: "how-to-analyze-competitor-ads",
    minutes: 8,
    tldr: [
      "Analyse a rival's ads as a set, not one at a time: look for what repeats across many ads.",
      "Break every ad into the same five parts: hook, offer, format, language and call to action.",
      "Weight long-running ads more heavily than new ones; longevity is the best public proxy for performance.",
      "End every analysis with a decision or a test brief, not a list of observations.",
    ],
    sections: [
      {
        id: "set-not-ad",
        h2: "Analyse patterns, not single ads",
        paras: [
          "One ad tells you almost nothing. A brand may be running it as a test that will be switched off tomorrow. What matters is what keeps coming back: the hook that appears in ten new ads, the offer that has been live for three months, the format that makes up most of the active set.",
          "So collect the full set of a competitor's active ads first, then look across them. Thirty ads analysed together will teach you more than three studied in depth.",
        ],
      },
      {
        id: "framework",
        h2: "A five-part framework for every ad",
        paras: ["Tag each ad with the same five fields so you can count and compare:"],
        list: [
          "Hook: how the first line or first three seconds grab attention (problem, result, offer, question, social proof, founder).",
          "Offer: discount, bundle, free gift, free shipping, trial, or none at all.",
          "Format: video, image or carousel, plus the style (UGC, studio, animation, before/after).",
          "Language: English, Hindi, Hinglish or a regional language. This shows which audience the brand is chasing.",
          "Call to action: Shop now, Learn more, Sign up. A shift here often signals a change of goal.",
        ],
      },
      {
        id: "longevity",
        h2: "Use longevity as your performance proxy",
        paras: [
          "Meta does not publish spend or results for commercial ads in India, so you cannot see what works directly. The best public proxy is how long an ad has been running. Brands cut losing ads quickly; an ad still live after 60 or 90 days is very likely profitable.",
          "Sort a rival's active ads by start date and study the oldest ones first. If the long-running ads share a hook or a format, that is the closest thing to a proven playbook you will get from public data.",
        ],
      },
      {
        id: "compare",
        h2: "Compare rivals side by side",
        paras: [
          "Once each rival is tagged the same way, put them next to each other. Who relies on discounts and who never discounts? Who is all video? Who is advertising in Hindi? Gaps are opportunities: if every rival leads with price, a proof-led or story-led angle can stand out.",
          "Industry benchmarks help too. Our industry pages show live format and language mixes for each D2C category, so you can see whether a rival is typical or unusual.",
        ],
      },
      {
        id: "to-decision",
        h2: "Turn analysis into a decision",
        paras: ["Finish with something your team can act on this week:"],
        list: [
          "One counter-offer to test against a rival's main offer.",
          "One hook or format to borrow (adapted, never copied) from a long-running rival ad.",
          "One gap to own: an audience, language or angle no rival is using.",
        ],
      },
    ],
    next: ["/guides/how-to-find-winning-ad-creatives", "/research/india-d2c-advertising-report-2026", "/industries"],
  },

  "how-to-monitor-competitor-ads": {
    slug: "how-to-monitor-competitor-ads",
    minutes: 6,
    tldr: [
      "Monitoring is about change: new launches, new offers, price changes and ads that stop.",
      "Check the same rivals on a fixed rhythm: weekly at minimum, daily during sales and launches.",
      "Track four signals: volume of new ads, new offers, longest-running ads and stopped ads.",
      "Automate it. Manual checks stop happening after a few weeks.",
    ],
    sections: [
      {
        id: "why",
        h2: "Why monitoring beats one-off research",
        paras: [
          "A one-off competitor deck is out of date within weeks. The useful questions are about change: what did they launch this week, did they change their offer, what did they switch off? A rival cutting its price or starting a bundle is something you want to know the same week, not at the next quarterly review.",
        ],
      },
      {
        id: "signals",
        h2: "The four signals to watch",
        paras: ["Keep monitoring narrow so it stays useful:"],
        list: [
          "New ads per week: a jump means a launch, a sale or a new campaign.",
          "Offer changes: a new discount level, a new bundle, a free gift, or an offer quietly removed.",
          "Longest-running ads: what keeps working, and whether it is still live.",
          "Stopped ads: what a rival gave up on. Often as telling as what they launched.",
        ],
      },
      {
        id: "rhythm",
        h2: "Set a rhythm you will keep",
        paras: [
          "Weekly is enough for most categories. Daily matters during big sale seasons, festive periods and when a direct rival is launching. Pick a fixed slot, such as Monday morning, and look at the same rivals in the same order every time so changes stand out.",
          "Write down one line per rival: 'no change', or what changed and what you will do about it. That habit is what turns monitoring into decisions.",
        ],
      },
      {
        id: "automate",
        h2: "Automate the boring part",
        paras: [
          "In practice, manual monitoring stops after a few weeks because it is tedious. Zooptrack reads every watched rival's ads every night, keeps the history, and gives you a ranked list of what changed with the ads as evidence. The rival report arrives by email daily or weekly at a time you choose, and big moves trigger an alert the same day.",
        ],
      },
    ],
    next: ["/guides/how-to-analyze-competitor-ads", "/competitor-ad-intelligence", "/pricing"],
  },

  "how-to-find-winning-ad-creatives": {
    slug: "how-to-find-winning-ad-creatives",
    minutes: 7,
    tldr: [
      "Public data cannot prove an ad 'wins', but longevity, versions and repetition are strong signals.",
      "Start with ads that have been active for 60+ days, then check how many versions exist.",
      "Look for the pattern behind the winners: hook, offer, format and language, not the exact visual.",
      "Adapt the pattern to your brand and test it; never copy a rival's creative.",
    ],
    sections: [
      {
        id: "what-winning-means",
        h2: "What 'winning' can mean in public data",
        paras: [
          "Only the advertiser knows an ad's real ROAS. From the outside you are inferring. The good news is that advertisers behave predictably: they keep spending on ads that make money and stop ads that do not. So the public signals of a winner are behavioural, not financial.",
        ],
      },
      {
        id: "signals",
        h2: "Three signals of a likely winner",
        paras: ["Look for ads that score on more than one of these:"],
        list: [
          "Longevity: still active after 60, 90 or 180 days. The longer, the stronger the signal.",
          "Versions: the brand has made several variations of the same concept, a sign they are scaling it.",
          "Repetition: the same hook or offer appears again in newer ads, meaning the idea has been promoted from test to template.",
        ],
      },
      {
        id: "find-them",
        h2: "How to find them quickly",
        ordered: true,
        paras: ["A fast routine that works for any category:"],
        list: [
          "List the active ads of 5 to 10 rivals.",
          "Sort by start date and keep the oldest 10 to 20 still-active ads.",
          "Tag each by hook, offer, format and language.",
          "Count which tags repeat across brands. Those repeating patterns are your shortlist.",
        ],
      },
      {
        id: "adapt",
        h2: "Adapt the pattern, not the ad",
        paras: [
          "Copying a rival's creative is a bad idea legally and commercially: their audience has already seen it, and it carries their brand. What transfers is the pattern underneath. If long-running ads in your category are UGC videos that open with a problem in Hindi and end with a bundle offer, test your own version of that structure with your product, your proof and your voice.",
          "Our research pages show the longest-running ads across Indian D2C right now, and each brand page shows a brand's own long-running ads, so you can start from evidence rather than guesswork.",
        ],
      },
    ],
    next: ["/research/d2c-ad-creative-trends-2026", "/guides/how-to-analyze-competitor-ads", "/brand"],
  },
};
