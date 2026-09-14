# AdSpy v27 — Free Meta-first collection

No SearchAPI credits are required.

Flow:
- suggestions: Supabase advertiser index, fast local ranking
- advertiser selection: exact Meta Page ID
- ads: 25 persisted creatives per page
- background Meta public Ad Library collection: Playwright
- collector emits/persists every 25 newly observed creatives while crawling
- pages are DB-backed, so Page 2/3/etc. become available as real ads arrive
- stale jobs older than 3 minutes no longer block a new collection
- the UI never fabricates the Meta total
- detailed ad fields remain available in Inspect
- analysis/history remain below the grid
- blue/slate palette; legacy green/teal utilities are hard-neutralized
