# Zooptrack AdSpy v30 — final interaction baseline

- Advertiser autocomplete is Meta-first using the public Meta Ad Library page search via a warm Playwright browser.
- The local advertiser index is queried in parallel for continuity and speed.
- Client prefix cache narrows previous Meta results immediately while the current prefix refreshes.
- The dropdown shows advertiser rows directly. It does not put "Search <query>" before advertisers.
- Exact phrase search is a fallback only when no advertiser is returned.
- Selecting an advertiser immediately sends its exact Page ID into AdSpy search.
- Search reads Supabase first and displays 25 creatives per page.
- Background Meta collection is independent and persists newly observed creatives in 25-ad batches.
- The user never sees crawler/job/persistence implementation details.
- AdSpy controls are blue/slate/white only; suggestion rows explicitly override legacy teal/green styles.
- Header/body/footer use lightweight depth/temporal effects; creative cards remain static.

Meta's public Ad Library is the supported public surface for current ad discovery. Meta's official Ad Library API has narrower documented availability for ordinary ads, so this build deliberately does not depend on paid search-provider credits.
