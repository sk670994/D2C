# Zooptrack AdSpy v31 — final Meta-first interaction pass

Key fixes:
- Meta advertiser suggestions are collected by interacting with the public Meta Ad Library search box, not by assuming the page URL will expose the same typeahead state.
- Network responses and visible Meta suggestion DOM are both examined for advertiser page IDs.
- A warm Playwright browser/page session is reused per country so every character does not launch a fresh browser.
- Exact/prefix relevance filtering removes unrelated fuzzy advertisers.
- Supabase local advertiser discovery remains a parallel continuity/cache source.
- Search uses exact Page ID and 25-ad pages.
- The existing collection pipeline remains background/invisible.
- SearchBar missing ArrowUpRight runtime import is fixed.
- AdSpy suggestion/toolbar controls are explicitly white/slate/blue and old green/teal utilities are neutralized.
- Header/body/footer depth surfaces remain lightweight; cards stay static.
