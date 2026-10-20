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
