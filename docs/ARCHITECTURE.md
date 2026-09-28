# Zooptrack architecture (v2.2, 2026-09-28)

One rule: **collect once, store once, analyse once, serve many.**
Brand data is global: a thousand users watching Mamaearth read one copy of its
ads, one summary and one AI analysis. User actions never call a paid API.

```
 ACQUISITION   ScrapeCreators | SearchApi (Meta Ad Library, on Vercel)
               Playwright worker (PC/VPS) ── fallback, same queue
      │
 QUEUE         adspy_requests (Postgres; atomic claim, retries, leases)
      │        drained by /api/adspy/drain (kick on request, nightly cron, 30-min GitHub)
      │
 DATA ENGINE   Meta node → CompetitorAd (one mapper, every source; same ad keys)
               → creatives / markets / languages / versions (trigger, content hash)
               → images: one small WebP per ad, content-hash key, R2 (Supabase fallback)
      │
 AI LAYER      Jev    : labels ad copy on every ad; offer-vs-page judgement
               Gemini : image read only for triaged ads (watched, 7+ days live, launches)
               Jina   : landing pages → text → prices + offers
               ai_calls ledger: every call's tokens, latency, estimated cost
      │
 SERVING       today_cache + summaries (shared, 15 min) → Today, brand pages,
               Changed moves + alerts, Monday report, Ad finder (label search)
```

## Built

| Area | Where | Notes |
|---|---|---|
| API sources | `lib/ad-intelligence/sources/{searchapi,scrapecreators}-meta.ts` | One paging loop, one mapper. `ADSPY_META_SOURCE` picks; ScrapeCreators by default when its key is set. |
| Serverless collector | `lib/ad-intelligence/jobs/drain.ts`, `app/api/adspy/drain` | 202 + `after()`, 300 s; collect → AI labels → landing pages in idle time. |
| Jev labels + triage | `lib/ai/jev.ts`, `lib/decode/jev-labels.ts`, `lib/decode/run.ts` | Rubric per taxonomy value; labels below 0.6 confidence stay "unclear". Gemini result wins unless Jev ≥ 0.8. Without `TYPESAFE_API_KEY`: previous behaviour (Gemini on every ad). |
| AI ledger | `lib/ai/ledger.ts`, table `ai_calls`, view `ai_spend_daily` | Prices via env; `aiSpend24h` in ops-health. |
| R2 media | `lib/media/r2.ts` (SigV4, no SDK; tested against AWS's example), `scripts/ops/media-to-r2.ts` | Content-hash keys: identical images stored once. |
| What changed | `lib/today/changes.ts` + versions table | Offer / price / CTA / headline / landing / copy; noise rules (no empty→filled, word overlap < 75%, no tracking params). "Changed" move on Today; offer/price changes alert. |
| Landing pages | `lib/landing/{reader,check}.ts`, tables `landing_pages`, `ad_landing_checks` | Weekly per page, watched brands only; prices + offer types; Jev judges "page shows the ad's deal?". |
| Ad finder | `/today/finder`, `app/api/ad-intelligence/finder` | Structured search over AI labels (GIN index); cached 10 min; never calls a paid API. |

## Next

- Semantic search (embeddings in pgvector + Jina reranker) once finder usage
  shows people search by meaning, not labels. Needs more DB compute than Free.
- Video: hook transcript of the first seconds (Gemini) for watched brands.
- Admin page for AI spend and source credits.

## Not now

- Second database, Kafka, Elasticsearch, vector SaaS, Kubernetes.
- Rewriting the queue to pgmq (adspy_requests already does the job).

## Cost at launch scale (check prices before committing)

| Item | Plan |
|---|---|
| ScrapeCreators | $47 / 25,000 credits, never expire (SearchApi: $40/month alternative) |
| Supabase | Free (stay; images on R2) |
| Cloudflare R2 | Free tier (10 GB) |
| Jev | ~100k ads × ~1k tokens (with rubric) ≈ 100M tokens ≈ $4 |
| Gemini | only triaged ads |
| Jina Reader | free (20/min without key, more with a free key) |
