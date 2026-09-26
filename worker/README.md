# AdSpy collection worker (VPS)

One small server runs Chromium for AdSpy. Vercel only serves the app,
search and status, and writes collection requests into Postgres.

```
User search ──> Vercel API ──> Postgres read (fast, never waits for a scraper)
                     │
                     └─ stale/missing data ──> INSERT adspy_requests (queued)
                                                     │
                         VPS worker ── polls, claims (row lock + lease) ──┘
                              │
                              ├─ Playwright → public Meta Ad Library (JSON first, DOM fallback)
                              ├─ normalize → dedupe (platform + external_ad_key, DB unique)
                              ├─ batch upsert → observations, versions, markets, languages
                              ├─ media → Supabase Storage (bounded, best effort)
                              └─ advertiser summary refresh → complete request
```

There is no Redis. `adspy_requests` already is a durable queue with leases,
heartbeats, `max_attempts`, backoff and a reaper. Adding Redis would create
a second source of truth for the same state.

## 1. Server

- Any VPS with 2 vCPU / 4 GB RAM / 40 GB SSD, Ubuntu 24.04 LTS.
  Cheapest known option (Sep 2026): Hetzner CX23, 2 vCPU / 4 GB, about €5.49/month
  in Germany/Finland. DigitalOcean, Vultr or Lightsail 4 GB machines cost more
  (roughly $20–25/month). The worker is not latency-sensitive: every step
  talks to Meta and Supabase over the internet, so pick on price and reliability.
- Open only SSH (22). The health port stays on localhost.

## 2. Install (once)

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# Code
git clone https://github.com/sk670994/D2C.git && cd D2C

# Secrets (service role key: Supabase → Project settings → API)
cp worker/env.example worker/.env
nano worker/.env        # paste SUPABASE_SERVICE_ROLE_KEY
chmod 600 worker/.env

# Build and start (restarts automatically after crashes and reboots)
docker compose -f worker/docker-compose.yml up -d --build
```

Then, in Vercel → Project → Settings → Environment Variables, add
`ADSPY_COLLECTOR=worker` (Production) and redeploy. From then on the app only
writes requests; the Vercel Queue consumer is no longer used for new work.

To roll back: remove `ADSPY_COLLECTOR` in Vercel and redeploy. The Vercel
Queue path is unchanged and takes over again.

## 3. Monitor

```bash
curl -s localhost:8787/healthz | jq          # alive, browser, rss, tmp, last job, errors
docker compose -f worker/docker-compose.yml logs -f --since 30m   # JSON lines
docker stats --no-stream
```

From anywhere (Supabase SQL editor):

```sql
select * from adspy_ops_status;              -- queue depth, oldest waiting, failures, live workers
select worker_id, heartbeat_at, stats->>'jobsProcessed', stats->'lastError'
from adspy_workers order by heartbeat_at desc;
```

Log events: `worker_start`, `job_start`, `job_done`, `job_failed` (with
`errorCode`), `browser_recycled`, `reaper`, `tmp_low`, `queue_poll_failed`.

Alert when: `live_workers = 0`, `oldest_waiting_sec > 900`,
`failed_24h > completed_24h`, or `tmp_low` appears in the logs.

## 4. Recover

| Symptom | Action |
|---|---|
| Worker down / unhealthy | `docker compose -f worker/docker-compose.yml restart` |
| Stuck job | Nothing: the lease expires, the reaper retries it (max 2 attempts), then it fails cleanly |
| Disk filling | Worker cleans its own `/work/tmp`; logs are capped at 100 MB; `docker system prune -f` for old images |
| Meta blocking / extractor broken | Circuit breaker pauses 10 min after 5 source failures, then probes once |
| Deploy new code | `git pull && docker compose -f worker/docker-compose.yml up -d --build` |
| Emergency stop | `docker compose -f worker/docker-compose.yml stop` (requests stay queued; nothing is lost) |

## 5. Guarantees and limits

- One Chromium, one job at a time, restarted every 15 jobs or above 1.2 GB RSS.
- Every job has a lease that the heartbeat renews every 15 s. A worker
  that dies leaves a lease that expires and is retried. A duplicate delivery
  cannot run twice, because the claim is a row lock plus a status check in SQL.
- Existing ads are never deleted by a failed collection.
- Public, logged-out Ad Library pages only. No login, no cookies, no CAPTCHA
  solving, and no proxies until measurements show they are needed.
