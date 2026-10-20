# Dependency maintenance

Run these on the laptop (the build sandbox cannot reach the npm registry):

```bash
npm install                 # syncs package-lock.json with package.json -- commit the lockfile
npm audit --omit=dev        # production vulnerabilities only
npm outdated                # what has newer versions
npm run build && npm test   # confirm nothing broke
```

Do this after any change to `package.json`, and at least once a month.

## Removed in Pack H (2026-10-19) and why

| Package | Why it was removed |
| --- | --- |
| `xlsx` | Only used by `lib/excel/parser.ts`, which nothing imported (deleted too). The npm `xlsx` 0.18.5 also has known unpatched advisories. |
| `clsx` | Never imported. `lib/utils.ts` has its own `cn()` helper. |
| `tailwind-merge` | Never imported. |
| `motion-utils` | Never imported directly; `framer-motion` brings its own copy. |
| `@vercel/speed-insights` | `<SpeedInsights />` was never rendered, so it collected nothing. |
| `cross-env` (dev) | Not used by any npm script, CI workflow or PowerShell script. |
| `ts-node` (dev) | Not used; scripts run with `tsx`. |

## Changed in Pack H

- `server-only` added (`0.0.1`): many server files import it; it was only present by accident through Next.
- `react` / `react-dom` moved from exact `19.2.0` to `^19.2.1` (the patched 19.2.x line).
- `playwright-core` pinned to exactly `1.59.1` so it matches the Chromium 147 build shipped by `@sparticuz/chromium-min@147.0.2`. When you bump one, bump the other to the matching pair.
- `zooptrack-3d-package/` is excluded from type-check and lint; it is a legacy standalone package, not part of the app.

## Live look-ups (Pack I)

When a person searches a brand we don't hold, hold incompletely (< 90% of
Meta's live count) or haven't fully read in 24 h, Vercel reads it live from
the Meta Ad Library through ScrapeCreators (paid credits). Ads appear in the
page as they are saved ("Reading live from Meta… N of M ads", then
"Complete"). A brand that is complete and fresh costs nothing. Keyword
searches stay a quick 2-page look.

Vercel environment (Production):

| Variable | Value |
| --- | --- |
| `ADSPY_COLLECTOR` | `searchapi` (collect on Vercel through the drain route) |
| `ADSPY_META_SOURCE` | `scrapecreators` |
| `SCRAPECREATORS_API_KEY` | your key (Sensitive) |
| `ADSPY_DAILY_CREDIT_CAP` | `400` (all users together, per IST day) |
| `ADSPY_LOOKUP_MAX_PAGES` | `60` (one brand's full read, 1 credit per page, ~30 ads each) |
| `ADSPY_PAID_CREDIT_FLOOR` | `1000` (paid reads stop at this balance) |
| `ADSPY_PAID_CREDIT_START` | balance shown in the ScrapeCreators dashboard when you set this, e.g. `5705` (fallback only) |
| `ADSPY_PAID_CREDIT_START_AT` | when you read that balance, ISO, e.g. `2026-10-22T09:00:00+05:30` (fallback only) |
| `ADSPY_NIGHTLY_ON_PC` | `1` |
| `CRON_SECRET` | already set (the drain route needs it) |

Credit floor: ScrapeCreators responses report `credits_remaining` (check the
first live look-up's log or the Operations panel says "reported by the API");
each paid collection saves the last value in `adspy_requests.result.creditsRemaining`
and calls billed after it are subtracted. Before any paid call (and between
pages) the balance is checked: at or below `ADSPY_PAID_CREDIT_FLOOR` nothing
more is bought, the look-up says "Queued for tonight" and the laptop's free
run collects the brand. Until a first balance has been seen, the fallback is
`ADSPY_PAID_CREDIT_START` minus credits we counted since
`ADSPY_PAID_CREDIT_START_AT`; with neither, only the daily cap applies. The
founder dashboard (Operations) shows the credits left. To resume live
look-ups, top up ScrapeCreators: the next response reports the new balance.

What spends credits — only people's look-ups:

- Vercel crons do not: `refresh-tracked-adspy` exits at once with
  `ADSPY_NIGHTLY_ON_PC=1`; `decode-ads`, `ops-health`, `rival-alerts` start no
  collection. With `ADSPY_NIGHTLY_ON_PC=1` the drain route also skips any
  queued request that is not a person's look-up (`paidLookup`), leaving it
  for the laptop.
- The laptop's nightly run (`worker/run-prefill.ps1`) forces
  `ADSPY_META_SOURCE=playwright` and `ADSPY_COLLECTOR=worker`: free browser
  collection, never credits.

Big brands: the drain reads 30 pages per slice (~100 s) and queues a
continuation that the same or a fresh drain invocation picks up, up to
`ADSPY_LOOKUP_MAX_PAGES` in total. Typical brands (< 300 live ads) finish in
30–90 s; a 1,800-ad brand takes about 3 minutes.

Images: paid reads save Meta's CDN links first (they last days). Copies to
our storage are made in the drain's idle time (40 ads per idle drain) and in
full by the laptop's nightly run (`ADSPY_DEFER_MEDIA=1` copy pass), so every
image is rehosted before Meta's link expires. They are not copied inline:
that would hold each save for the image downloads.
