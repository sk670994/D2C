# AdSpy v19 final UX pass

## User experience
- Smaller search controls and Search CTA.
- Exact advertiser selection remains an immediate Page-ID search.
- Suggestion panel stays above all result layers.
- Entire creative card is inspectable, but card itself has no hover/entrance animation.
- Removed Show more from cards; copy is visible on the card and the inspection surface contains all available fields.
- Media has direct-first loading with a same-request-path server proxy fallback for supported Meta/Instagram media hosts.
- Close/play icons are fixed SVG assets.

## Motion
- 3D hero + 3D atmospheric background remain.
- KPI digits + depth remain.
- Joke/research pulse has pointer-reactive 3D and 6.2s dwell.
- Creative depth reel uses parallax/cover-stack motion with already-loaded thumbnails; static card surfaces remain stable for scanability.
- Reduced-motion media query is respected.

## Latency
- Autocomplete remains debounced at 90ms with prefix cache.
- Media proxy is only used after a direct image fails, so healthy images do not pay the proxy round-trip.
- Creative cards do not run Framer Motion.
- No WebGL/Three.js dependency is added.
- Existing Meta collector remains quick-first, deep-background and 50-ad chunk persistence.

## Data integrity
- No fake Meta result counts are shown.
- The production UI only reports records actually indexed by Zooptrack.
