# Zooptrack architecture (v2, 2026-09-28)

One rule: **collect once, store once, analyse once, serve many.**
Brand data is global. A thousand users watching Mamaearth read one copy of its
ads, one summary and one AI analysis. User actions never call a paid API
directly.

```
 ACQUISITION        SearchApi (Meta Ad Library)  ── primary
                    Playwright worker (PC/VPS)   ── fallback, same queue
        │
 QUEUE              adspy_requests (Postgres, atomic claim, retries, leases)
        │           drained by /api/adspy/drain on Vercel
        │
 DATA ENGINE        Meta node → CompetitorAd (one mapper for every source)
                    → dedupe by ad_archive_id → creatives / observations /
                      markets / languages → media (stored once per ad)
        │
 SERVING            today_cache + advertiser summaries (shared, TTL)
                    → Today, AdSpy, Brand pages, Monday report
        │
 INTELLIGENCE       Gemini decoding (structured labels), idle time in drain
                    + nightly cron
```

## Phase 1: done in this branch (zooptrack-searchapi)

- `lib/ad-intelligence/sources/searchapi-meta.ts`: SearchApi client. POST with the
  page token in the JSON body (their recommendation for long tokens), page ID
  or keyword, active/all, newest first, per-collection call cap, deadline,
  optional incremental stop. Brand name resolves to one exact Meta page (never a
  guess); ambiguous names are filtered to advertisers carrying the name.
- `lib/ad-intelligence/meta/node-to-ad.ts`: the Meta node mapper now shared by
  Playwright and SearchApi. Same `external_ad_key` (`meta:<ad_archive_id>`), so
  switching sources creates no duplicates.
- `ADSPY_COLLECTOR=searchapi`: requests are still rows in `adspy_requests`
  (same state machine as the worker). `/api/adspy/drain` claims and runs them on
  Vercel (answers at once, works in `after()`, 300 s), then spends idle time on
  AI decoding. It is kicked right after a user queues a brand, by a nightly cron
  (02:15 IST, after the tracked refresh enqueues), and by the 30-minute GitHub
  health workflow.
- Health check no longer expects a PC worker in SearchApi mode.
- `scripts/ops/searchapi-benchmark.ts`: read-only proof of concept (counts vs
  Meta, field coverage, calls, speed, overlap with our data, cost).
- Refresh never re-downloads media we already store (previous branch).

Switch-over: benchmark → `SEARCHAPI_API_KEY` + `ADSPY_COLLECTOR=searchapi` in
Vercel → redeploy → stop the PC worker. Roll back by setting
`ADSPY_COLLECTOR=worker` and starting the worker again.

## Phase 2: storage and AI hygiene (next)

1. **Media to Cloudflare R2** (10 GB free, no egress fees). Key = content hash,
   so one image is stored once no matter how often the ad reappears. Keeps
   Supabase on the Free plan (1 GB storage).
2. **AI ledger**: every Gemini call records model, prompt version, tokens,
   latency, cost. Re-analyse only rows below the current `analysis_version`.
3. **Decoding fully serverless** (drain idle time + nightly cron already do it;
   the PC becomes unnecessary).

## Phase 3: change intelligence

- Ad versions: store a new version only when copy / offer / media hash changes
  (not a snapshot per night). Feeds "what changed" on Today and the Monday
  report ("Mamaearth moved from 20% off to Buy 2 Get 1").
- Landing pages: fetch the ad's link once, extract offer and price, compare
  with the ad's promise.

## Phase 4: semantic search (when search usage justifies it)

- Embeddings in pgvector (HNSW) over the structured labels + copy, hybrid with
  Postgres full text, optional reranker for the top 50.
- Needs more database compute than the Free plan; decide with real query
  volume, not before.

## Deliberately not now

- A second database, Kafka, Elasticsearch, a vector SaaS, Kubernetes.
- Moving the queue to pgmq: `adspy_requests` already gives durable,
  atomic, retryable jobs; rewriting it buys nothing yet.
- An LLM "decision layer" vendor (e.g. Jev) for routing. Start with
  deterministic rules (new ad? changed? watched brand?) and one cheap Gemini
  call; add a routing model only if the AI bill shows it would pay back.
- Calling SearchApi on autocomplete or search: those read our own index.

## Cost at launch scale (check current prices before committing)

| Item | Plan | Why |
|---|---|---|
| SearchApi | Developer, 10k calls/month | ~60 calls per brand per month → ~150 tracked brands |
| Supabase | Free (stay) | R2 takes the media; cache keeps reads light |
| Cloudflare R2 | Free tier | media |
| Gemini | usage | one analysis per ad, globally shared |
| Vercel | current plan | drain runs inside normal function limits |
