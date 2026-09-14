# AdSpy v16

This pass adds a product-level 3D interaction layer while keeping the existing data architecture intact.

## Search / latency
- Autocomplete debounce reduced to 90ms.
- Previous prefix suggestions can render immediately while the current query is being refreshed.
- Exact advertiser selection remains an immediate Page-ID search.
- Suggestion panel is bounded to a viewport and isolated above the result stack.
- The browser still only fetches autocomplete while typing; search/collection remain separate.

## 3D
- Existing 3D hero remains.
- KPI cards retain animated digits + depth.
- Joke pulse is pointer-reactive and uses 6.2s dwell per item.
- New React Bits-style parallax creative reel uses already loaded creative thumbnails only.
- Creative cards keep Skiper-style reveal + depth.
- Animmaster progressive copy disclosure remains.

## Meta collection
- The UI still never fabricates a public-site count.
- The existing Meta provider uses quick-first collection and a larger deep pass; its collector processes persisted ads in 50-ad chunks.
- A public-site count such as ~980 is only displayed when Zooptrack's authorized collection source has actually discovered/persisted that many records.
