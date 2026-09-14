# AdSpy v13 — search/collection architecture

The user-facing flow is now intended to be:
1. Type: autocomplete only, debounced 120ms with a small client cache.
2. Select an advertiser: immediately submit exact advertiser + Meta Page ID.
3. Render the existing indexed first page immediately.
4. If the index is empty/stale, the existing collection job is triggered in the background with that exact Page ID.
5. Pagination remains server-driven at 36 creatives/page; page navigation never requests thousands of creatives at once.

The official Meta Ad Library API exposes cursor-based `paging.next`, but its documented API coverage is limited: political/social-issue ads worldwide for 7 years and ads of any type delivered to the UK/EU in the past year. The public Ad Library site is broader. Therefore the production pipeline must treat an external authorized provider/browser collection source as a provider behind the same job interface when India commercial coverage beyond the official API is required. Never synthesize the Meta result count.
