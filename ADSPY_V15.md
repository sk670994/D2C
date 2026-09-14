# AdSpy v15 — interaction + latency architecture

## User flow
- Typing remains autocomplete-only.
- Selecting an advertiser is an immediate exact Page ID search; it should not require clicking Search again.
- Search returns the currently indexed first page immediately.
- Collection remains a background job; persisted records are processed in chunks and page navigation stays at 36 creatives per page.
- The Meta provider already has a quick-first/deep-second collection model and configurable deep targets. v15 does not fake a Meta result count.

## UI
- Search controls are smaller.
- Search CTA is now a compact "Search" control.
- Duplicate filter row below the KPI area is removed; the toolbar owns filters.
- Creative cards are clickable on non-control surfaces and retain working play/source/inspect controls.
- Research Pulse is replaced by a 3D pointer-reactive joke/market pulse.
- 7 jokes + 1 market note + 1 Zooptrack note, 6.2 seconds per item.
- Existing React Bits / Vengeance / Skiper / Animmaster patterns remain in the experience.

## Performance
- Autocomplete client debounce remains 120 ms.
- Suggestion list is capped to a bounded viewport.
- Search page remains 36 records.
- The animation layer uses transform/opacity and avoids per-frame layout measurement except animated digit height initialization.
- No WebGL dependency is added.

## Provider reality
Meta's official Ad Library API exposes cursor pagination, but its documented availability is broader for political/social-issue ads worldwide and for all ad types in the UK/EU within the prior year. The public Ad Library UI is broader. The existing Zooptrack Meta provider uses Playwright-based collection for the public library and already processes persisted ads in chunks. Full parity with a public-site count such as ~980 should only be represented when the authorized collection source actually discovers and persists that many creatives.
