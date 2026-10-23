# ZoopLens Meta Ad Library search fix

This is a **local source-code patch installer** for `sk670994/D2C`. Installing it does not push to GitHub, deploy to Vercel, contact Meta, alter Supabase data, or apply database migrations. Once deployed, the explicit/live lookup contacts Meta and persists public page metadata through the existing advertiser-upsert RPC.

## What it changes

- Keeps normal typing on the fast, indexed path, then automatically attempts one live Meta page lookup when the user pauses on a name with no indexed matches. The explicit **Find matching pages on Meta** action also remains available when indexed results exist; it does not open a browser for every keystroke.
- Merges public Meta Page candidates with indexed advertisers, retains different Page IDs even if their display names match, and persists live page metadata through the repository's existing advertiser-upsert RPC.
- Reads Meta's result total without assuming the `count` JSON property is first in the object.
- When Meta reports “no next page” before a **known** total is reached, performs a bounded re-trigger for additional pages. If no new ads arrive, it stops and keeps the run marked partial; it never declares an unknown-total scan complete.
- Shows the user a partial/quick-read message instead of falsely claiming complete coverage when `completed_at` is null. Gives long-running worker jobs a 45-minute polling cap.
- Logs per-brand discovered/normalized/persisted counters on future prefill runs.
- Retries transient S3-compatible upload errors (including HTTP 500) up to three total attempts; it does not retry permanent 4xx failures.
- Adds focused tests for Meta count parsing and storage retries.

No schema change is required: page records go through the existing `adspy_upsert_advertiser_v2` RPC. The installer backs up every existing file it changes and preflights all patch anchors before it writes anything. If your local files have diverged, it stops without writing.

## Apply on Windows

1. Extract `ZoopLens-Meta-Search-Complete-Fix.zip` into `F:\D2C` (the folder containing `package.json`). Keep the included installer and README in the repo root.
2. Open PowerShell in `F:\D2C` and run:

   ```powershell
   python .\apply_zooplens_meta_search_fix.py
   ```

3. Review the changes and backups, then run:

   ```powershell
   git diff --check
   npx vitest run lib/ad-intelligence/meta/library-json-count.test.ts lib/media/r2.test.ts
   npm run build
   ```

4. Do not start another long collection unless the focused tests and build pass. When ready, deploy the code through your normal Git/Vercel workflow. A successful build does not mean the live Meta lookup is guaranteed to return results from every hosting IP; the UI gracefully falls back to name search and the background collector when Meta blocks a live lookup.

## End-to-end smoke test after deploying

- Type a known brand and confirm indexed suggestions still appear quickly.
- Type an unfamiliar brand (at least three characters), click **Find matching pages on Meta**, and verify that returned pages show their Meta source/profile fields.
- Select one exact page and search. Confirm the URL/request uses that Page ID.
- Test a brand with no indexed ads. Confirm search-after kicks off or joins collection, persisted counts update, and a partial read is not labelled as a complete library.
- Confirm an object-storage HTTP 500 is retried, and inspect logs for final failures.

The live Meta page lookup is explicit and rate-limited. It is still subject to Meta's availability, anti-automation checks, and the hosting environment's browser setup; the patch does not claim to bypass those controls.
