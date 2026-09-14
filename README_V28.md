# Zooptrack AdSpy v28

Free Meta-first AdSpy path.

- No SearchAPI credits.
- Local advertiser index is the fast path.
- Local suggestions are strictly filtered; unrelated trigram matches such as Coldplay for `colga` are rejected.
- When no relevant local advertiser exists, the server performs a bounded public Meta Ad Library lookup using Playwright.
- Selecting an advertiser keeps its exact Meta Page ID.
- Meta collection continues through the existing public Playwright collector.
- 25-ad pages.
- Collection persists newly observed creatives in 25-ad chunks.
- Stale collection jobs are recoverable.
- Search/toolbar controls are explicitly slate/blue; teal/green legacy utility styling is overridden inside AdSpy.
- No per-card motion.
- Inspect remains the detailed information surface.

Public-source lookup is intentionally bounded and ordinary-browser based. It does not attempt to bypass Meta access controls or anti-bot systems.
