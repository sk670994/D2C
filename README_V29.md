# AdSpy v29

Architecture:
- Direct public Meta Ad Library lookup for advertiser suggestions (Playwright; no SearchAPI).
- Local advertiser index queried in parallel for speed/caching.
- Strict relevance filtering.
- Exact Meta Page ID passed into search.
- Indexed Supabase results shown immediately, 25/page.
- User action silently starts/reuses background Meta collection.
- New creatives persist in 25-ad batches.
- Cards remain static/visual-first.
- Inspect contains full creative details.
- Lightweight 3D header, body signal plane, and spatial/temporal footer.
- Blue/slate only; no green/teal control palette.

Performance intent:
- Keep the browser-facing interaction in a Client Component.
- Keep auth and sensitive browser automation server-side.
- Avoid a full WebGL scene; Motion/CSS transform-based depth is used instead.
