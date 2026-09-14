# AdSpy Refinement v23

This is the performance/refinement pass after reviewing the current React Bits, Vengeance UI, Skiper UI, Next.js 16 and Supabase guidance.

## Product principles
- Fast path is always local/indexed data first.
- Search and collection have separate clocks.
- Cards are stable for scanning; high-motion interactions are reserved for hero/selected-content surfaces.
- Blue/slate is the only primary accent family in the AdSpy refinement layer.
- No fabricated result counts.

## Latency changes
- 15-second in-memory browser-side search cache, bounded to 12 entries.
- Existing request cancellation is preserved.
- Background collection first poll reduced from 1200ms to 450ms, then backs off to a 3.2s ceiling.
- Exact advertiser/Page ID is preserved through refresh polling.
- Autocomplete remains low-debounce and has prefix reuse.
- Added a database migration with prefix-first, fuzzy-fallback ranking and expression indexes.

## Why no Cache Components switch
Next.js 16 Cache Components (`cacheComponents`, `use cache`, `cacheTag`) is powerful for static/cached server data, but AdSpy's authenticated request/session path and live collection state should not be moved into a broad cache without a controlled data boundary. The refinement keeps caching at the search/DB boundaries where the inputs are explicit.

## Motion
- Creative cards are static for comparison/scanning.
- Existing 3D hero, joke pulse, KPI number motion and creative-depth reel remain.
- The animation budget is therefore concentrated on interaction surfaces, not 36 simultaneous cards.
